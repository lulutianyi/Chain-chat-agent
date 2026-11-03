"""找回密码：邮箱验证码 → 一次性重置令牌 → 设置新密码 → 重新登录。"""

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main as main_module
from app.database import Base, get_db
from app.main import app
from app.models import PasswordResetChallenge
from app.ratelimit import limiter
from app.seed import seed_demo_data, seed_merchant_account
from app.services import mailer
from app.services.mailer import MailDeliveryError, build_password_reset_message

EMAIL = "admin@liantan.local"
NEW_PASSWORD = "NewShop456"


def make_client(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    session = factory()
    merchant = seed_merchant_account(session)
    seed_demo_data(session, merchant.id)
    session.close()

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(main_module.settings, "smtp_host", "smtp.test.local")
    monkeypatch.setattr(main_module.settings, "smtp_from", "no-reply@test.local")
    sent: list[dict] = []

    def fake_send(*, to_email: str, code: str, ttl_minutes: int, reset_url: str):
        sent.append({"to_email": to_email, "code": code, "ttl_minutes": ttl_minutes, "reset_url": reset_url})

    monkeypatch.setattr(main_module, "send_password_reset_code", fake_send)
    return TestClient(app), sent, factory


@pytest.fixture(autouse=True)
def reset_state():
    limiter.reset()
    yield
    app.dependency_overrides.clear()
    limiter.reset()


def request_code(client: TestClient, email: str = EMAIL):
    return client.post("/api/auth/merchant/forgot-password", json={"email": email})


def verify_code(client: TestClient, code: str, email: str = EMAIL):
    return client.post("/api/auth/merchant/forgot-password/verify", json={"email": email, "code": code})


def test_unknown_email_gets_same_generic_response_without_sending(monkeypatch):
    """未绑定邮箱不能暴露「这个邮箱不存在」，也不能真的发信。"""
    client, sent, _ = make_client(monkeypatch)
    response = request_code(client, "nobody@example.com")
    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert sent == []


def test_full_reset_flow_forces_a_fresh_login(monkeypatch):
    client, sent, _ = make_client(monkeypatch)
    # 先登录拿一个旧令牌；重置后它必须失效。
    login = client.post("/api/auth/merchant/login", json={"account": "admin", "password": "链谈Agent123"})
    assert login.status_code == 200
    old_token = login.json()["access_token"]

    requested = request_code(client, EMAIL.upper())
    assert requested.status_code == 200, requested.text
    assert len(sent) == 1
    assert sent[0]["to_email"] == EMAIL
    assert len(sent[0]["code"]) == 6
    code = sent[0]["code"]

    wrong = "000000" if code != "000000" else "111111"
    assert verify_code(client, wrong).status_code == 400

    verified = verify_code(client, code)
    assert verified.status_code == 200, verified.text
    reset_token = verified.json()["reset_token"]
    assert reset_token

    # 验证码只能用一次。
    assert verify_code(client, code).status_code == 400

    # 弱密码被拒绝，且令牌不被消耗。
    weak = client.post("/api/auth/merchant/forgot-password/reset", json={"reset_token": reset_token, "new_password": "short1"})
    assert weak.status_code == 422

    reset = client.post("/api/auth/merchant/forgot-password/reset", json={"reset_token": reset_token, "new_password": NEW_PASSWORD})
    assert reset.status_code == 200, reset.text

    # 重置令牌一次性。
    again = client.post("/api/auth/merchant/forgot-password/reset", json={"reset_token": reset_token, "new_password": "Another789"})
    assert again.status_code == 400

    # 旧令牌被吊销，旧密码失效，新密码可以重新登录。
    stale = client.get("/api/merchant/profile", headers={"Authorization": f"Bearer {old_token}"})
    assert stale.status_code == 401
    old_login = client.post("/api/auth/merchant/login", json={"account": "admin", "password": "链谈Agent123"})
    assert old_login.status_code == 401
    new_login = client.post("/api/auth/merchant/login", json={"account": "admin", "password": NEW_PASSWORD})
    assert new_login.status_code == 200
    assert new_login.json()["access_token"]


def test_code_is_invalidated_after_too_many_attempts(monkeypatch):
    client, sent, _ = make_client(monkeypatch)
    assert request_code(client).status_code == 200
    code = sent[0]["code"]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert verify_code(client, wrong).status_code == 400
    # 达到次数上限后，即使验证码本身正确也不能再用。
    assert verify_code(client, code).status_code == 400


def test_expired_code_cannot_be_verified(monkeypatch):
    client, sent, factory = make_client(monkeypatch)
    assert request_code(client).status_code == 200
    code = sent[0]["code"]
    with factory() as db:
        challenge = db.scalar(select(PasswordResetChallenge))
        assert challenge is not None
        challenge.expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()
    assert verify_code(client, code).status_code == 400


def test_smtp_not_configured_returns_503_instead_of_exposing_code(monkeypatch):
    client, sent, _ = make_client(monkeypatch)
    monkeypatch.setattr(main_module.settings, "smtp_host", None)
    response = request_code(client)
    assert response.status_code == 503
    assert "邮件服务未配置" in response.json()["detail"]
    assert sent == []


def test_delivery_failure_removes_challenge_and_returns_503(monkeypatch):
    client, _, factory = make_client(monkeypatch)

    def failing_send(**kwargs):
        raise MailDeliveryError("smtp down")

    monkeypatch.setattr(main_module, "send_password_reset_code", failing_send)
    response = request_code(client)
    assert response.status_code == 503
    with factory() as db:
        assert db.scalar(select(PasswordResetChallenge)) is None


def test_reset_email_contains_code_and_reset_link(monkeypatch):
    # 其他测试会 cache_clear() settings，mailer 重新取到的是新对象；
    # 这里直接替换 mailer 的配置读取，避免依赖缓存对象身份。
    monkeypatch.setattr(mailer, "get_settings", lambda: SimpleNamespace(smtp_from="no-reply@test.local", smtp_username=None))
    message = build_password_reset_message(
        to_email="owner@example.com",
        code="123456",
        ttl_minutes=10,
        reset_url="https://example.com/forgot-password?email=owner%40example.com",
    )
    assert "123456" in message.get_body(preferencelist=("plain",)).get_content()
    assert "https://example.com/forgot-password" in message.get_body(preferencelist=("plain",)).get_content()
    html_body = message.get_body(preferencelist=("html",)).get_content()
    assert "123456" in html_body
    assert "10 分钟" in html_body


def test_smtp_sender_uses_starttls_and_puts_code_in_message(monkeypatch):
    captured: dict = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            captured["connection"] = (host, port, timeout)

        def ehlo(self):
            captured["ehlo"] = captured.get("ehlo", 0) + 1

        def starttls(self):
            captured["starttls"] = True

        def login(self, username, password):
            captured["login"] = (username, password)

        def send_message(self, message):
            captured["message"] = message

        def quit(self):
            captured["quit"] = True

    config = SimpleNamespace(
        smtp_host="smtp.test.local",
        smtp_port=587,
        smtp_username="mailer@test.local",
        smtp_password="secret",
        smtp_from="no-reply@test.local",
        smtp_starttls=True,
        smtp_ssl=False,
        smtp_timeout_seconds=5,
    )
    monkeypatch.setattr(mailer, "get_settings", lambda: config)
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)

    mailer.send_password_reset_code(
        to_email="owner@example.com",
        code="654321",
        ttl_minutes=10,
        reset_url="https://example.com/forgot-password",
    )

    assert captured["connection"] == ("smtp.test.local", 587, 5)
    assert captured["starttls"] is True
    assert captured["login"] == ("mailer@test.local", "secret")
    assert captured["quit"] is True
    assert "654321" in captured["message"].get_body(preferencelist=("plain",)).get_content()
