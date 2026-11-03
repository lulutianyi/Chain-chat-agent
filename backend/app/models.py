from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    merchant_id: Mapped[int] = mapped_column(ForeignKey("merchant_accounts.id"), index=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    category: Mapped[str] = mapped_column(String(80), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)


class ProcurementRule(Base):
    __tablename__ = "procurement_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), unique=True, index=True)
    target_price: Mapped[float] = mapped_column(Float)
    hard_max_price: Mapped[float] = mapped_column(Float)
    max_moq: Mapped[int] = mapped_column(Integer)
    max_lead_days: Mapped[int] = mapped_column(Integer, default=14)
    max_payment_days: Mapped[int] = mapped_column(Integer, default=30)
    handoff_score: Mapped[int] = mapped_column(Integer, default=82)
    required_qualifications: Mapped[list[str]] = mapped_column(JSON, default=list)
    preferred_regions: Mapped[list[str]] = mapped_column(JSON, default=list)
    # 打分模型：custom_rule = 自定义规则（百分制七维权重），ml = 机器学习打分
    scoring_model: Mapped[str] = mapped_column(String(32), default="custom_rule")
    # 自定义规则的七维满分（JSON，键见 scoring.DEFAULT_SCORE_WEIGHTS）；空时按默认值打分
    score_weights: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    # ML 评分（scoring_model=ml 时生效）：主模型 + 两个可调概率门槛
    ml_model: Mapped[str] = mapped_column(String(32), default="decision_tree")
    ml_qualify_threshold: Mapped[float] = mapped_column(Float, default=0.5)
    ml_eliminate_threshold: Mapped[float] = mapped_column(Float, default=0.5)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    product: Mapped[Product] = relationship()


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    merchant_id: Mapped[int] = mapped_column(ForeignKey("merchant_accounts.id"), index=True)
    company_name: Mapped[str] = mapped_column(String(160), index=True)
    contact_name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str] = mapped_column(String(40))
    region: Mapped[str] = mapped_column(String(80), index=True)
    qualifications: Mapped[list[str]] = mapped_column(JSON, default=list)
    cooperation_note: Mapped[str] = mapped_column(Text, default="")
    cooperation_rating: Mapped[int] = mapped_column(Integer, default=60)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    qualification_files: Mapped[list["QualificationFile"]] = relationship()


class Negotiation(Base):
    __tablename__ = "negotiations"
    __table_args__ = (
        Index("idx_negotiations_status_score", "status", "score"),
        Index("idx_negotiations_product_status", "product_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    merchant_id: Mapped[int] = mapped_column(ForeignKey("merchant_accounts.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    quoted_price: Mapped[float] = mapped_column(Float)
    moq: Mapped[int] = mapped_column(Integer)
    lead_days: Mapped[int] = mapped_column(Integer)
    payment_days: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[int] = mapped_column(Integer, default=0)
    classification: Mapped[str] = mapped_column(String(32), default="negotiating", index=True)
    status: Mapped[str] = mapped_column(String(32), default="ai_active")
    hard_fail_reasons: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    product: Mapped[Product] = relationship()
    supplier: Mapped[Supplier] = relationship()
    messages: Mapped[list["Message"]] = relationship(back_populates="negotiation", cascade="all, delete-orphan")


class QualificationFile(Base):
    __tablename__ = "qualification_files"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), index=True)
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(128))
    content_type: Mapped[str] = mapped_column(String(128), default="")
    # 文件字节直接入库（SQLite 用 BLOB / PostgreSQL 用 BYTEA）：云主机磁盘不持久，改存数据库避免重启丢失。
    #
    # deferred=True：列表类接口（谈判列表、供应商谈判、仪表盘）都会 selectinload 资质文件，
    # 但响应模型里根本没有 data 字段——不延迟加载的话，每次列会话都会把
    # 所有附件（单个上限 5MB）读进内存再丢掉。只有真正下载文件时才触发这一列的查询。
    data: Mapped[bytes] = mapped_column(LargeBinary, default=b"", deferred=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    # OCR 自动核验结果：not_checked / passed / mismatch / not_applicable / unavailable
    ocr_status: Mapped[str] = mapped_column(String(32), default="not_checked")
    ocr_company: Mapped[str] = mapped_column(String(255), default="")
    ocr_detail: Mapped[str] = mapped_column(String(500), default="")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    negotiation_id: Mapped[int] = mapped_column(ForeignKey("negotiations.id"), index=True)
    sender: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    negotiation: Mapped[Negotiation] = relationship(back_populates="messages")


class SupplierAuth(Base):
    __tablename__ = "supplier_auths"

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    access_token: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PasswordResetChallenge(Base):
    """找回密码挑战：先发邮箱验证码，验证通过后换一次性重置令牌。

    验证码用慢哈希保存，令牌用 SHA-256 保存；两者都不落明文。
    每次请求先清掉该商家未完成的旧挑战，避免多封邮件里的验证码同时有效。
    """

    __tablename__ = "password_reset_challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    merchant_id: Mapped[int] = mapped_column(ForeignKey("merchant_accounts.id"), index=True)
    email: Mapped[str] = mapped_column(String(160), index=True)
    code_hash: Mapped[str] = mapped_column(String(255))
    token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MerchantAccount(Base):
    """采购方（商家）账号：多商家，每个商家一行。账号/手机号/邮箱全局唯一。"""

    __tablename__ = "merchant_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    store_name: Mapped[str] = mapped_column(String(120), default="小鹿生活馆")
    logo_emoji: Mapped[str] = mapped_column(String(16), default="🦌")
    logo_image: Mapped[str] = mapped_column(Text, default="")
    contact: Mapped[str] = mapped_column(String(80), default="")
    category: Mapped[str] = mapped_column(String(255), default="")
    account: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    access_token: Mapped[str | None] = mapped_column(String(80), nullable=True)
