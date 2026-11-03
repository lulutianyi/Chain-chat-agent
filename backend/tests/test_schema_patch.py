"""存量库启动补列的回归测试。

这条路径只在「线上是旧库」时才会走到：本地全新的 SQLite 永远不触发它。
2026-10 的 Render 部署事故正是它悄悄失效导致的——补列逻辑只认 SQLite
（`PRAGMA table_info`），而线上是 Supabase（PostgreSQL），
于是 merchant_accounts 一直缺 account 列，seed 一查就 UndefinedColumn、服务启动即退出。

因此这里既验证「老库能被补齐」，也固定住两条容易改坏的行为：
  · 补列只做加法，老数据必须原样保留；
  · 没有声明默认值的新列按可空列加（留 NULL 给 backfill），不能凭空造 0。
"""

from sqlalchemy import create_engine, inspect
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.database import Base
from app.main import _add_column_sql, _normalize_products_name_index, _patch_missing_columns
from app.models import MerchantAccount, Product, QualificationFile
from app.seed import seed_merchant_account


def _legacy_database(engine) -> None:
    """造一个「更早版本」的库：merchant_accounts 缺 account/phone/email，
    products 缺 merchant_id，且商品名还带着全局唯一索引。"""
    with engine.begin() as conn:
        conn.exec_driver_sql(
            """
            CREATE TABLE merchant_accounts (
                id INTEGER PRIMARY KEY,
                store_name VARCHAR(120) NOT NULL,
                logo_emoji VARCHAR(16) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                access_token VARCHAR(80)
            )
            """
        )
        conn.exec_driver_sql(
            "INSERT INTO merchant_accounts (id, store_name, logo_emoji, password_hash) "
            "VALUES (1, '小鹿生活馆', '🦌', 'legacy-hash')"
        )
        conn.exec_driver_sql("CREATE TABLE products (id INTEGER PRIMARY KEY, name VARCHAR(120) NOT NULL)")
        conn.exec_driver_sql("CREATE UNIQUE INDEX ix_products_name ON products (name)")
        conn.exec_driver_sql("INSERT INTO products (id, name) VALUES (1, '收纳盒')")
    # 其余表按当前模型建好（真实老库里它们大多已经存在）
    Base.metadata.create_all(engine)


def test_patch_adds_missing_columns_and_keeps_data(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    _legacy_database(engine)

    _patch_missing_columns(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("merchant_accounts")}
    assert {"account", "phone", "email", "logo_image", "contact", "category"} <= columns
    assert "merchant_id" in {column["name"] for column in inspect(engine).get_columns("products")}

    with engine.connect() as conn:
        store_name, account = conn.exec_driver_sql(
            "SELECT store_name, account FROM merchant_accounts WHERE id = 1"
        ).one()
        (product_name,) = conn.exec_driver_sql("SELECT name FROM products WHERE id = 1").one()
    # 老数据一行都不能少，新列留空由应用回填
    assert store_name == "小鹿生活馆"
    assert account is None
    assert product_name == "收纳盒"


def test_patch_is_idempotent(tmp_path):
    """已经补过的库再启动一次不能报错，也不能再产生 ALTER。"""
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    _legacy_database(engine)

    _patch_missing_columns(engine)
    before = {table: {c["name"] for c in inspect(engine).get_columns(table)} for table in ("merchant_accounts", "products")}
    _patch_missing_columns(engine)  # 第二次应当是纯空转
    after = {table: {c["name"] for c in inspect(engine).get_columns(table)} for table in ("merchant_accounts", "products")}

    assert before == after


def test_columns_without_declared_default_are_added_nullable(tmp_path):
    """没有默认值的新列必须可空：填 0 会让 _backfill_merchant_ids 找不到这些行。"""
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    _legacy_database(engine)

    _patch_missing_columns(engine)

    merchant_id = next(c for c in inspect(engine).get_columns("products") if c["name"] == "merchant_id")
    assert merchant_id["nullable"] is True


def test_startup_seed_recovers_after_patch(tmp_path):
    """复现事故现场：老库直接 seed 会崩，补列之后必须能读能写。"""
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    _legacy_database(engine)

    with Session(engine) as db:
        try:
            seed_merchant_account(db)
        except OperationalError:
            pass  # 老库缺列时的真实表现（PostgreSQL 上是 ProgrammingError）
        else:  # pragma: no cover - 只有模型回退到不查这些列时才会走到
            raise AssertionError("老库缺列时 seed 本应先失败，用来证明这个用例确实复现了事故")

    _patch_missing_columns(engine)

    with Session(engine) as db:
        account = seed_merchant_account(db)
        assert account.account, "补列后 seed 应把账号回填进老库"
        assert account.phone


def test_products_name_index_is_rebuilt_as_non_unique(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    _legacy_database(engine)

    _normalize_products_name_index(engine)

    indexes = {index["name"]: index for index in inspect(engine).get_indexes("products")}
    # SQLite 的 inspector 返回 0/1 而不是 False/True，这里只断言「不是唯一索引」
    assert not indexes["ix_products_name"]["unique"]


def test_postgres_ddl_is_valid_without_a_server():
    """没有 PostgreSQL 服务也要能盯住发给线上的 SQL：类型、默认值、可空三件事。"""
    account = MerchantAccount.__table__.c.account
    assert _add_column_sql(postgresql.dialect(), "merchant_accounts", account) == (
        "ALTER TABLE merchant_accounts ADD COLUMN account VARCHAR(80)"
    )
    emoji = MerchantAccount.__table__.c.logo_emoji
    assert _add_column_sql(postgresql.dialect(), "merchant_accounts", emoji) == (
        "ALTER TABLE merchant_accounts ADD COLUMN logo_emoji VARCHAR(16) DEFAULT '🦌' NOT NULL"
    )
    ocr_status = QualificationFile.__table__.c.ocr_status
    assert _add_column_sql(postgresql.dialect(), "qualification_files", ocr_status) == (
        "ALTER TABLE qualification_files ADD COLUMN ocr_status VARCHAR(32) DEFAULT 'not_checked' NOT NULL"
    )
    # BYTEA 的空值在两种方言里写法不同，所以二进制列一律按可空列补，不带默认值
    data = QualificationFile.__table__.c.data
    assert _add_column_sql(postgresql.dialect(), "qualification_files", data) == (
        "ALTER TABLE qualification_files ADD COLUMN data BYTEA"
    )
    # 外键列同样不带默认值（留 NULL 给 backfill）
    merchant_id = Product.__table__.c.merchant_id
    assert _add_column_sql(postgresql.dialect(), "products", merchant_id) == (
        "ALTER TABLE products ADD COLUMN merchant_id INTEGER"
    )
