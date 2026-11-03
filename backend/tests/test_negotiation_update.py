import tempfile
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.main as main_module
from app.database import Base, get_db
from app.main import app
from app.seed import seed_demo_data, seed_merchant_account
from app.services.llm import FALLBACK_REPLY, SERVICE_UNAVAILABLE_NOTICE, NegotiationTurn, parse_negotiation_turn
from app.services.term_extraction import extract_supplier_terms

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
    session = sessionmaker(bind=engine)()
    merchant = seed_merchant_account(session)
    seed_demo_data(session, merchant.id)
    session.close()

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
        return NegotiationTurn(reply="您好，感谢提交方案，我们想继续商量合作条件。")

    async def fake_recovery(**kwargs):
        return NegotiationTurn(reply="这组条件暂时超过采购底线，能否先回到上一轮方案，我们再继续寻找折中空间？")

    monkeypatch.setattr(main_module, "generate_negotiation_turn", fake_turn)
    monkeypatch.setattr(main_module, "generate_opening_message", fake_opening)
    monkeypatch.setattr(main_module, "generate_boundary_recovery_reply", fake_recovery)
    return TestClient(app)


def merchant_headers(client: TestClient) -> dict:
    """用商家账号密码登录，拿真实的商家 token。

    之前测试直接用一个硬编码的管理员令牌，那依赖 config 里的默认后门值；
    后门已移除，测试改为走真实登录路径（顺带覆盖了登录接口本身）。
    """
    response = client.post("/api/auth/merchant/login", json={"account": "admin", "password": "链谈Agent123"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def login_headers(client: TestClient) -> dict:
    code = client.post("/api/auth/supplier/request-code", json={"phone": PHONE}).json()["code"]
    token = client.post("/api/auth/supplier/login", json={"phone": PHONE, "code": code}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def submit_offer(client: TestClient, headers: dict) -> dict:
    uploaded = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("资质.png", b"\x89PNG\r\n\x1a\n" + b"fake-image-bytes", "image/png")},
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

    handed_off = client.post(f"/api/negotiations/{result['negotiation_id']}/handoff", headers=merchant_headers(client)).json()
    assert handed_off["status"] == "human_active"
    after_handoff = client.post(
        f"/api/negotiations/{result['negotiation_id']}/messages",
        json={"content": "人工接管后这条不应触发 AI。"},
        headers=headers,
    ).json()
    assert after_handoff["assistant_message"] is None
    assert after_handoff["status"] == "human_active"

    detail = client.get(f"/api/negotiations/{result['negotiation_id']}", headers=merchant_headers(client)).json()
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
    detail = client.get(f"/api/negotiations/{result['negotiation_id']}", headers=merchant_headers(client)).json()
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
    detail = client.get(f"/api/negotiations/{result['negotiation_id']}", headers=merchant_headers(client)).json()
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


def test_model_failure_is_recorded_as_system_notice_not_ai_reply(monkeypatch):
    """模型不可用时不能把兜底文案伪装成 AI 发言写进谈判记录。"""
    turn = NegotiationTurn(reply=FALLBACK_REPLY, mode="fallback")
    client = make_client(monkeypatch, turn)
    # 开场消息同样走模型，这里让它也返回兜底结果，验证两条路径都不写 AI 发言。
    async def fake_opening_fallback(**kwargs):
        return NegotiationTurn(reply=FALLBACK_REPLY, mode="fallback")

    monkeypatch.setattr(main_module, "generate_opening_message", fake_opening_fallback)
    headers = login_headers(client)
    result = submit_offer(client, headers)
    assert result["classification"] == "negotiating"

    chat = client.post(
        f"/api/negotiations/{result['negotiation_id']}/messages",
        json={"content": "我们最低 22 元，200 件起订。"},
        headers=headers,
    ).json()
    # 没有 AI 回复可返回，前端只负责展示一条系统提示。
    assert chat["assistant_message"] is None

    detail = client.get(f"/api/negotiations/{result['negotiation_id']}", headers=merchant_headers(client)).json()
    assert not any(message["sender"] == "ai" for message in detail["messages"])
    assert any(
        message["sender"] == "system" and message["content"] == SERVICE_UNAVAILABLE_NOTICE
        for message in detail["messages"]
    )
    assert not any(message["content"] == FALLBACK_REPLY for message in detail["messages"])


def test_dashboard_summary_supports_time_range(monkeypatch):
    """工作台汇总新增时间口径：默认全部历史，days=N 只统计最近 N 天新提交的会话。"""
    turn = NegotiationTurn(reply="谢谢您的调整，我们继续沟通。")
    client = make_client(monkeypatch, turn)
    headers = login_headers(client)
    result = submit_offer(client, headers)

    all_time = client.get("/api/dashboard/summary", headers=merchant_headers(client)).json()
    assert all_time["range_days"] == 0
    assert all_time["range_received"] == len(all_time["items"]) >= 1

    recent = client.get("/api/dashboard/summary?days=7", headers=merchant_headers(client)).json()
    assert recent["range_days"] == 7
    # 刚提交的会话必然落在最近 7 天内。
    assert any(item["id"] == result["negotiation_id"] for item in recent["items"])

    # 明细必须带上时间字段，前端才能展示日期与按活跃度排序。
    sample = recent["items"][0]
    assert sample["created_at"]
    assert sample["last_activity_at"]

# 真实文件头：上传接口现在按文件头判断类型，测试数据必须带正确的魔数，
# 否则会被 415 拦下（这正是加固后的预期行为）。
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"fake-png-body"
JPG_BYTES = b"\xff\xd8\xff\xe0" + b"fake-jpg-body"
PDF_BYTES = b"%PDF-1.4 fake-pdf-body"



def test_evaluate_is_idempotent_within_window(monkeypatch):
    """双击提交/网络重试不应产生重复的供应商档案与会话。"""
    turn = NegotiationTurn(reply="收到，我们继续沟通。")
    client = make_client(monkeypatch, turn)
    headers = login_headers(client)

    first = submit_offer(client, headers)
    second = submit_offer(client, headers)

    # 同一份方案重复提交：命中幂等窗口，返回同一个会话
    assert first["negotiation_id"] == second["negotiation_id"]

    all_time = client.get("/api/negotiations", headers=merchant_headers(client)).json()
    assert len(all_time) == 1, f"不应产生重复会话，实际 {len(all_time)} 条"


def test_different_terms_still_create_new_session(monkeypatch):
    """条件不同就是新方案，不能被幂等逻辑吞掉。"""
    turn = NegotiationTurn(reply="收到，我们继续沟通。")
    client = make_client(monkeypatch, turn)
    headers = login_headers(client)
    first = submit_offer(client, headers)

    uploaded = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("资质.png", b"\x89PNG\r\n\x1a\n" + b"fake-image-bytes", "image/png")},
        headers=headers,
    ).json()
    changed = client.post(
        "/api/suppliers/evaluate",
        json={
            "product_id": 1, "company_name": "鼎盛制造厂", "contact_name": "张三", "phone": PHONE,
            "region": "河南郑州", "quoted_price": 20.0, "moq": 150, "lead_days": 10, "payment_days": 30,
            "qualifications": ["营业执照", "质检报告"], "qualification_file_ids": [uploaded["id"]],
            "cooperation_rating": 0,
        },
        headers=headers,
    ).json()
    assert changed["negotiation_id"] != first["negotiation_id"]


