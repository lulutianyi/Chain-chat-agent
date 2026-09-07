import tempfile
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.main as main_module
from app.database import Base, get_db
from app.main import app
from app.seed import seed_demo_data
from app.services.llm import NegotiationTurn, parse_negotiation_turn

ADMIN_HEADERS = {"Authorization": "Bearer lantan-admin-demo-2025"}
PHONE = "13900000000"


def test_parse_negotiation_turn_extracts_terms_from_json():
    raw = '{"reply": "感谢让步，我们再评估。", "quoted_price": 21.5, "moq": 100, "lead_days": null, "payment_days": 15}'
    turn = parse_negotiation_turn(raw)
    assert turn.reply == "感谢让步，我们再评估。"
    assert turn.quoted_price == 21.5
    assert turn.moq == 100
    assert turn.lead_days is None
    assert turn.payment_days == 15


def test_parse_negotiation_turn_handles_fenced_json():
    raw = '```json\n{"reply": "收到。", "quoted_price": 20, "moq": null, "lead_days": null, "payment_days": null}\n```'
    turn = parse_negotiation_turn(raw)
    assert turn.reply == "收到。"
    assert turn.quoted_price == 20.0


def test_parse_negotiation_turn_survives_plain_text_and_garbage():
    assert parse_negotiation_turn("我们无法接受这个条件。").quoted_price is None
    broken = parse_negotiation_turn('{"moq": -3, "quoted_price": "贵"}')
    assert broken.quoted_price is None and broken.moq is None
    assert broken.reply  # 无有效条款时整段文本按回复处理，不更新条款


def make_client(monkeypatch, turn: NegotiationTurn) -> TestClient:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    seed_demo_data(sessionmaker(bind=engine)())

    def override_get_db():
        session = sessionmaker(bind=engine)()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(main_module, "UPLOAD_DIR", Path(tempfile.mkdtemp(prefix="liantan-test-uploads-")))

    async def fake_ocr(file_bytes, is_pdf=False):
        return {"company": "鼎盛制造厂", "credit_code": "x", "legal_person": "张三"}

    monkeypatch.setattr(main_module, "read_business_license", fake_ocr)

    async def fake_turn(**kwargs):
        return turn

    monkeypatch.setattr(main_module, "generate_negotiation_turn", fake_turn)
    return TestClient(app)


def login_headers(client: TestClient) -> dict:
    code = client.post("/api/auth/supplier/request-code", json={"phone": PHONE}).json()["code"]
    token = client.post("/api/auth/supplier/login", json={"phone": PHONE, "code": code}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def submit_offer(client: TestClient, headers: dict) -> dict:
    uploaded = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("资质.png", b"fake-image-bytes", "image/png")},
        headers=headers,
    ).json()
    # 资质齐全过硬规则；非优先地区 + 低配合度 + 接近硬上限的报价，让初始评分落在「AI 拉锯」区间。
    payload = {
        "product_id": 1, "company_name": "鼎盛制造厂", "contact_name": "张三", "phone": PHONE,
        "region": "河南郑州", "quoted_price": 24.4, "moq": 150, "lead_days": 10, "payment_days": 30,
        "qualifications": ["营业执照", "质检报告"], "qualification_file_ids": [uploaded["id"]], "cooperation_rating": 0,
    }
    return client.post("/api/suppliers/evaluate", json=payload, headers=headers).json()


def test_concession_updates_score_and_triggers_handoff(monkeypatch):
    turn = NegotiationTurn(reply="可以接受，21 元 100 件，账期 15 天。", quoted_price=21.0, moq=100, payment_days=15)
    client = make_client(monkeypatch, turn)
    headers = login_headers(client)
    result = submit_offer(client, headers)
    assert result["classification"] == "negotiating"
    assert result["score"] == 77

    chat = client.post(
        f"/api/negotiations/{result['negotiation_id']}/messages",
        json={"content": "21 元的话，100 件起订，账期 15 天。"},
        headers=headers,
    ).json()
    assert chat["score"] == 90
    assert chat["classification"] == "qualified"
    assert chat["status"] == "manual_required"
    assert chat["handoff_required"] is True

    follow_up = client.post(
        f"/api/negotiations/{result['negotiation_id']}/messages",
        json={"content": "那什么时候签合同？"},
        headers=headers,
    ).json()
    assert follow_up["assistant_message"] is None  # 优质候选触发后，程序硬性禁止 AI 继续回复

    detail = client.get(f"/api/negotiations/{result['negotiation_id']}", headers=ADMIN_HEADERS).json()
    assert any("重新校验评分" in message["content"] for message in detail["messages"])


def test_price_above_hard_cap_closes_negotiation(monkeypatch):
    turn = NegotiationTurn(reply="原材料涨价，只能 30 元了。", quoted_price=30.0)
    client = make_client(monkeypatch, turn)
    headers = login_headers(client)
    result = submit_offer(client, headers)
    assert result["classification"] == "negotiating"

    chat = client.post(
        f"/api/negotiations/{result['negotiation_id']}/messages",
        json={"content": "原材料涨了，现在要 30 元。"},
        headers=headers,
    ).json()
    assert chat["classification"] == "eliminated"
    assert chat["status"] == "closed"
    assert "暂不匹配" in chat["assistant_message"]

    again = client.post(
        f"/api/negotiations/{result['negotiation_id']}/messages",
        json={"content": "再考虑一下？"},
        headers=headers,
    ).json()
    assert again["status"] == "closed"  # 淘汰后的会话保持关闭
