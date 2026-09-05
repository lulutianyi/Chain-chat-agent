"""轻量级鉴权：供应商手机号登录（演示验证码）+ 商家管理令牌。

演示模式下验证码不走短信，直接返回给前端并打印到后端日志。
供应商身份通过 access_token 绑定手机号，谈判会话的归属以 supplier.phone 判定。
"""

import secrets
import time

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import SupplierAuth

OTP_TTL_SECONDS = 300
# phone -> (code, expires_at)。演示用途，进程内存储，重启即失效。
_otp_store: dict[str, tuple[str, float]] = {}


def _prune_otp() -> None:
    now = time.time()
    for phone in [p for p, (_, exp) in _otp_store.items() if exp < now]:
        _otp_store.pop(phone, None)


def issue_code(phone: str) -> str:
    _prune_otp()
    code = f"{secrets.randbelow(1_000_000):06d}"
    _otp_store[phone] = (code, time.time() + OTP_TTL_SECONDS)
    return code


def check_code(phone: str, code: str) -> bool:
    _prune_otp()
    entry = _otp_store.get(phone)
    if entry is None or entry[1] < time.time():
        return False
    if entry[0] != code:
        return False
    _otp_store.pop(phone, None)  # 一次性使用
    return True


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token else None


def require_admin(authorization: str | None = Header(default=None)) -> str:
    token = _extract_bearer(authorization)
    expected = get_settings().admin_token
    if not expected or not token or token != expected:
        raise HTTPException(status_code=401, detail="需要管理员身份")
    return token


def require_supplier(db: Session = Depends(get_db), authorization: str | None = Header(default=None)) -> SupplierAuth:
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="请先登录供应商账号")
    auth = db.scalar(select(SupplierAuth).where(SupplierAuth.access_token == token))
    if auth is None:
        raise HTTPException(status_code=401, detail="登录已失效，请重新登录")
    return auth


def authorize_negotiation(db: Session, phone: str | None, authorization: str | None) -> None:
    """允许管理员令牌，或该会话所属供应商（phone 匹配）访问，否则 401。"""
    token = _extract_bearer(authorization)
    expected = get_settings().admin_token
    if expected and token == expected:
        return
    if token and phone:
        auth = db.scalar(select(SupplierAuth).where(SupplierAuth.access_token == token))
        if auth is not None and auth.phone == phone:
            return
    raise HTTPException(status_code=401, detail="无权访问该谈判会话")
