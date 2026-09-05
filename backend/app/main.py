import asyncio
import json
import secrets
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.database import Base, SessionLocal, engine, get_db
from app.models import Message, Negotiation, ProcurementRule, Product, Supplier, SupplierAuth
from app.schemas import ChatIn, ChatOut, DashboardItem, DashboardSummary, EvaluationOut, NegotiationOut, ProductCreate, ProductManageOut, ProductOut, ProductUpdate, RuleOut, RuleUpdate, SupplierCodeOut, SupplierCodeRequest, SupplierLoginRequest, SupplierOfferIn, SupplierTokenOut
from app.seed import seed_demo_data
from app.security import authorize_negotiation, check_code, issue_code, require_admin, require_supplier
from app.services.llm import generate_negotiation_reply
from app.services.rules import enforce_hard_rules
from app.services.scoring import calculate_supplier_score, classify_supplier


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_demo_data(db)
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_negotiation_or_404(db: Session, negotiation_id: int) -> Negotiation:
    item = db.scalar(
        select(Negotiation)
        .where(Negotiation.id == negotiation_id)
        .options(selectinload(Negotiation.messages), selectinload(Negotiation.supplier), selectinload(Negotiation.product))
    )
    if item is None:
        raise HTTPException(status_code=404, detail="谈判记录不存在")
    return item


def evaluate_offer(rule: ProcurementRule, offer: SupplierOfferIn) -> tuple:
    hard = enforce_hard_rules(
        quoted_price=offer.quoted_price,
        hard_max_price=rule.hard_max_price,
        moq=offer.moq,
        max_moq=rule.max_moq,
        lead_days=offer.lead_days,
        max_lead_days=rule.max_lead_days,
        payment_days=offer.payment_days,
        max_payment_days=rule.max_payment_days,
        qualifications=offer.qualifications,
        required_qualifications=rule.required_qualifications,
    )
    scored = calculate_supplier_score(
        quoted_price=offer.quoted_price,
        target_price=rule.target_price,
        moq=offer.moq,
        max_moq=rule.max_moq,
        qualifications=offer.qualifications,
        required_qualifications=rule.required_qualifications,
        region=offer.region,
        preferred_regions=rule.preferred_regions,
        cooperation_rating=offer.cooperation_rating,
        payment_days=offer.payment_days,
        max_payment_days=rule.max_payment_days,
    )
    classification, action = classify_supplier(hard_pass=hard.passed, score=scored.total, handoff_score=rule.handoff_score)
    return hard, scored, classification, action


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "time": datetime.utcnow().isoformat(), "llm_configured": bool(settings.deepseek_api_key)}


@app.post("/api/auth/supplier/request-code", response_model=SupplierCodeOut)
def request_supplier_code(payload: SupplierCodeRequest):
    phone = payload.phone.strip()
    code = issue_code(phone)
    # 演示模式：验证码不发送短信，直接返回前端并打印到日志。
    print(f"[演示验证码] 手机号 {phone} 的登录验证码为：{code}")
    return SupplierCodeOut(phone=phone, code=code, expires_in=300)


@app.post("/api/auth/supplier/login", response_model=SupplierTokenOut)
def supplier_login(payload: SupplierLoginRequest, db: Session = Depends(get_db)):
    phone = payload.phone.strip()
    if not check_code(phone, payload.code):
        raise HTTPException(status_code=401, detail="验证码错误或已过期")
    auth = db.scalar(select(SupplierAuth).where(SupplierAuth.phone == phone))
    if auth is None:
        auth = SupplierAuth(phone=phone, access_token=secrets.token_urlsafe(32))
        db.add(auth)
    else:
        auth.access_token = secrets.token_urlsafe(32)
        auth.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(auth)
    return SupplierTokenOut(access_token=auth.access_token, phone=auth.phone)


