from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "链谈 Agent API"
    # dev / prod。设为 prod 时启动会做一轮强制自检（见 app/startup_checks.py）。
    environment: str = "dev"
    database_url: str = "sqlite:///./liantan.db"
    frontend_origin: str = "http://localhost:3000"
    # 演示用管理员令牌。留空（默认）即完全禁用这条兜底鉴权路径；
    # 历史上这里有一个硬编码默认值，等于公开部署时的人人可登录后门。
    admin_token: str = ""
    # 演示模式：验证码不发送短信，而是直接回给前端，方便没有短信服务时跑通流程。
    # 打开意味着「任何人可以对任意手机号拿到验证码并登录」，因此 ENVIRONMENT=prod 时必须关闭。
    demo_mode: bool = True
    # 采购方（商家）登录凭证：公开部署时务必通过环境变量改成强密码。
    merchant_password: str = "链谈Agent123"
    # 账号 + 密码登录的账号，以及手机验证码登录绑定的手机号（演示值，可被环境变量覆盖）。
    merchant_account: str = "admin"
    merchant_phone: str = "13800138000"
    deepseek_api_key: str | None = None
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com"
    baidu_api_key: str | None = None
    baidu_secret_key: str | None = None
    # 找回密码邮件（SMTP）。未配置时接口返回 503，不会把验证码回显给前端。
    # 常见配置：Gmail/企业邮箱 smtp_host=smtp.example.com, smtp_port=587, smtp_starttls=true；
    # 465 端口的服务用 smtp_ssl=true、smtp_starttls=false。
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_starttls: bool = True
    smtp_ssl: bool = False
    smtp_timeout_seconds: int = 15
    # 找回密码：验证码/重置令牌有效期与单个验证码的最大尝试次数。
    password_reset_code_ttl_minutes: int = 10
    password_reset_token_ttl_minutes: int = 10
    password_reset_max_attempts: int = 5
    # 供应商重复提交的幂等窗口（秒）。同一供应商对同一商品在窗口内提交
    # 完全相同的条件时复用已有会话，避免双击/网络重试产生重复档案。
    # 设为 0 关闭该行为。
    evaluate_dedupe_seconds: int = 120
    # 日志格式：auto（prod 用 JSON，dev 用可读格式）/ json / text
    log_format: str = "auto"
    # 登录令牌有效期（天）。0 表示永不过期（不建议，仅用于本地调试）。
    # 之前令牌是永久有效的静态串，泄露一次等于永久可登录。
    token_ttl_days: int = 30
    # 供应商评分模式（全局兜底）：现按商品级 procurement_rules.scoring_model 决定（custom_rule / ml）。
    scoring_mode: str = "rule"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
