import base64
from difflib import SequenceMatcher

import httpx

from app.config import get_settings

_token: str | None = None   # access_token 有效期 30 天，进程内缓存

async def _access_token() -> str:
    global _token
    if _token:
        return _token
    s = get_settings()
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get("https://aip.baidubce.com/oauth/2.0/token", params={
            "grant_type": "client_credentials",
            "client_id": s.baidu_api_key, "client_secret": s.baidu_secret_key,
        })
        r.raise_for_status()
        _token = r.json()["access_token"]
        return _token

async def read_business_license(file_bytes: bytes, is_pdf: bool = False) -> dict:
    """营业执照 OCR：提取公司名/信用代码/法人。图片走 image 参数，PDF 走 pdf_file 参数。"""
    token = await _access_token()
    payload = {"pdf_file": base64.b64encode(file_bytes).decode()} if is_pdf else {"image": base64.b64encode(file_bytes).decode()}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://aip.baidubce.com/rest/2.0/ocr/v1/business_license",
            params={"access_token": token},
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        r.raise_for_status()
        w = r.json().get("words_result", {})
        return {
            "company": w.get("单位名称", {}).get("words", ""),
            "credit_code": w.get("社会信用代码", {}).get("words", ""),
            "legal_person": w.get("法人", {}).get("words", ""),
        }

def company_matches(ocr_company: str, declared_company: str) -> bool:
    """识别出的公司名与供应商填写的企业名称比对：互相包含，或相似度 ≥ 0.8（容忍 OCR 少字/错字）。"""
    a, b = ocr_company.strip(), declared_company.strip()
    if not a or not b:
        return False
    if a in b or b in a:
        return True
    return SequenceMatcher(None, a, b).ratio() >= 0.8