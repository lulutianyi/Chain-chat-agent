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


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    negotiation_id: Mapped[int] = mapped_column(ForeignKey("negotiations.id"), index=True)
    sender: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    negotiation: Mapped[Negotiation] = relationship(back_populates="messages")
