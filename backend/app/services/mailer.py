"""找回密码邮件发送。

只依赖标准库 smtplib：当前部署规模不需要引入邮件 SDK，也避免多一个第三方依赖。
所有配置缺失 / 发送失败都抛明确的异常，由接口层转成用户能看懂的 503；
验证码只出现在邮件正文里，不写日志、不回显给前端。
"""

from __future__ import annotations

import html
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from urllib.parse import quote

from app.config import get_settings

logger = logging.getLogger("liantan")


class MailNotConfigured(RuntimeError):
    """SMTP 配置不完整，无法发送邮件。"""


class MailDeliveryError(RuntimeError):
    """已经尝试发送，但 SMTP 连接 / 认证 / 投递失败。"""


def build_password_reset_message(*, to_email: str, code: str, ttl_minutes: int, reset_url: str) -> EmailMessage:
    """构造找回密码邮件；把 code 同时放进纯文本与 HTML 正文。"""
    settings = get_settings()
    sender = settings.smtp_from or settings.smtp_username
    if not sender:
        raise MailNotConfigured("SMTP_FROM 或 SMTP_USERNAME 至少配置一个作为发件人")

    message = EmailMessage()
    message["Subject"] = f"链谈 Agent 密码重置验证码：{code}"
    message["From"] = formataddr(("链谈 Agent", sender)) if "@" in sender and "<" not in sender else sender
    message["To"] = to_email

    text = (
        "你正在重置链谈 Agent 商家账号的登录密码。\n\n"
        f"验证码：{code}\n"
        f"有效期：{ttl_minutes} 分钟，仅可使用一次。\n\n"
        "如果这不是你本人的操作，请忽略本邮件，不要向任何人透露验证码。\n"
        f"打开找回密码页面：{reset_url}\n"
    )
    message.set_content(text)

    escaped_code = html.escape(code)
    escaped_url = html.escape(reset_url, quote=True)
    message.add_alternative(
        f"""\
<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:24px;background:#e8edf5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#1a1a2e;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
      <div style="font-size:18px;font-weight:700;">链谈 Agent <span style="color:#2563eb;">· 密码重置</span></div>
      <p style="margin:20px 0 8px;font-size:14px;line-height:1.7;">你正在重置商家账号的登录密码，请在找回密码页面填写下面的验证码：</p>
      <div style="margin:16px 0;padding:16px;border-radius:8px;background:#dbeafe;text-align:center;font-size:30px;font-weight:700;letter-spacing:8px;color:#1d4ed8;">{escaped_code}</div>
      <p style="margin:8px 0;font-size:13px;line-height:1.7;color:#5b6472;">验证码 {ttl_minutes} 分钟内有效，仅可使用一次。</p>
      <p style="margin:8px 0;font-size:13px;line-height:1.7;color:#5b6472;">如果这不是你本人的操作，请忽略本邮件，不要向任何人透露验证码。</p>
      <p style="margin:20px 0 0;"><a href="{escaped_url}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">打开找回密码页面</a></p>
      <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#5b6472;">此邮件由系统自动发送，请勿直接回复。</p>
    </div>
  </body>
</html>
""",
        subtype="html",
    )
    return message


def send_password_reset_code(*, to_email: str, code: str, ttl_minutes: int, reset_url: str) -> None:
    """通过 SMTP 发送验证码邮件。配置缺失抛 MailNotConfigured，发送失败抛 MailDeliveryError。"""
    settings = get_settings()
    if not settings.smtp_host:
        raise MailNotConfigured("SMTP_HOST 未配置")
    sender = settings.smtp_from or settings.smtp_username
    if not sender:
        raise MailNotConfigured("SMTP_FROM 或 SMTP_USERNAME 未配置")

    message = build_password_reset_message(
        to_email=to_email,
        code=code,
        ttl_minutes=ttl_minutes,
        reset_url=reset_url,
    )

    server: smtplib.SMTP | smtplib.SMTP_SSL
    try:
        if settings.smtp_ssl:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds)
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds)
        try:
            server.ehlo()
            if not settings.smtp_ssl and settings.smtp_starttls:
                server.starttls()
                server.ehlo()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password or "")
            server.send_message(message)
        finally:
            try:
                server.quit()
            except (OSError, smtplib.SMTPException):
                # 退出阶段的错误不应掩盖真正的发送结果。
                pass
    except (OSError, smtplib.SMTPException) as exc:
        logger.warning("找回密码邮件发送失败：%s", type(exc).__name__)
        raise MailDeliveryError("邮件发送失败") from exc


def reset_page_url(email: str) -> str:
    """找回密码页面地址；带上 email 只是方便用户回到页面后不用重填。"""
    base = get_settings().frontend_origin.rstrip("/")
    return f"{base}/forgot-password?email={quote(email)}"
