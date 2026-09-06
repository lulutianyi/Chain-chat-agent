from datetime import datetime

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


class ScoreBreakdown(BaseModel):
    price: int
    moq: int
    qualification: int
    region: int
    cooperation: int


class EvaluationOut(BaseModel):
    negotiation_id: int | None = None
    hard_pass: bool
    hard_fail_reasons: list[str]
    score: int
    classification: str
    action: str
    score_breakdown: ScoreBreakdown


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
    phone: str = Field(min_length=6, max_length=40)


class SupplierCodeOut(BaseModel):
    phone: str
    code: str
    expires_in: int


class SupplierLoginRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=40)
    code: str = Field(min_length=6, max_length=6)


class SupplierTokenOut(BaseModel):
    access_token: str
    phone: str
