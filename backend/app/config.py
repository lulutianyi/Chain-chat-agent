from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "链谈 Agent API"
    database_url: str = "sqlite:///./liantan.db"
    frontend_origin: str = "http://localhost:3000"
    admin_token: str = "lantan-admin-demo-2025"
    deepseek_api_key: str | None = None
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com"
    baidu_api_key: str | None = None
    baidu_secret_key: str | None = None
    # 供应商评分模式（全局兜底）：现按商品级 procurement_rules.scoring_model 决定（custom_rule / ml）。
    scoring_mode: str = "rule"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
