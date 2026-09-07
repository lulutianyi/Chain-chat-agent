import tempfile
from pathlib import Path

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.main as main_module
from app.database import Base, get_db
from app.main import app
from app.seed import seed_demo_data

ADMIN_HEADERS = {"Authorization": "Bearer lantan-admin-demo-2025"}
PHONE = "13700000000"


def make_client(monkeypatch, upload_dir: Path) -> TestClient:
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
    monkeypatch.setattr(main_module, "UPLOAD_DIR", upload_dir)

    async def fake_ocr(file_bytes, is_pdf=False):
        return {"company": "鼎盛制造厂", "credit_code": "91440300TEST00000X", "legal_person": "张三"}

    monkeypatch.setattr(main_module, "read_business_license", fake_ocr)
    return TestClient(app)


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
        files={"file": ("营业执照.png", b"\x89PNG fake-bytes", "image/png")},
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

    detail = client.get(f"/api/negotiations/{negotiation_id}", headers=ADMIN_HEADERS).json()
    files = detail["supplier"]["qualification_files"]
    assert len(files) == 1 and files[0]["id"] == uploaded["id"]

    served = client.get(f"/api/uploads/{uploaded['id']}", headers=ADMIN_HEADERS)
    assert served.status_code == 200
    assert served.content == b"\x89PNG fake-bytes"

    toggled = client.post(f"/api/qualification-files/{uploaded['id']}/verify", headers=ADMIN_HEADERS).json()
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
        files={"file": ("执照2.png", b"img-2", "image/png")},
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
        files={"file": ("执照3.png", b"img-3", "image/png")},
        data={"company_name": "鼎盛制造厂"},
        headers=headers,
    ).json()
    assert failed["ocr_status"] == "unavailable"  # 识别失败降级人工核验，不报 500

    async def not_a_license(file_bytes, is_pdf=False):
        return {"company": "", "credit_code": "", "legal_person": ""}

    monkeypatch.setattr(main_module, "read_business_license", not_a_license)
    other = client.post(
        "/api/uploads/qualification-files",
        files={"file": ("质检报告.pdf", b"%PDF-fake", "application/pdf")},
        data={"company_name": "鼎盛制造厂"},
        headers=headers,
    ).json()
    assert other["ocr_status"] == "not_applicable"
