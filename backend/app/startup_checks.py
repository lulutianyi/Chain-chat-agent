"""启动期配置自检。

目的：把「配错了但没人发现」变成「启动即失败」。
最典型的两个坑——生产环境仍开着演示模式（任意手机号可被登录）、
以及忘了设置 DATABASE_URL 导致数据写进容器临时盘（重启即丢）。
"""

import logging

from app.config import Settings

logger = logging.getLogger("liantan")


class ConfigError(RuntimeError):
    """配置不合法，拒绝启动。"""


def validate_settings(settings: Settings) -> list[str]:
    """返回警告列表；配置不可接受时直接抛 ConfigError。"""
    warnings: list[str] = []
    is_prod = settings.environment.strip().lower() in {"prod", "production"}

    if is_prod:
        problems: list[str] = []
        if settings.demo_mode:
            problems.append(
                "DEMO_MODE 仍为开启：任何人都可以对任意手机号取到验证码并登录。"
                "请接入短信服务后设置 DEMO_MODE=false"
            )
        if settings.database_url.startswith("sqlite"):
            problems.append(
                "DATABASE_URL 仍指向 SQLite：托管平台的磁盘是临时的，重启会丢数据。"
                "请改为 PostgreSQL 连接串"
            )
        if settings.admin_token:
            problems.append("ADMIN_TOKEN 非空：这条兜底鉴权在生产环境应当完全禁用，请留空")
        if settings.merchant_password in {"", "链谈Agent123"}:
            problems.append("MERCHANT_PASSWORD 仍是默认值或为空，请改成强密码")
        if not settings.frontend_origin.startswith("https://"):
            problems.append("FRONTEND_ORIGIN 不是 https 地址，请填写实际前端域名")
        if problems:
            raise ConfigError("生产环境配置自检未通过：\n  - " + "\n  - ".join(problems))
    else:
        if settings.demo_mode:
            warnings.append(
                "DEMO_MODE 已开启：验证码直接返回给前端，任何人可用任意手机号登录。"
                "仅限本地演示使用"
            )
        if settings.database_url.startswith("sqlite"):
            warnings.append("使用 SQLite 本地库，重启不丢数据但无法多实例部署")
        if settings.admin_token:
            warnings.append("ADMIN_TOKEN 非空：这条兜底鉴权可用于免登录访问商家数据，公开部署请留空")

    for item in warnings:
        logger.warning("[配置提醒] %s", item)
    return warnings
