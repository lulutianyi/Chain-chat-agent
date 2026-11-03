from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
is_sqlite = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}

# 连接池参数：不显式配置时默认只有 5 个连接 + 10 个溢出，
# 而谈判接口会在事务里等大模型返回（最长 60s），几个并发慢请求就能把池子占满。
# SQLite 走默认的 NullPool/单文件语义，不传这些参数。
pool_kwargs = {} if is_sqlite else {
    "pool_size": 10,
    "max_overflow": 20,
    "pool_timeout": 30,
    "pool_recycle": 1800,
}
engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    **pool_kwargs,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    """每个请求一个会话。

    异常路径必须显式回滚：否则连接归还连接池时仍带着未结束的事务，
    下一个请求可能读到脏数据或长时间持锁。
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
