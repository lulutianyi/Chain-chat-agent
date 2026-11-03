"""轻量级鉴权：供应商手机号登录（演示验证码）+ 商家管理令牌。

演示模式下验证码不走短信，直接返回给前端并打印到后端日志。
供应商身份通过 access_token 绑定手机号，谈判会话的归属以 supplier.phone 判定。
"""

import hashlib
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import MerchantAccount, SupplierAuth

_PBKDF2_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    """PBKDF2-SHA256 加盐哈希，返回 "salt$hex"。标准库实现，不引入额外依赖。"""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), _PBKDF2_ITERATIONS).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), _PBKDF2_ITERATIONS).hex()
    return hmac.compare_digest(candidate, digest)


def validate_password(password: str) -> str | None:
    """校验采购方密码：长度 > 8 字符，且同时包含英文字母、数字。合法返回 None，否则返回错误信息。"""
    if len(password) <= 8:
        return "密码长度需大于 8 个字符"
    if not re.search(r"[a-zA-Z]", password):
        return "密码需至少包含一个英文字母"
    if not re.search(r"[0-9]", password):
        return "密码需至少包含一个数字"
    return None

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


def issue_token() -> str:
    """签发访问令牌：随机串 + 内嵌签发时间。

    把签发时间放进令牌本身，是为了在不改表结构的前提下支持有效期
    （merchant_accounts 上没有任何时间列）。时间戳不可伪造：
    令牌整体存在库里做等值匹配，改动任何一位都会匹配失败。
    """
    return f"{secrets.token_urlsafe(24)}.{int(time.time())}"


def token_is_expired(token: str, last_login_at: datetime | None = None) -> bool:
    """令牌是否超过有效期。ttl<=0 表示不限制（仅本地调试用）。

    新格式（带 .时间戳）按内嵌时间判断；旧格式（无时间戳）退回用
    账号上的 last_login_at 判断，两者都没有则视为未过期，
    避免升级后把所有人立刻踢下线。
    """
    ttl_days = get_settings().token_ttl_days
    if ttl_days <= 0:
        return False
    suffix = token.rpartition(".")[2]
    if suffix.isdigit():
        return time.time() - int(suffix) > ttl_days * 86400
    if last_login_at is None:
        return False
    return datetime.utcnow() - last_login_at > timedelta(days=ttl_days)


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token else None


def require_admin(db: Session = Depends(get_db), authorization: str | None = Header(default=None)) -> str:
    """商家侧鉴权：接受环境 admin_token（网页调试），或采购方登录后的商家 access_token。"""
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="需要管理员身份")
    expected = get_settings().admin_token
    if expected and token == expected:
        return token
    if db.scalar(select(MerchantAccount.id).where(MerchantAccount.access_token == token)):
        return token
    raise HTTPException(status_code=401, detail="需要管理员身份")


def require_buyer(db: Session = Depends(get_db), authorization: str | None = Header(default=None)) -> MerchantAccount:
    """采购方登录鉴权：仅接受商家 access_token，返回对应账号行。"""
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="请先登录采购方账号")
    account = db.scalar(select(MerchantAccount).where(MerchantAccount.access_token == token))
    if account is None:
        raise HTTPException(status_code=401, detail="登录已失效，请重新登录")
    if token_is_expired(token):
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    return account


def require_merchant(db: Session = Depends(get_db), authorization: str | None = Header(default=None)) -> MerchantAccount:
    """商家数据鉴权：返回当前商家账号行，用于按 merchant_id 隔离数据。

    兼容两种令牌：商家登录后的 access_token（返回该商家）；环境 admin_token（网页调试），
    映射到默认商家（按 id 取第一行），保证本地调试入口仍可用。
    """
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="请先登录采购方账号")
    expected = get_settings().admin_token
    if expected and token == expected:
        account = db.scalar(select(MerchantAccount).order_by(MerchantAccount.id).limit(1))
        if account is not None:
            return account
        raise HTTPException(status_code=401, detail="商家账号未初始化")
    account = db.scalar(select(MerchantAccount).where(MerchantAccount.access_token == token))
    if account is None:
        raise HTTPException(status_code=401, detail="登录已失效，请重新登录")
    if token_is_expired(token):
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    return account


def require_supplier(db: Session = Depends(get_db), authorization: str | None = Header(default=None)) -> SupplierAuth:
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="请先登录供应商账号")
    auth = db.scalar(select(SupplierAuth).where(SupplierAuth.access_token == token))
    if auth is None:
        raise HTTPException(status_code=401, detail="登录已失效，请重新登录")
    if token_is_expired(token, auth.last_login_at):
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    return auth


def authorize_negotiation(db: Session, phone: str | None, merchant_id: int | None, authorization: str | None) -> None:
    """允许该会话所属供应商（phone 匹配）、所属商家，或管理员令牌访问，否则 401。"""
    token = _extract_bearer(authorization)
    expected = get_settings().admin_token
    if expected and token == expected:
        return
    if token and phone:
        auth = db.scalar(select(SupplierAuth).where(SupplierAuth.access_token == token))
        if auth is not None and auth.phone == phone:
            return
    if token and merchant_id is not None:
        account = db.scalar(select(MerchantAccount).where(MerchantAccount.access_token == token))
        if account is not None and account.id == merchant_id:
            return
    raise HTTPException(status_code=401, detail="无权访问该谈判会话")
