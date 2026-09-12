from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ProductOut(BaseModel):
    id: int
    name: str
    category: str
    description: str
    model_config = ConfigDict(from_attributes=True)


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=1500)
    target_price: float = Field(gt=0)
    hard_max_price: float = Field(gt=0)
    max_moq: int = Field(gt=0)
    max_lead_days: int = Field(default=14, gt=0)
    max_payment_days: int = Field(default=30, ge=0)
    handoff_score: int = Field(default=82, ge=0, le=100)
    required_qualifications: list[str] = []
    preferred_regions: list[str] = []
    # ML 评分（SCORING_MODE=ml 时生效）
    ml_model: Literal["decision_tree", "logistic_regression"] = "decision_tree"
    ml_qualify_threshold: float = Field(default=0.5, ge=0, le=1)
    ml_eliminate_threshold: float = Field(default=0.5, ge=0, le=1)


class ProductUpdate(ProductCreate):
    active: bool = True


class ProductManageOut(ProductCreate):
    id: int
    active: bool


class DashboardItem(BaseModel):
    id: int
    supplier: str
    product: str
    score: int
    price: float
    moq: int
    status: str
    classification: str
    is_today: bool


class DashboardSummary(BaseModel):
    today_received: int
    ai_active: int
    qualified: int
    minutes_saved: int
    items: list[DashboardItem]


class DialogueEvaluationIn(BaseModel):
    sample_size: int = Field(default=10, ge=1, le=20)
    dialogue_type: str | None = None


class RuleOut(BaseModel):
    id: int
    product_id: int
    target_price: float
    hard_max_price: float
    max_moq: int
    max_lead_days: int
    max_payment_days: int
    handoff_score: int
    required_qualifications: list[str]
    preferred_regions: list[str]
    ml_model: str
    ml_qualify_threshold: float
    ml_eliminate_threshold: float
    model_config = ConfigDict(from_attributes=True)


class RuleUpdate(BaseModel):
    target_price: float = Field(gt=0)
    hard_max_price: float = Field(gt=0)
    max_moq: int = Field(gt=0)
    max_lead_days: int = Field(gt=0)
    max_payment_days: int = Field(ge=0)
    handoff_score: int = Field(ge=0, le=100)
    required_qualifications: list[str]
    preferred_regions: list[str]
    ml_model: Literal["decision_tree", "logistic_regression"] = "decision_tree"
    ml_qualify_threshold: float = Field(default=0.5, ge=0, le=1)
    ml_eliminate_threshold: float = Field(default=0.5, ge=0, le=1)


class SupplierOfferIn(BaseModel):
    product_id: int
    company_name: str = Field(min_length=2, max_length=160)
    contact_name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=6, max_length=40)
    region: str = Field(min_length=2, max_length=80)
    quoted_price: float = Field(gt=0)
    moq: int = Field(gt=0)
    lead_days: int = Field(gt=0)
    payment_days: int = Field(default=0, ge=0)
    qualifications: list[str]
    qualification_file_ids: list[str] = []
    cooperation_note: str = Field(default="", max_length=1500)
    cooperation_rating: int = Field(default=60, ge=0, le=100)


class EvaluationOut(BaseModel):
    negotiation_id: int | None = None
    hard_pass: bool
    hard_fail_reasons: list[str]
    score: int
    classification: str
    action: str
    # 规则模式：价格/起订量/资质/区域/配合度五维明细；ML 模式：三类概率。
    score_breakdown: dict[str, int | float] | None = None


class ChatIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class ChatOut(BaseModel):
    negotiation_id: int
    status: str
    assistant_message: str | None
    handoff_required: bool
    classification: str
    score: int


class MessageOut(BaseModel):
    id: int
    sender: str
    content: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class QualificationFileOut(BaseModel):
    id: str
    original_name: str
    content_type: str
    size_bytes: int
    verified: bool
    ocr_status: str = "not_checked"
    ocr_company: str = ""
    ocr_detail: str = ""
    uploaded_at: datetime
    model_config = ConfigDict(from_attributes=True)


class SupplierSummary(BaseModel):
    id: int
    company_name: str
    contact_name: str
    region: str
    qualifications: list[str]
    qualification_files: list[QualificationFileOut] = []
    model_config = ConfigDict(from_attributes=True)

class NegotiationOut(BaseModel):
    id: int
    score: int
    classification: str
    status: str
    quoted_price: float
    moq: int
    lead_days: int
    payment_days: int
    hard_fail_reasons: list[str]
    supplier: SupplierSummary
    product: ProductOut
    messages: list[MessageOut]
    model_config = ConfigDict(from_attributes=True)


class SupplierCodeRequest(BaseModel):
    phone: str = Field(min_length=11, max_length=11, pattern=r"^\d{11}$")


class SupplierCodeOut(BaseModel):
    phone: str
    code: str
    expires_in: int


class SupplierLoginRequest(BaseModel):
    phone: str = Field(min_length=11, max_length=11, pattern=r"^\d{11}$")
    code: str = Field(min_length=6, max_length=6)


class SupplierTokenOut(BaseModel):
    access_token: str
    phone: str


class MerchantLoginIn(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class MerchantPasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


class MerchantProfileIn(BaseModel):
    store_name: str = Field(min_length=1, max_length=120)
    logo_emoji: str = Field(default="", max_length=16)
    logo_image: str = Field(default="", max_length=2_000_000)
    contact: str = Field(default="", max_length=80)
    category: str = Field(default="", max_length=255)


class MerchantProfileOut(BaseModel):
    store_name: str
    logo_emoji: str
    logo_image: str
    contact: str
    category: str


class MerchantTokenOut(MerchantProfileOut):
    access_token: str


class MLPredictIn(BaseModel):
    """机器学习评分：单条供应商报价 + 规则参数。"""
    quoted_price: float = Field(gt=0)
    target_price: float = Field(gt=0)
    moq: int = Field(gt=0)
    max_moq: int = Field(gt=0)
    payment_days: int = Field(ge=0)
    min_payment_days: int = Field(ge=0)
    qualifications: list[str] = []
    model: Literal["decision_tree", "logistic_regression"] = "decision_tree"


class MLPredictOut(BaseModel):
    classification: str
    score: int
    probabilities: dict[str, float]
    model: str