@app.get("/api/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    return db.scalars(select(Product).where(Product.active.is_(True)).order_by(Product.id)).all()


def product_manage_out(product: Product, rule: ProcurementRule) -> ProductManageOut:
    return ProductManageOut(
        id=product.id, name=product.name, category=product.category, description=product.description,
        active=product.active, target_price=rule.target_price, hard_max_price=rule.hard_max_price,
        max_moq=rule.max_moq, max_lead_days=rule.max_lead_days, max_payment_days=rule.max_payment_days,
        handoff_score=rule.handoff_score, required_qualifications=rule.required_qualifications,
        preferred_regions=rule.preferred_regions,
    )


@app.get("/api/products/manage", response_model=list[ProductManageOut])
def manage_products(db: Session = Depends(get_db), _admin: str = Depends(require_admin)):
    products = db.scalars(select(Product).order_by(Product.id)).all()
    rules = {r.product_id: r for r in db.scalars(select(ProcurementRule)).all()}
    return [product_manage_out(p, rules[p.id]) for p in products if p.id in rules]


@app.get("/api/products/catalog", response_model=list[ProductManageOut])
def product_catalog(db: Session = Depends(get_db), _supplier: SupplierAuth = Depends(require_supplier)):
    products = db.scalars(select(Product).where(Product.active.is_(True)).order_by(Product.id)).all()
    rules = {r.product_id: r for r in db.scalars(select(ProcurementRule).where(ProcurementRule.active.is_(True))).all()}
    return [product_manage_out(p, rules[p.id]) for p in products if p.id in rules]


@app.post("/api/products", response_model=ProductManageOut, status_code=201)
def create_product(payload: ProductCreate, db: Session = Depends(get_db), _admin: str = Depends(require_admin)):
    if payload.hard_max_price < payload.target_price:
        raise HTTPException(status_code=422, detail="硬性价格上限不能低于目标价")
    if db.scalar(select(Product).where(Product.name == payload.name.strip())):
        raise HTTPException(status_code=409, detail="商品名称已存在")
    product = Product(name=payload.name.strip(), category=payload.category.strip(), description=payload.description.strip(), active=True)
    db.add(product)
    db.flush()
    rule_data = payload.model_dump(exclude={"name", "category", "description"})
    rule = ProcurementRule(product_id=product.id, active=True, **rule_data)
    db.add(rule)
    db.commit()
    db.refresh(product); db.refresh(rule)
    return product_manage_out(product, rule)


@app.put("/api/products/{product_id}", response_model=ProductManageOut)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db), _admin: str = Depends(require_admin)):
    product = db.get(Product, product_id)
    rule = db.scalar(select(ProcurementRule).where(ProcurementRule.product_id == product_id))
    if product is None or rule is None:
        raise HTTPException(status_code=404, detail="商品不存在")
    duplicate = db.scalar(select(Product).where(Product.name == payload.name.strip(), Product.id != product_id))
    if duplicate:
        raise HTTPException(status_code=409, detail="商品名称已存在")
    if payload.hard_max_price < payload.target_price:
        raise HTTPException(status_code=422, detail="硬性价格上限不能低于目标价")
    product.name, product.category, product.description, product.active = payload.name.strip(), payload.category.strip(), payload.description.strip(), payload.active
    for field, value in payload.model_dump(exclude={"name", "category", "description", "active"}).items():
        setattr(rule, field, value)
    rule.active = payload.active
    db.commit(); db.refresh(product); db.refresh(rule)
    return product_manage_out(product, rule)


@app.delete("/api/products/{product_id}")
def disable_product(product_id: int, db: Session = Depends(get_db), _admin: str = Depends(require_admin)):
    product = db.get(Product, product_id)
    rule = db.scalar(select(ProcurementRule).where(ProcurementRule.product_id == product_id))
    if product is None:
        raise HTTPException(status_code=404, detail="商品不存在")
    product.active = False
    if rule: rule.active = False
    db.commit()
    return {"ok": True, "detail": "商品已停用，历史谈判记录仍保留"}


