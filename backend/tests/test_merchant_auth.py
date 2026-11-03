"""商家端（采购方）注册 / 登录 / 取码的回归测试。

背景：用户报「输入账号密码后报密码错误」「取码与注册返回 not found」。
排查后确认接口本身是通的，问题在于失败原因无法分辨，以及账号匹配过严：
手机键盘会把首字母大写，admin 变成 Admin 就只会得到一句「账号或密码错误」。
这里把这几条口径固定下来，避免以后改回去。
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.ratelimit import limiter
from app.seed import seed_demo_data, seed_merchant_account

GOOD_LOGIN = {"account": "admin", "password": "链谈Agent123"}


def make_client(monkeypatch) -> TestClient:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    merchant = seed_merchant_account(session)
    seed_demo_data(session, merchant.id)
    session.close()

    def override_get_db():
        db = sessionmaker(bind=engine)()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


def register_payload(**overrides) -> dict:
    payload = {
        "account": "newshop",
        "password": "ShopPass123",
        "store_name": "新店铺",
        "phone": "13500135000",
        "email": "newshop@example.com",
        "agree_terms": True,
    }
    payload.update(overrides)
    return payload


def test_merchant_login_ignores_account_case_and_surrounding_spaces(monkeypatch):
    """账号按去空格 + 忽略大小写匹配：手机键盘自动大写的 Admin 也能登录。"""
    client = make_client(monkeypatch)
    for account in ["admin", "Admin", "ADMIN", "  admin  ", "aDmIn"]:
        response = client.post("/api/auth/merchant/login", json={"account": account, "password": GOOD_LOGIN["password"]})
        assert response.status_code == 200, f"{account!r} 应能登录，实际 {response.status_code} {response.text}"
        assert response.json()["access_token"]


def test_merchant_login_still_rejects_wrong_password(monkeypatch):
    """放宽的是账号匹配，密码仍然必须严格校验。"""
    client = make_client(monkeypatch)
    response = client.post("/api/auth/merchant/login", json={"account": "ADMIN", "password": "wrong-password"})
    assert response.status_code == 401
    assert response.json()["detail"] == "账号或密码错误"


def test_failed_login_budget_is_shared_across_account_case(monkeypatch):
    """限流键同样忽略大小写，换大小写不能绕过爆破额度。"""
    client = make_client(monkeypatch)
    codes = [
        client.post("/api/auth/merchant/login", json={"account": account, "password": "wrong"}).status_code
        for account in ["admin", "Admin", "ADMIN", "aDmin", "adMin", "ADMIN"]
    ]
    assert codes[:5] == [401] * 5
    assert codes[5] == 429


def test_register_then_login_round_trip(monkeypatch):
    """注册即登录，且注册出来的账号随后能用账号密码登录。"""
    client = make_client(monkeypatch)
    created = client.post("/api/auth/merchant/register", json=register_payload())
    assert created.status_code == 201, created.text
    assert created.json()["store_name"] == "新店铺"
    assert created.json()["access_token"]

    login = client.post("/api/auth/merchant/login", json={"account": "newshop", "password": "ShopPass123"})
    assert login.status_code == 200
    # 新账号的数据是隔离的：拿到的商品列表应为空，不会看到演示商家的商品
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/products/manage", headers=headers).json() == []


def test_register_rejects_duplicate_account_ignoring_case(monkeypatch):
    """账号唯一性判断忽略大小写，避免 Admin 与 admin 共存导致登录归属不确定。"""
    client = make_client(monkeypatch)
    assert client.post("/api/auth/merchant/register", json=register_payload()).status_code == 201
    for account in ["newshop", "NewShop", "NEWSHOP"]:
        duplicate = client.post(
            "/api/auth/merchant/register",
            json=register_payload(account=account, phone="13500135001", email=f"{account.lower()}@example.com"),
        )
        assert duplicate.status_code == 409, duplicate.text
        assert duplicate.json()["detail"] == "该账号已被注册"


def test_register_rejects_duplicate_email_ignoring_case(monkeypatch):
    client = make_client(monkeypatch)
    assert client.post("/api/auth/merchant/register", json=register_payload()).status_code == 201
    duplicate = client.post(
        "/api/auth/merchant/register",
        json=register_payload(account="othershop", phone="13500135002", email="NewShop@Example.com"),
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "该邮箱已被绑定"


def test_register_rejects_duplicate_phone(monkeypatch):
    client = make_client(monkeypatch)
    assert client.post("/api/auth/merchant/register", json=register_payload()).status_code == 201
    duplicate = client.post(
        "/api/auth/merchant/register",
        json=register_payload(account="othershop", email="other@example.com"),
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "该手机号已被绑定"


def test_register_requires_terms_and_strong_password(monkeypatch):
    client = make_client(monkeypatch)
    no_terms = client.post("/api/auth/merchant/register", json=register_payload(agree_terms=False))
    assert no_terms.status_code == 422
    assert "平台须知" in no_terms.json()["detail"]

    weak = client.post("/api/auth/merchant/register", json=register_payload(password="short1"))
    assert weak.status_code == 422
    assert "密码" in weak.json()["detail"]


def test_demo_mode_issues_code_for_unbound_phone(monkeypatch):
    """演示模式下未注册手机号也要能取到演示码。

    公开演示里用户随手填一个手机号是常态；此前这里直接 404，
    「手机号验证码登录」在演示站上等于不可用——取不到码，界面自然也不会自动填充。
    """
    client = make_client(monkeypatch)
    response = client.post("/api/auth/merchant/request-code", json={"phone": "13911112222"})
    assert response.status_code == 200
    body = response.json()
    assert body["demo_mode"] is True
    assert body["registered"] is False
    assert body["code"] and len(body["code"]) == 6


def test_non_demo_unbound_phone_explains_next_step(monkeypatch):
    """正式环境仍严格：未绑定手机号不能只回「未找到」，要告诉用户去注册或改用密码。"""
    from app import main as main_module

    monkeypatch.setattr(main_module.settings, "demo_mode", False)
    client = make_client(monkeypatch)
    response = client.post("/api/auth/merchant/request-code", json={"phone": "13911112222"})
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "注册" in detail and "账号密码" in detail


def test_bound_phone_can_request_code_and_login_with_it(monkeypatch):
    """演示手机号取码 → 用验证码登录，整条链路可用。"""
    client = make_client(monkeypatch)
    code_response = client.post("/api/auth/merchant/request-code", json={"phone": "13800138000"})
    assert code_response.status_code == 200
    assert code_response.json()["registered"] is True
    code = code_response.json()["code"]
    assert code and len(code) == 6

    login = client.post("/api/auth/merchant/login-code", json={"phone": "13800138000", "code": code})
    assert login.status_code == 200
    assert login.json()["access_token"]
    # 验证码一次性使用
    again = client.post("/api/auth/merchant/login-code", json={"phone": "13800138000", "code": code})
    assert again.status_code == 401


def test_demo_code_login_creates_workspace_for_unbound_phone(monkeypatch):
    """演示模式下用演示码登录未绑定手机号 → 自动开一个带演示商品的独立工作台。

    只发码不建账号的话，用户拿到码却卡在「手机号未绑定采购方账号」，
    演示动线还是断的。
    """
    client = make_client(monkeypatch)
    phone = "13911113333"
    code = client.post("/api/auth/merchant/request-code", json={"phone": phone}).json()["code"]
    login = client.post("/api/auth/merchant/login-code", json={"phone": phone, "code": code})
    assert login.status_code == 200
    token = login.json()["access_token"]
    assert token

    # 新演示工作台要有商品，否则登录进去只会看到一个空工作台。
    products = client.get("/api/products", headers={"Authorization": f"Bearer {token}"})
    assert products.status_code == 200
    assert len(products.json()) == 3

    # 同一个手机号再次登录：复用原账号，不会重复建。
    # 取码有 60 秒/次的限制，这里直接清一次限流计数，等价于「等过了 60 秒」。
    limiter.reset()
    code2 = client.post("/api/auth/merchant/request-code", json={"phone": phone}).json()["code"]
    again = client.post("/api/auth/merchant/login-code", json={"phone": phone, "code": code2})
    assert again.status_code == 200


def test_code_login_rejects_unbound_phone_outside_demo(monkeypatch):
    """非演示模式不允许「任意手机号 + 验证码」直接进商家端。"""
    from app import main as main_module

    monkeypatch.setattr(main_module.settings, "demo_mode", False)
    client = make_client(monkeypatch)
    response = client.post("/api/auth/merchant/login-code", json={"phone": "13911112222", "code": "123456"})
    assert response.status_code == 401
    assert "未绑定" in response.json()["detail"]


def test_rate_limit_message_tells_user_how_long_to_wait(monkeypatch):
    """只回「请稍后再试」用户不知道等多久，只会继续重试。"""
    client = make_client(monkeypatch)
    assert client.post("/api/auth/merchant/request-code", json={"phone": "13800138000"}).status_code == 200
    limited = client.post("/api/auth/merchant/request-code", json={"phone": "13800138000"})
    assert limited.status_code == 429
    assert "秒" in limited.json()["detail"]


def test_database_failure_is_reported_as_503(monkeypatch):
    """数据库断连要回 503 与明确文案，而不是裸 500 让前端瞎猜。"""

    class BrokenSession:
        def scalar(self, *args, **kwargs):
            raise OperationalError("SELECT 1", {}, Exception("database is gone"))

        def close(self):
            return None

    client = make_client(monkeypatch)

    def override_broken_db():
        yield BrokenSession()

    app.dependency_overrides[get_db] = override_broken_db
    response = client.post("/api/auth/merchant/login", json=GOOD_LOGIN)
    assert response.status_code == 503
    assert response.json()["detail"] == "数据库暂时不可用，请稍后重试"


def test_health_reports_version_for_frontend_diagnostics(monkeypatch):
    """前端在接口 404 时回探 /api/health，用它区分「后端没起来」和「后端是旧版本」。"""
    client = make_client(monkeypatch)
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["version"]


def test_supplier_code_requests_do_not_consume_merchant_ip_quota(monkeypatch):
    """供应商取码与商家取码各算各的 IP 额度。

    两者原先共用 otp:ip 桶（8 次/小时），同一出口 IP 上供应商侧多试几次，
    商家侧就会在第一次取码时被判定「请求过于频繁」。
    """
    client = make_client(monkeypatch)
    for index in range(8):
        response = client.post("/api/auth/supplier/request-code", json={"phone": f"1370000000{index}"})
        assert response.status_code == 200, response.text
    # 供应商侧已用满 8 次
    assert client.post("/api/auth/supplier/request-code", json={"phone": "13700000099"}).status_code == 429
    # 商家侧额度不受影响
    assert client.post("/api/auth/merchant/request-code", json={"phone": "13800138000"}).status_code == 200
