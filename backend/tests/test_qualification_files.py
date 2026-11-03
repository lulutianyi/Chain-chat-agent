import tempfile
from pathlib import Path

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.main as main_module
from app.config import get_settings
from app.database import Base, get_db
from app.main import app
from app.seed import seed_demo_data, seed_merchant_account

PHONE = "13700000000"


def make_client(monkeypatch, upload_dir: Path) -> TestClient:
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
    monkeypatch.setattr(main_module, "UPLOAD_DIR", upload_dir)

    # OCR 分支的入口条件是「百度密钥已配置」。这些用例 mock 的是识别函数，
    # 不能反过来依赖本机 .env 里恰好有密钥——CI 没有 .env，否则会静默走进
    # 「未配置 → unavailable」分支，导致断言在本地过、线上挂。
    config = get_settings()
    monkeypatch.setattr(config, "baidu_api_key", "test-baidu-key")
    monkeypatch.setattr(config, "baidu_secret_key", "test-baidu-secret")
    monkeypatch.setattr(main_module, "get_settings", lambda: config)

    async def fake_ocr(file_bytes, is_pdf=False):
        return {"company": "鼎盛制造厂", "credit_code": "91440300TEST00000X", "legal_person": "张三"}

    monkeypatch.setattr(main_module, "read_business_license", fake_ocr)
    client = TestClient(app)
    # 暴露 engine，供测试统计实际发出的 SQL（见 test_list_endpoints_do_not_load_file_bytes）
    client.app_engine = engine  # type: ignore[attr-defined]
    return client


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


def test_upload_claim_verify_flow(monkeypatch):
    # 本机 pytest 的 tmp_path 因临时目录权限不可用，改用 tempfile 自建目录。
    upload_dir = Path(tempfile.mkdtemp(prefix="liantan-test-uploads-"))
    client = make_client(monkeypatch, upload_dir)
    headers = login_headers(client)

    rejected = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("virus.exe", b"xx", "application/x-msdownload")},
        headers=headers,
    )
    assert rejected.status_code == 415

    uploaded = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("营业执照.png", PNG_BYTES, "image/png")},
        data={"company_name": "鼎盛制造厂"},
        headers=headers,
    ).json()
    assert uploaded["verified"] is False
    assert uploaded["original_name"] == "营业执照.png"
    assert uploaded["ocr_status"] == "passed"  # 识别公司名与填写企业名一致
    assert "鼎盛制造厂" in uploaded["ocr_detail"]

    def payload(file_ids):
        return {
            "product_id": 1, "company_name": "鼎盛制造厂", "contact_name": "张三", "phone": PHONE,
            "region": "河南郑州", "quoted_price": 24.4, "moq": 150, "lead_days": 10, "payment_days": 30,
            "qualifications": ["营业执照"], "qualification_file_ids": file_ids, "cooperation_rating": 60,
        }

    blocked = client.post("/api/suppliers/evaluate", json=payload([]), headers=headers)
    assert blocked.status_code == 422  # 勾选资质但未上传文件，强制拦截

    result = client.post("/api/suppliers/evaluate", json=payload([uploaded["id"]]), headers=headers).json()
    negotiation_id = result["negotiation_id"]

    detail = client.get(f"/api/negotiations/{negotiation_id}", headers=merchant_headers(client)).json()
    files = detail["supplier"]["qualification_files"]
    assert len(files) == 1 and files[0]["id"] == uploaded["id"]

    served = client.get(f"/api/uploads/{uploaded['id']}", headers=merchant_headers(client))
    assert served.status_code == 200
    assert served.content == PNG_BYTES

    toggled = client.post(f"/api/qualification-files/{uploaded['id']}/verify", headers=merchant_headers(client)).json()
    assert toggled["verified"] is True

    assert client.get(f"/api/uploads/{uploaded['id']}").status_code == 401  # 无令牌不可下载