@app.get("/api/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(db: Session = Depends(get_db), _admin: str = Depends(require_admin)):
    negotiations = db.scalars(select(Negotiation).options(selectinload(Negotiation.supplier), selectinload(Negotiation.product), selectinload(Negotiation.messages)).order_by(Negotiation.updated_at.desc())).all()
    today = datetime.utcnow().date()
    items = [DashboardItem(id=n.id, supplier=n.supplier.company_name, product=n.product.name, score=n.score, price=n.quoted_price, moq=n.moq, status=n.status, classification=n.classification, is_today=n.created_at.date() == today) for n in negotiations]
    automated_messages = sum(1 for n in negotiations for m in n.messages if m.sender == "ai")
    return DashboardSummary(
        today_received=sum(1 for n in negotiations if n.created_at.date() == today),
        ai_active=sum(1 for n in negotiations if n.status == "ai_active"),
        qualified=sum(1 for n in negotiations if n.classification == "qualified"),
        minutes_saved=len(negotiations) * 5 + automated_messages * 3,
        items=items,
    )


@app.get("/api/rules/{product_id}", response_model=RuleOut)
def get_rule(product_id: int, db: Session = Depends(get_db), _admin: str = Depends(require_admin)):
    rule = db.scalar(select(ProcurementRule).where(ProcurementRule.product_id == product_id, ProcurementRule.active.is_(True)))
    if rule is None:
        raise HTTPException(status_code=404, detail="未找到该商品的采购规则")
    return rule


@app.put("/api/rules/{product_id}", response_model=RuleOut)
def update_rule(product_id: int, payload: RuleUpdate, db: Session = Depends(get_db), _admin: str = Depends(require_admin)):
    if payload.hard_max_price < payload.target_price:
        raise HTTPException(status_code=422, detail="硬性价格上限不能低于目标价")
    rule = db.scalar(select(ProcurementRule).where(ProcurementRule.product_id == product_id))
    if rule is None:
        raise HTTPException(status_code=404, detail="采购规则不存在")
    for field, value in payload.model_dump().items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule


@app.post("/api/suppliers/evaluate", response_model=EvaluationOut)
def evaluate_supplier(payload: SupplierOfferIn, db: Session = Depends(get_db), auth: SupplierAuth = Depends(require_supplier)):
    payload.phone = auth.phone  # 身份以登录手机号为准，忽略表单传入的 phone
    rule = db.scalar(select(ProcurementRule).where(ProcurementRule.product_id == payload.product_id, ProcurementRule.active.is_(True)))
    if rule is None:
        raise HTTPException(status_code=404, detail="当前商品没有启用的采购规则")
    hard, scored, classification, action = evaluate_offer(rule, payload)
    supplier = Supplier(
        company_name=payload.company_name,
        contact_name=payload.contact_name,
        phone=payload.phone,
        region=payload.region,
        qualifications=payload.qualifications,
        cooperation_note=payload.cooperation_note,
        cooperation_rating=payload.cooperation_rating,
    )
    db.add(supplier)
    db.flush()
    status = "closed" if classification == "eliminated" else "manual_required" if classification == "qualified" else "ai_active"
    negotiation = Negotiation(
        product_id=payload.product_id,
        supplier_id=supplier.id,
        quoted_price=payload.quoted_price,
        moq=payload.moq,
        lead_days=payload.lead_days,
        payment_days=payload.payment_days,
        score=scored.total,
        classification=classification,
        status=status,
        hard_fail_reasons=hard.reasons,
    )
    db.add(negotiation)
    db.commit()
    db.refresh(negotiation)
    return EvaluationOut(
        negotiation_id=negotiation.id,
        hard_pass=hard.passed,
        hard_fail_reasons=hard.reasons,
        score=scored.total,
        classification=classification,
        action=action,
        score_breakdown=scored.breakdown,
    )


@app.get("/api/negotiations", response_model=list[NegotiationOut])
def list_negotiations(db: Session = Depends(get_db), _admin: str = Depends(require_admin)):
    return db.scalars(select(Negotiation).options(selectinload(Negotiation.messages), selectinload(Negotiation.supplier), selectinload(Negotiation.product)).order_by(Negotiation.updated_at.desc())).all()


@app.get("/api/negotiations/{negotiation_id}", response_model=NegotiationOut)
def get_negotiation(negotiation_id: int, db: Session = Depends(get_db), authorization: str | None = Header(default=None)):
    negotiation = get_negotiation_or_404(db, negotiation_id)
    authorize_negotiation(db, negotiation.supplier.phone, authorization)
    return negotiation


@app.post("/api/negotiations/{negotiation_id}/messages", response_model=ChatOut)
async def post_supplier_message(negotiation_id: int, payload: ChatIn, db: Session = Depends(get_db), auth: SupplierAuth = Depends(require_supplier)):
    negotiation = get_negotiation_or_404(db, negotiation_id)
    if negotiation.supplier.phone != auth.phone:
        raise HTTPException(status_code=403, detail="无权操作该谈判会话")
    history = [
        {"role": "user" if m.sender == "supplier" else "assistant", "content": m.content}
        for m in negotiation.messages
        if m.sender in {"supplier", "ai"}
    ]
    db.add(Message(negotiation_id=negotiation.id, sender="supplier", content=payload.content))

    # 人工接管或优质候选状态下，程序层硬性禁止 LLM 自动回复。
    if negotiation.status in {"manual_required", "human_active"} or negotiation.classification == "qualified":
        negotiation.status = "manual_required"
        db.commit()
        return ChatOut(negotiation_id=negotiation.id, status=negotiation.status, assistant_message=None, handoff_required=True, classification=negotiation.classification, score=negotiation.score)

    if negotiation.status == "closed" or negotiation.classification == "eliminated":
        closing = "感谢您提供资料。当前供货条件与我们的采购要求暂不匹配，本次暂不继续洽谈。"
        db.add(Message(negotiation_id=negotiation.id, sender="ai", content=closing))
        db.commit()
        return ChatOut(negotiation_id=negotiation.id, status="closed", assistant_message=closing, handoff_required=False, classification="eliminated", score=negotiation.score)

    reply = await generate_negotiation_reply(
        supplier_message=payload.content,
        decision_context=f"继续 AI 议价；当前评分 {negotiation.score}；禁止做出下单或付款承诺。",
        history=history,
    )
    db.add(Message(negotiation_id=negotiation.id, sender="ai", content=reply))
    db.commit()
    return ChatOut(negotiation_id=negotiation.id, status=negotiation.status, assistant_message=reply, handoff_required=False, classification=negotiation.classification, score=negotiation.score)


@app.post("/api/negotiations/{negotiation_id}/handoff", response_model=NegotiationOut)
def handoff_to_human(negotiation_id: int, db: Session = Depends(get_db), _admin: str = Depends(require_admin)):
    negotiation = get_negotiation_or_404(db, negotiation_id)
    if negotiation.classification == "eliminated":
        raise HTTPException(status_code=409, detail="已淘汰供应商不可转入人工洽谈")
    negotiation.status = "human_active"
    db.add(Message(negotiation_id=negotiation.id, sender="system", content="商家已接管谈判，AI 自动回复已停止。"))
    db.commit()
    return get_negotiation_or_404(db, negotiation_id)


@app.post("/api/negotiations/{negotiation_id}/human-messages", response_model=NegotiationOut)
def post_human_message(negotiation_id: int, payload: ChatIn, db: Session = Depends(get_db), _admin: str = Depends(require_admin)):
    negotiation = get_negotiation_or_404(db, negotiation_id)
    if negotiation.classification == "eliminated":
        raise HTTPException(status_code=409, detail="已淘汰供应商不可继续洽谈")
    negotiation.status = "human_active"
    db.add(Message(negotiation_id=negotiation.id, sender="human", content=payload.content))
    db.commit()
    return get_negotiation_or_404(db, negotiation_id)


@app.post("/api/negotiations/{negotiation_id}/resume-ai", response_model=NegotiationOut)
def resume_ai(negotiation_id: int, db: Session = Depends(get_db), _admin: str = Depends(require_admin)):
    negotiation = get_negotiation_or_404(db, negotiation_id)
    if negotiation.classification == "qualified":
        raise HTTPException(status_code=409, detail="优质候选已触发人工接管规则，不能恢复 AI 自动回复")
    if negotiation.classification == "eliminated":
        raise HTTPException(status_code=409, detail="已淘汰供应商不能恢复谈判")
    negotiation.status = "ai_active"
    db.add(Message(negotiation_id=negotiation.id, sender="system", content="商家已恢复 AI 自动谈判。"))
    db.commit()
    return get_negotiation_or_404(db, negotiation_id)


@app.get("/api/negotiations/{negotiation_id}/stream")
async def stream_negotiation(negotiation_id: int, _admin: str = Depends(require_admin)):
    async def events():
        last_signature = None
        for _ in range(900):
            with SessionLocal() as db:
                negotiation = db.get(Negotiation, negotiation_id)
                if negotiation is None:
                    yield "event: error\ndata: {\"detail\": \"谈判记录不存在\"}\n\n"
                    return
                snapshot = {"id": negotiation.id, "status": negotiation.status, "score": negotiation.score, "classification": negotiation.classification}
                signature = json.dumps(snapshot, ensure_ascii=False, sort_keys=True)
                if signature != last_signature:
                    yield f"event: status\ndata: {signature}\n\n"
                    last_signature = signature
                else:
                    yield ": keep-alive\n\n"
                if negotiation.status == "closed":
                    return
            await asyncio.sleep(2)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
