"""Alembic 基线的正确性验证。

接入 Alembic 最大的风险是「基线迁移建出来的表结构」与「模型定义」不一致：
那样存量库一旦 stamp head，后续所有迁移都会基于一个错误的起点工作，
而且往往到下一次加列时才炸出来。

因此这里不靠人眼核对，而是在临时库上分别用两种方式建表再逐项比对：
  A) alembic upgrade head（迁移路径）
  B) Base.metadata.create_all（模型路径）
两者必须完全一致，否则说明基线该重新生成。
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.config import get_settings
from app.database import Base

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _alembic_config(db_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    # 关掉 env.py 里的 fileConfig，避免打断 pytest 的日志配置
    config.attributes["configure_logger"] = False
    return config


def _schema_snapshot(db_url: str) -> dict:
    """把库结构拍平成可比较的字典：表 / 列 / 索引 / 唯一约束 / 外键 / 主键。"""
    engine = create_engine(db_url)
    inspector = inspect(engine)
    snapshot: dict = {}
    for table in sorted(inspector.get_table_names()):
        if table == "alembic_version":  # 迁移自身的管理表，不参与比对
            continue
        columns = {
            col["name"]: (str(col["type"]), bool(col["nullable"]))
            for col in inspector.get_columns(table)
        }
        indexes = {
            idx["name"]: (tuple(idx["column_names"]), bool(idx.get("unique")))
            for idx in inspector.get_indexes(table)
        }
        uniques = {
            uc["name"]: tuple(uc["column_names"])
            for uc in inspector.get_unique_constraints(table)
        }
        foreign_keys = {
            fk["name"] or f"{table}->{tuple(fk['constrained_columns'])}": (
                tuple(fk["constrained_columns"]),
                fk["referred_table"],
            )
            for fk in inspector.get_foreign_keys(table)
        }
        snapshot[table] = {
            "columns": columns,
            "indexes": indexes,
            "unique": uniques,
            "foreign_keys": foreign_keys,
            "primary_key": tuple(inspector.get_pk_constraint(table)["constrained_columns"]),
        }
    engine.dispose()
    return snapshot


def test_alembic_baseline_matches_model_metadata(monkeypatch, tmp_path):
    migrated_url = f"sqlite:///{tmp_path / 'migrated.db'}"
    created_url = f"sqlite:///{tmp_path / 'created.db'}"

    # A) 走迁移：先清掉 settings 缓存，让 env.py 读到临时库地址
    monkeypatch.setenv("DATABASE_URL", migrated_url)
    get_settings.cache_clear()
    try:
        command.upgrade(_alembic_config(migrated_url), "head")
    finally:
        get_settings.cache_clear()

    # B) 走模型定义
    engine = create_engine(created_url)
    Base.metadata.create_all(engine)
    engine.dispose()

    migrated = _schema_snapshot(migrated_url)
    created = _schema_snapshot(created_url)

    assert set(migrated) == set(created), (
        f"迁移与模型的表不一致：仅迁移有 {set(migrated) - set(created)}，"
        f"仅模型有 {set(created) - set(migrated)}"
    )
    for table in sorted(created):
        for aspect in ("columns", "indexes", "unique", "foreign_keys", "primary_key"):
            assert migrated[table][aspect] == created[table][aspect], (
                f"表 {table} 的 {aspect} 不一致：\n"
                f"  迁移：{migrated[table][aspect]}\n"
                f"  模型：{created[table][aspect]}\n"
                "说明模型改过但基线没重新生成。"
            )


def test_alembic_upgrade_is_idempotent_on_existing_database(monkeypatch, tmp_path):
    """存量库的接入方式：stamp head 之后 upgrade 不应再改动任何结构。

    这正是我们给现有 SQLite / Supabase 库准备的路径，
    因此要保证 stamp 之后不会试图重建已经存在的表。
    """
    db_url = f"sqlite:///{tmp_path / 'existing.db'}"
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)  # 模拟「已经用 create_all 建好的存量库」
    engine.dispose()

    config = _alembic_config(db_url)
    monkeypatch.setenv("DATABASE_URL", db_url)
    get_settings.cache_clear()
    try:
        command.stamp(config, "head")
        before = _schema_snapshot(db_url)
        command.upgrade(config, "head")
    finally:
        get_settings.cache_clear()
    after = _schema_snapshot(db_url)

    assert before == after, "存量库 stamp 后再 upgrade 不应改动结构"