def test_ocr_mismatch_and_failure_paths(monkeypatch):
    upload_dir = Path(tempfile.mkdtemp(prefix="liantan-test-uploads-"))
    client = make_client(monkeypatch, upload_dir)
    headers = login_headers(client)

    async def fake_mismatch(file_bytes, is_pdf=False):
        return {"company": "深圳另一家贸易有限公司", "credit_code": "x", "legal_person": "李四"}

    monkeypatch.setattr(main_module, "read_business_license", fake_mismatch)
    mismatched = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("执照2.png", b"\x89PNG\r\n\x1a\n" + b"img-2", "image/png")},
        data={"company_name": "鼎盛制造厂"},
        headers=headers,
    ).json()
    assert mismatched["ocr_status"] == "mismatch"
    assert "深圳另一家贸易有限公司" in mismatched["ocr_detail"]

    async def failing_ocr(file_bytes, is_pdf=False):
        raise httpx.ConnectError("network down")

    monkeypatch.setattr(main_module, "read_business_license", failing_ocr)
    failed = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("执照3.png", b"\x89PNG\r\n\x1a\n" + b"img-3", "image/png")},
        data={"company_name": "鼎盛制造厂"},
        headers=headers,
    ).json()
    assert failed["ocr_status"] == "unavailable"  # 识别失败降级人工核验，不报 500

    async def not_a_license(file_bytes, is_pdf=False):
        return {"company": "", "credit_code": "", "legal_person": ""}

    monkeypatch.setattr(main_module, "read_business_license", not_a_license)
    other = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("质检报告.pdf", PDF_BYTES, "application/pdf")},
        data={"company_name": "鼎盛制造厂"},
        headers=headers,
    ).json()
    assert other["ocr_status"] == "not_applicable"


def test_list_endpoints_do_not_load_file_bytes(monkeypatch):
    """列表/详情接口不应把附件字节读进内存。

    QualificationFile.data 是 deferred 列；若有人去掉这个设置，
    每次列会话都会把所有附件（单个上限 5MB）加载进来再丢弃。
    这里直接统计实际执行的 SQL，确认没有 select 到 data 列。
    """
    from sqlalchemy import event

    upload_dir = Path(tempfile.mkdtemp(prefix="liantan-test-uploads-"))
    client = make_client(monkeypatch, upload_dir)
    headers = login_headers(client)

    uploaded = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("营业执照.png", PNG_BYTES, "image/png")},
        data={"company_name": "鼎盛制造厂"},
        headers=headers,
    ).json()
    result = client.post(
        "/api/suppliers/evaluate",
        json={
            "product_id": 1, "company_name": "鼎盛制造厂", "contact_name": "张三", "phone": PHONE,
            "region": "河南郑州", "quoted_price": 24.4, "moq": 150, "lead_days": 10, "payment_days": 30,
            "qualifications": ["营业执照"], "qualification_file_ids": [uploaded["id"]], "cooperation_rating": 60,
        },
        headers=headers,
    ).json()
    negotiation_id = result["negotiation_id"]

    statements: list[str] = []

    def capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(client.app_engine, "before_cursor_execute", capture)
    try:
        client.get("/api/negotiations", headers=merchant_headers(client))
        client.get(f"/api/negotiations/{negotiation_id}", headers=merchant_headers(client))
        client.get("/api/dashboard/summary", headers=merchant_headers(client))
    finally:
        event.remove(client.app_engine, "before_cursor_execute", capture)

    loaded_bytes = [s for s in statements if "qualification_files.data" in s]
    assert not loaded_bytes, f"这些查询不该读取附件字节：{loaded_bytes}"

    # 但真正下载文件时仍必须能取到内容。
    served = client.get(f"/api/uploads/{uploaded['id']}", headers=merchant_headers(client))
    assert served.status_code == 200
    assert served.content == PNG_BYTES

# 真实文件头：上传接口现在按文件头判断类型，测试数据必须带正确的魔数，
# 否则会被 415 拦下（这正是加固后的预期行为）。
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"fake-png-body"
JPG_BYTES = b"\xff\xd8\xff\xe0" + b"fake-jpg-body"
PDF_BYTES = b"%PDF-1.4 fake-pdf-body"