def test_negotiation_list_supports_pagination_and_filters(monkeypatch):
    """列表接口有上限，并通过 X-Total-Count 告知总数。"""
    turn = NegotiationTurn(reply="收到。")
    client = make_client(monkeypatch, turn)
    headers = login_headers(client)
    submit_offer(client, headers)

    response = client.get("/api/negotiations?limit=1", headers=merchant_headers(client))
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert int(response.headers["X-Total-Count"]) >= 1

    filtered = client.get("/api/negotiations?status=closed", headers=merchant_headers(client))
    assert filtered.status_code == 200
    assert filtered.json() == []


def test_supplier_message_survives_model_failure(monkeypatch):
    """大模型抛错时，供应商刚说的话不能跟着事务一起回滚丢掉。

    改造前整段逻辑在同一个事务里，模型一抛错（或进程被中断），
    供应商那条消息就没了——用户会以为自己没发出去。
    """
    import pytest

    turn = NegotiationTurn(reply="收到。")
    client = make_client(monkeypatch, turn)
    headers = login_headers(client)
    result = submit_offer(client, headers)

    async def boom(**kwargs):
        raise RuntimeError("model down")

    monkeypatch.setattr(main_module, "generate_negotiation_turn", boom)
    with pytest.raises(RuntimeError):
        client.post(
            f"/api/negotiations/{result['negotiation_id']}/messages",
            json={"content": "我们的底线是 23 元。"},
            headers=headers,
        )

    detail = client.get(f"/api/negotiations/{result['negotiation_id']}", headers=merchant_headers(client)).json()
    assert any(m["sender"] == "supplier" and "23 元" in m["content"] for m in detail["messages"]), "供应商消息应当已落库"


def test_offer_is_persisted_even_if_opening_message_fails(monkeypatch):
    """开场白生成失败不该让整份提交消失。"""
    import pytest

    turn = NegotiationTurn(reply="收到。")
    client = make_client(monkeypatch, turn)
    headers = login_headers(client)
    uploaded = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("资质.png", b"\x89PNG\r\n\x1a\n" + b"fake-image-bytes", "image/png")},
        headers=headers,
    ).json()

    async def boom(**kwargs):
        raise RuntimeError("model down")

    monkeypatch.setattr(main_module, "generate_opening_message", boom)
    with pytest.raises(RuntimeError):
        client.post(
            "/api/suppliers/evaluate",
            json={
                "product_id": 1, "company_name": "鼎盛制造厂", "contact_name": "张三", "phone": PHONE,
                "region": "河南郑州", "quoted_price": 24.4, "moq": 150, "lead_days": 10, "payment_days": 30,
                "qualifications": ["营业执照", "质检报告"], "qualification_file_ids": [uploaded["id"]],
                "cooperation_rating": 0,
            },
            headers=headers,
        )

    # 会话与供应商档案已经落库，供应商刷新后能看到自己的记录（而不是一片空白）
    listed = client.get("/api/supplier/negotiations", headers=headers).json()
    assert len(listed) == 1
