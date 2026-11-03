"""Alembic 运行环境。

关键点：数据库地址与模型元数据都从应用里取，不在这里另写一份，
避免出现「迁移脚本连的库」和「应用连的库」不一致。

接入方式见 README「数据库迁移」一节：存量库此前由 create_all + 启动期补列维护，
没有 alembic_version 表，因此第一次接入需先 `alembic stamp head` 标记基线。
应用启动路径仍保留 create_all，没有自动跑迁移——这是刻意的：
在无法对真实生产库做验证之前，不改动启动逻辑。
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.config import get_settings
from app.database import Base
# 必须导入模型模块，Base.metadata 里才会有表定义（autogenerate 依赖它）。
import app.models  # noqa: F401

config = context.config
# 允许调用方（例如测试）关掉日志重配置，避免把 pytest 的日志设置冲掉。
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    """优先用环境变量 / .env 里的 DATABASE_URL，而不是 alembic.ini 里的占位值。"""
    return get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(get_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite 不支持大部分 ALTER，用 batch 模式重建表来模拟。
            render_as_batch=True,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
