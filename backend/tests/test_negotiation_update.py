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
from app.services.term_extraction import extract_supplier_terms

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


def test_parse_negotiation_turn_accepts_numeric_strings_with_units():
    turn = parse_negotiation_turn('{"reply":"收到","quoted_price":"51元/件","moq":"60件","lead_days":null,"payment_days":"30天"}')
    assert (turn.quoted_price, turn.moq, turn.payment_days) == (51.0, 60, 30)


def test_local_extractor_handles_common_supplier_phrases():
    terms = extract_supplier_terms("可以，我们把价格从54元调整到51元吧，起订量改为60件，账期30天不变，7天交货。")
    assert terms.quoted_price == 51
    assert terms.moq == 60
    assert terms.payment_days == 30
    assert terms.lead_days == 7


def test_local_extractor_ignores_rejected_number():
    terms = extract_supplier_terms("50元不行，我们最低只能做到51元。")
    assert terms.quoted_price == 51


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

    async def fake_opening(**kwargs):
        return "您好，感谢提交方案，我们想继续商量合作条件。"

    async def fake_recovery(**kwargs):
        return "这组条件暂时超过采购底线，能否先回到上一轮方案，我们再继续寻找折中空间？"

    monkeypatch.setattr(main_module, "generate_negotiation_turn", fake_turn)
    monkeypatch.setattr(main_module, "generate_opening_message", fake_opening)
    monkeypatch.setattr(main_module, "generate_boundary_recovery_reply", fake_recovery)
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


def test_concession_marks_candidate_but_ai_continues_until_handoff(monkeypatch):
    turn = NegotiationTurn(reply="可以接受，21 元 100 件，账期 45 天。", quoted_price=21.0, moq=100, payment_days=45)
    client = make_client(monkeypatch, turn)
    headers = login_headers(client)
    result = submit_offer(client, headers)
    assert result["classification"] == "negotiating"
    assert result["score"] < 82

    chat = client.post(
        f"/api/negotiations/{result['negotiation_id']}/messages",
        json={"content": "21 元的话，100 件起订，账期 45 天。"},
        headers=headers,
    ).json()
    assert chat["score"] >= 82
    assert chat["classification"] == "qualified"
    assert chat["status"] == "ai_active"
    assert chat["handoff_required"] is True

    follow_up = client.post(
        f"/api/negotiations/{result['negotiation_id']}/messages",
        json={"content": "那什么时候签合同？"},
        headers=headers,
    ).json()
    assert follow_up["assistant_message"] is not None
    assert follow_up["status"] == "ai_active"

    handed_off = client.post(f"/api/negotiations/{result['negotiation_id']}/handoff", headers=ADMIN_HEADERS).json()
    assert handed_off["status"] == "human_active"
    after_handoff = client.post(
        f"/api/negotiations/{result['negotiation_id']}/messages",
        json={"content": "人工接管后这条不应触发 AI。"},
        headers=headers,
    ).json()
    assert after_handoff["assistant_message"] is None
    assert after_handoff["status"] == "human_active"

    detail = client.get(f"/api/negotiations/{result['negotiation_id']}", headers=ADMIN_HEADERS).json()
    assert any("重新校验评分" in message["content"] for message in detail["messages"])


def test_local_terms_recalculate_when_model_returns_plain_reply(monkeypatch):
    client = make_client(monkeypatch, NegotiationTurn(reply="谢谢您的调整，我们继续沟通。"))
    headers = login_headers(client)
    result = submit_offer(client, headers)
    original_score = result["score"]

    client.post(
        f"/api/negotiations/{result['negotiation_id']}/messages",
        json={"content": "好的，报价从24.4元修改为21元/件。"},
        headers=headers,
    )
    detail = client.get(f"/api/negotiations/{result['negotiation_id']}", headers=ADMIN_HEADERS).json()
    assert detail["quoted_price"] == 21
    assert detail["score"] > original_score
    assert any("报价 ¥21/件" in message["content"] for message in detail["messages"] if message["sender"] == "system")


def test_confirming_same_exact_term_still_rechecks_score(monkeypatch):
    client = make_client(monkeypatch, NegotiationTurn(reply="账期信息收到。"))
    headers = login_headers(client)
    result = submit_offer(client, headers)
    client.post(
        f"/api/negotiations/{result['negotiation_id']}/messages",
        json={"content": "账期确认维持30天不变。"},
        headers=headers,
    )
    detail = client.get(f"/api/negotiations/{result['negotiation_id']}", headers=ADMIN_HEADERS).json()
    assert any("明确条款与当前记录一致" in message["content"] for message in detail["messages"] if message["sender"] == "system")


def test_price_above_hard_cap_marks_offer_eliminated_but_keeps_ai_open(monkeypatch):
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
    assert chat["status"] == "ai_active"
    assert "回到上一轮" in chat["assistant_message"]

    again = client.post(
        f"/api/negotiations/{result['negotiation_id']}/messages",
        json={"content": "可以，报价恢复为24元。"},
        headers=headers,
    ).json()
    assert again["status"] == "ai_active"
    assert again["classification"] == "negotiating"
    assert again["assistant_message"] is not None