def test_upload_rejects_content_that_does_not_match_extension(monkeypatch):
    """按文件头判类型：改名的可执行文件/伪装成图片的文本都过不去。"""
    client = make_client(monkeypatch, Path(tempfile.mkdtemp(prefix="liantan-test-uploads-")))
    headers = login_headers(client)

    disguised = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("营业执照.png", b"<html><script>alert(1)</script>", "image/png")},
        headers=headers,
    )
    assert disguised.status_code == 415

    # 后缀不在白名单，直接挡在文件读取之前
    wrong_suffix = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("说明.txt", PNG_BYTES, "text/plain")},
        headers=headers,
    )
    assert wrong_suffix.status_code == 415

    # JPEG 头 + .png 后缀：类型识别以文件头为准，会按 jpeg 归一化入库
    jpeg_with_png_name = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("图片.png", JPG_BYTES, "image/png")},
        headers=headers,
    )
    assert jpeg_with_png_name.status_code == 200
    assert jpeg_with_png_name.json()["content_type"] == "image/jpeg"


def test_upload_rejects_oversized_file(monkeypatch):
    """超过 5MB 直接 413（分块读取时就中止，不是读完再判断）。"""
    client = make_client(monkeypatch, Path(tempfile.mkdtemp(prefix="liantan-test-uploads-")))
    headers = login_headers(client)
    oversized = b"\x89PNG\r\n\x1a\n" + b"x" * (5 * 1024 * 1024 + 1024)
    response = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("大图.png", oversized, "image/png")},
        headers=headers,
    )
    assert response.status_code == 413


def test_sanitize_filename_strips_control_chars_and_paths():
    """直接单测清洗函数：真实攻击面是原始 HTTP 请求里的 CR/LF 与路径。

    注意 httpx 会把文件名里的 CR/LF 百分号编码后再发，
    所以端到端用例看到的是 %0D%0A 字面量而不是控制字符——
    真正的注入防护要靠这个函数本身，因此单独测它。
    """
    from app.uploads import sanitize_filename

    assert sanitize_filename("../../etc/passwd.png") == "passwd.png"
    assert sanitize_filename('营业"执照.png') == "营业执照.png"
    assert "\r" not in sanitize_filename("营业\r\n执照.png")
    assert "\n" not in sanitize_filename("营业\r\n执照.png")
    assert "\x00" not in sanitize_filename("a\x00b.png")
    # 超长文件名要截断，且保留后缀（库字段是 String(255)）
    long_name = "甲" * 400 + ".png"
    cleaned = sanitize_filename(long_name)
    assert len(cleaned) <= 200
    assert cleaned.endswith(".png")
    assert sanitize_filename("") == "file"


def test_upload_stores_sanitized_filename(monkeypatch):
    """端到端：入库的文件名不含路径分隔符。"""
    client = make_client(monkeypatch, Path(tempfile.mkdtemp(prefix="liantan-test-uploads-")))
    headers = login_headers(client)
    uploaded = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("../../etc/营业执照.png", PNG_BYTES, "image/png")},
        headers=headers,
    ).json()
    assert "/" not in uploaded["original_name"]
    assert "\\" not in uploaded["original_name"]
    assert uploaded["original_name"].endswith(".png")


def test_download_forces_attachment_and_blocks_sniffing(monkeypatch):
    """下载一律 attachment + nosniff + CSP sandbox，避免同源渲染上传内容。"""
    client = make_client(monkeypatch, Path(tempfile.mkdtemp(prefix="liantan-test-uploads-")))
    headers = login_headers(client)
    uploaded = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("营业执照.png", PNG_BYTES, "image/png")},
        data={"company_name": "鼎盛制造厂"},
        headers=headers,
    ).json()
    # 未认领的文件对商家不可见（这是预期的隔离行为），
    # 因此先通过提交方案把它挂到供应商名下再下载。
    client.post(
        "/api/suppliers/evaluate",
        json={
            "product_id": 1, "company_name": "鼎盛制造厂", "contact_name": "张三", "phone": PHONE,
            "region": "河南郑州", "quoted_price": 24.4, "moq": 150, "lead_days": 10, "payment_days": 30,
            "qualifications": ["营业执照"], "qualification_file_ids": [uploaded["id"]], "cooperation_rating": 60,
        },
        headers=headers,
    )

    served = client.get(f"/api/uploads/{uploaded['id']}", headers=merchant_headers(client))
    assert served.status_code == 200
    assert served.headers["content-disposition"].startswith("attachment;")
    assert served.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in served.headers["content-security-policy"]
