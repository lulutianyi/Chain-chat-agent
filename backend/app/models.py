from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
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
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    product: Mapped[Product] = relationship()


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
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


class MerchantAccount(Base):
    """采购方（商家）账号：单商家演示，仅一行。密码哈希 + 登录令牌 + 个人资料。"""

    __tablename__ = "merchant_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    store_name: Mapped[str] = mapped_column(String(120), default="小鹿生活馆")
    logo_emoji: Mapped[str] = mapped_column(String(16), default="🦌")
    logo_image: Mapped[str] = mapped_column(Text, default="")
    contact: Mapped[str] = mapped_column(String(80), default="")
    category: Mapped[str] = mapped_column(String(255), default="")
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    access_token: Mapped[str | None] = mapped_column(String(80), nullable=True)
