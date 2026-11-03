import asyncio
import hashlib
import json
import logging
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from sqlalchemy import delete, func, inspect, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.logging_config import RequestTimer, new_request_id, request_id_var, setup_logging
from app.ratelimit import clear_failures, client_ip, enforce, guard, record_failure
from app.startup_checks import validate_settings
from app.uploads import ALLOWED_TYPES, MAX_UPLOAD_BYTES, detect_file_type, normalize_suffix, read_limited, sanitize_filename
from app.database import Base, SessionLocal, engine, get_db
from app.models import MerchantAccount, Message, Negotiation, PasswordResetChallenge, ProcurementRule, Product, QualificationFile, Supplier, SupplierAuth
from app.schemas import ChatIn, ChatOut, DashboardItem, DashboardSummary, DialogueEvaluationIn, EvaluationOut, MerchantCodeLoginIn, MerchantCodeOut, MerchantCodeRequest, MerchantForgotPasswordIn, MerchantForgotPasswordOut, MerchantPasswordIn, MerchantPasswordLoginIn, MerchantProfileIn, MerchantProfileOut, MerchantRegisterIn, MerchantResetPasswordIn, MerchantTokenOut, MerchantVerifyResetCodeIn, MerchantVerifyResetCodeOut, MLPredictIn, MLPredictOut, NegotiationOut, ProductCreate, ProductManageOut, ProductOut, ProductUpdate, QualificationFileOut, RuleOut, RuleUpdate, SupplierCodeOut, SupplierCodeRequest, SupplierLoginRequest, SupplierOfferIn, SupplierTokenOut
from app.seed import seed_demo_data, seed_merchant_account
from app.security import authorize_negotiation, check_code, hash_password, issue_code, issue_token, require_buyer, require_merchant, require_supplier, validate_password, verify_password
from app.services.llm import SERVICE_UNAVAILABLE_NOTICE, NegotiationTurn, generate_boundary_recovery_reply, generate_negotiation_reply, generate_negotiation_turn, generate_opening_message
from app.services.mailer import MailDeliveryError, MailNotConfigured, reset_page_url, send_password_reset_code
from app.services.qualification_check import company_matches, read_business_license
from app.services.rules import enforce_hard_rules
from app.services.scoring import DEFAULT_SCORE_WEIGHTS, ScoreResult, calculate_supplier_score, classify_supplier
from app.services.term_extraction import extract_supplier_terms
from app.services.evaluation import LABEL_ZH, dataset_summary, dialogue_cases, dialogue_safety_pass, dialogue_strategy_pass, run_rule_evaluation
from app.services import ml_scoring

POLITE_CLOSE_REPLY = "感谢您提供资料。当前供货条件与我们的采购要求暂不匹配，本次暂不继续洽谈。"

# 资质文件存储：字节直接入库（见 models.QualificationFile.data），此路径保留仅供测试 monkeypatch 与本地旧数据迁移参考。
UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 配置自检放在最前面：生产环境配错时直接拒绝启动，而不是带病运行。
    validate_settings(settings)
    json_logs = settings.log_format == "json" or (
        settings.log_format == "auto" and settings.environment.strip().lower() in {"prod", "production"}
    )
    setup_logging(json_output=json_logs)
    logger.info("服务启动", extra={"environment": settings.environment, "demo_mode": settings.demo_mode})
    Base.metadata.create_all(bind=engine)
    _patch_missing_columns(engine)
    _normalize_products_name_index(engine)
    with SessionLocal() as db:
        merchant = seed_merchant_account(db)
        _backfill_merchant_ids(db, merchant.id)
        seed_demo_data(db, merchant.id)
    yield


def _patch_missing_columns(engine) -> None:
    """create_all 只建表、不加列：启动时把存量库里缺的列补上。

    为什么必须对所有方言生效：线上是 Supabase（PostgreSQL），表是更早版本的
    create_all 建的。这里以前只处理 SQLite（`PRAGMA table_info`），于是线上库
    永远补不上后续新增的列——seed 一查 merchant_accounts.account 就 UndefinedColumn，
    服务在启动阶段直接退出（2026-10 的 Render 部署事故就是这个）。

    规则（只做加法，不改类型、不改约束、不删列）：
      · 模型里声明了常量默认值的新列 → `ADD COLUMN ... DEFAULT <值> NOT NULL`，与模型一致；
      · 其余新列 → 按**可空列**加上。
        这一条是刻意的：存量表已有数据，凭空造一个默认值（比如给 merchant_id 填 0）
        会让启动期的 _backfill_merchant_ids 找不到这些行，历史数据等于丢了；
        留 NULL 则与「老库从没写过这列」的语义一致，由 backfill 写入正确值。
    补了哪些列会以 WARNING 记进日志，方便在部署日志里确认修复生效。
    """
    inspector = inspect(engine)
    added: list[str] = []
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {column["name"] for column in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                conn.exec_driver_sql(_add_column_sql(engine.dialect, table.name, column))
                added.append(f"{table.name}.{column.name}")
    if added:
        logger.warning("存量库缺列，已自动补齐：%s", ", ".join(added))


def _add_column_sql(dialect, table_name: str, column) -> str:
    """拼一条 ADD COLUMN。列类型直接取自模型，避免在这里再抄一份类型定义。"""
    sql = f"ALTER TABLE {table_name} ADD COLUMN {column.name} {column.type.compile(dialect)}"
    default = _declared_default_literal(column)
    if default is not None:
        sql += f" DEFAULT {default}"
        if not column.nullable:
            sql += " NOT NULL"
    return sql


def _declared_default_literal(column) -> str | None:
    """取模型里声明的常量默认值，转成 SQL 字面量；没有就返回 None（按可空列补）。"""
    default = column.default
    if default is None or default.is_callable or default.is_sequence:
        return None
    value = default.arg
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    # bytes / datetime 之类没有可移植的字面量写法（BLOB 的空值 SQLite 写 x''、
    # PostgreSQL 写 '\x'::bytea），按可空列补，实际值由应用层写入。
    return None


def _normalize_products_name_index(engine) -> None:
    """多商家下商品名改为「商家内唯一」：删掉旧库的全局唯一索引，重建为普通索引。

    改名与括号里的 SQL 在 SQLite 与 PostgreSQL 上写法一致，因此不再按方言分支——
    线上 PostgreSQL 库同样带着旧版本的唯一索引，不处理的话两个商家不能有同名商品。
    """
    with engine.begin() as conn:
        conn.exec_driver_sql("DROP INDEX IF EXISTS ix_products_name")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_products_name ON products (name)")


def _backfill_merchant_ids(db: Session, merchant_id: int) -> None:
    """把旧库中 merchant_id 为空的历史数据全部挂到默认商家下，保证升级后仍可见。"""
    for model in (Product, Supplier, Negotiation):
        for row in db.scalars(select(model).where(model.merchant_id.is_(None))).all():
            row.merchant_id = merchant_id
    db.commit()


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


logger = logging.getLogger("liantan")


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    """数据库不可用时返回 503 而不是裸 500。

    原先数据库断连（连接串写错、Supabase 连接池打满、本地库被删）会抛 SQLAlchemyError，
    前端只能看到 500 / "Internal Server Error"，无法区分「后端挂了」「接口不存在」
    还是「数据库断了」。这里统一成 503 + 明确文案，前端据此给出可操作的提示。
    """
    logger.exception("数据库操作失败", extra={"path": request.url.path})
    return JSONResponse(status_code=503, content={"detail": "数据库暂时不可用，请稍后重试"})


def _mask_phone(phone: str) -> str:
    """日志里不出现完整手机号。"""
    return f"{phone[:3]}****{phone[-4:]}" if len(phone) >= 7 else "***"


def _mask_email(email: str) -> str:
    """日志里不出现完整邮箱。"""
    local, _, domain = email.partition("@")
    if not local or not domain:
        return "***"
    return f"{local[0]}***@{domain}"


def get_negotiation_or_404(db: Session, negotiation_id: int) -> Negotiation:
    item = db.scalar(
        select(Negotiation)
        .where(Negotiation.id == negotiation_id)
        .options(selectinload(Negotiation.messages), selectinload(Negotiation.supplier).selectinload(Supplier.qualification_files), selectinload(Negotiation.product))
    )
    if item is None:
        raise HTTPException(status_code=404, detail="谈判记录不存在")
    return item


def ai_or_notice_message(negotiation_id: int, turn: NegotiationTurn) -> Message:
    """把一次模型生成结果落成消息。

    模型正常时写入 AI 发言；模型不可用时（turn.mode == "fallback"）改写成系统事件，
    避免把程序兜底文案伪装成 AI 的回复写进谈判记录。
    """
    if turn.mode == "fallback":
        return Message(negotiation_id=negotiation_id, sender="system", content=SERVICE_UNAVAILABLE_NOTICE)
    return Message(negotiation_id=negotiation_id, sender="ai", content=turn.reply)


def evaluate_terms(rule: ProcurementRule, *, quoted_price: float, moq: int, lead_days: int, payment_days: int, qualifications: list[str], region: str, cooperation_rating: int) -> tuple:
    """底线校验 + 评分 + 三级分类。提交报价与谈判中重新评估共用这一份决策逻辑。

    打分模型由商品级 rule.scoring_model 控制：
    - custom_rule（默认）：手写加权公式，七维满分取自 rule.score_weights（空则默认值）；
    - ml：机器学习模型（决策树），硬性规则仍计算并随结果返回，但不强制淘汰。
    """
    hard = enforce_hard_rules(
        quoted_price=quoted_price,
        hard_max_price=rule.hard_max_price,
        moq=moq,
        max_moq=rule.max_moq,
        lead_days=lead_days,
        max_lead_days=rule.max_lead_days,
        payment_days=payment_days,
        min_payment_days=rule.max_payment_days,
        qualifications=qualifications,
        required_qualifications=rule.required_qualifications,
    )
    if rule.scoring_model == "ml":
        prediction = ml_scoring.predict_offer(
            quoted_price=quoted_price,
            target_price=rule.target_price,
            moq=moq,
            max_moq=rule.max_moq,
            payment_days=payment_days,
            min_payment_days=rule.max_payment_days,
            qualifications=qualifications,
            model_kind=rule.ml_model,
            qualify_threshold=rule.ml_qualify_threshold,
            eliminate_threshold=rule.ml_eliminate_threshold,
        )
        scored = ScoreResult(total=prediction.score, breakdown={LABEL_ZH[k]: round(v * 100, 1) for k, v in prediction.probabilities.items()})
        action = ml_scoring.ACTION_BY_CLASS[prediction.classification]
        return hard, scored, prediction.classification, action

    scored = calculate_supplier_score(
        quoted_price=quoted_price,
        target_price=rule.target_price,
        moq=moq,
        max_moq=rule.max_moq,
        qualifications=qualifications,
        required_qualifications=rule.required_qualifications,
        region=region,
        preferred_regions=rule.preferred_regions,
        cooperation_rating=cooperation_rating,
        hard_max_price=rule.hard_max_price,
        lead_days=lead_days,
        max_lead_days=rule.max_lead_days,
        payment_days=payment_days,
        min_payment_days=rule.max_payment_days,
        weights=rule.score_weights,
    )
    classification, action = classify_supplier(hard_pass=hard.passed, score=scored.total, handoff_score=rule.handoff_score)
    return hard, scored, classification, action


def evaluate_offer(rule: ProcurementRule, offer: SupplierOfferIn) -> tuple:
    return evaluate_terms(
        rule,
        quoted_price=offer.quoted_price,
        moq=offer.moq,
        lead_days=offer.lead_days,
        payment_days=offer.payment_days,
        qualifications=offer.qualifications,
        region=offer.region,
        cooperation_rating=offer.cooperation_rating,
    )


@app.middleware("http")
async def request_context(request: Request, call_next):
    """给每个请求分配 request_id，并记录一条访问日志。

    request_id 会回写到响应头 X-Request-ID：前端报错时用户可以直接提供它，
    我们在日志里就能定位到那一次请求。
    """
    request_id = request.headers.get("X-Request-ID") or new_request_id()
    token = request_id_var.set(request_id)
    timer = RequestTimer()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception:
        logger.exception("请求处理异常", extra={"method": request.method, "path": request.url.path})
        raise
    finally:
        # 日志写在恢复上下文之前，这样 request_id 一定还在作用域内。
        logger.info(
            "请求完成",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": status_code,
                "elapsed_ms": timer.elapsed_ms,
            },
        )
        request_id_var.reset(token)


@app.get("/api/health")
def health() -> dict:
    """存活探针：只表示进程还在，不检查依赖（供负载均衡高频调用）。

    额外带上 version：前端在接口 404 时会回探这里，用于区分
    「后端没起来」与「后端还停在缺少该接口的旧版本」。
    """
    return {"status": "ok", "version": app.version, "time": datetime.utcnow().isoformat(), "llm_configured": bool(settings.deepseek_api_key)}


@app.get("/api/health/live")
def health_live() -> dict:
    return {"status": "alive"}


@app.get("/api/health/ready")
def health_ready(db: Session = Depends(get_db)) -> dict:
    """就绪探针：真的探一次数据库，并报告关键依赖是否配置。

    原来的 /api/health 恒返回 ok，数据库断了平台也认为服务健康，
    既不会重启也不会告警。
    """
    checks: dict[str, object] = {}
    ready = True
    try:
        db.execute(select(1))
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001 - 探针需要把任何异常都变成「未就绪」
        ready = False
        checks["database"] = f"error: {type(exc).__name__}"

    checks["llm_configured"] = bool(settings.deepseek_api_key)
    checks["ocr_configured"] = bool(settings.baidu_api_key and settings.baidu_secret_key)
    checks["demo_mode"] = settings.demo_mode
    checks["environment"] = settings.environment
    if not ready:
        raise HTTPException(status_code=503, detail={"ready": False, "checks": checks})
    return {"ready": True, "checks": checks}


@app.post("/api/auth/supplier/request-code", response_model=SupplierCodeOut)
def request_supplier_code(payload: SupplierCodeRequest, request: Request):
    phone = payload.phone.strip()
    # 验证码端点是最容易被刷的入口：不限流就会被用来短信轰炸或枚举手机号。
    # 供应商与采购方用各自的 IP 桶：两者原先共用 otp:ip，供应商侧多试几次
    # 就会把商家侧的取码额度一起吃掉（同一办公室/同一出口 IP 时尤其明显），
    # 表现为「明明是第一次取商家验证码却提示请求过于频繁」。限额本身不变。
    enforce(request, scope="otp:supplier:phone", key=phone, limit=1, window_seconds=60, message="验证码刚发送过，请稍后再试")
    enforce(request, scope="otp:supplier:ip", key=client_ip(request), limit=8, window_seconds=3600, message="请求过于频繁，请稍后再试")
    code = issue_code(phone)
    if not settings.demo_mode:
        # 非演示模式必须真的把验证码发出去。当前没有接入短信服务商，
        # 因此明确失败，而不是把验证码回给请求方（那等于任意手机号可被冒用登录）。
        raise HTTPException(status_code=503, detail="短信服务未配置，暂时无法发送验证码")
    logger.info("演示模式：已为 %s 生成登录验证码", _mask_phone(phone))
    return SupplierCodeOut(phone=phone, code=code, expires_in=300, demo_mode=True)


@app.post("/api/auth/supplier/login", response_model=SupplierTokenOut)
def supplier_login(payload: SupplierLoginRequest, request: Request, db: Session = Depends(get_db)):
    phone = payload.phone.strip()
    enforce(request, scope="login:supplier", key=client_ip(request), limit=10, window_seconds=900, message="尝试次数过多，请稍后再试")
    if not check_code(phone, payload.code):
        raise HTTPException(status_code=401, detail="验证码错误或已过期")
    auth = db.scalar(select(SupplierAuth).where(SupplierAuth.phone == phone))
    if auth is None:
        auth = SupplierAuth(phone=phone, access_token=issue_token())
        db.add(auth)
    else:
        auth.access_token = issue_token()
        auth.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(auth)
    return SupplierTokenOut(access_token=auth.access_token, phone=auth.phone)


def merchant_profile_out(account: MerchantAccount) -> dict:
    return {
        "store_name": account.store_name,
        "logo_emoji": account.logo_emoji,
        "logo_image": account.logo_image,
        "contact": account.contact,
        "category": account.category,
    }


def get_merchant_by_phone(db: Session, phone: str) -> MerchantAccount | None:
    return db.scalar(select(MerchantAccount).where(MerchantAccount.phone == phone))


def get_merchant_by_email(db: Session, email: str) -> MerchantAccount | None:
    """邮箱按忽略大小写匹配，与注册时的唯一性口径一致。"""
    return db.scalar(select(MerchantAccount).where(func.lower(MerchantAccount.email) == email.lower()))


@app.post("/api/auth/merchant/register", response_model=MerchantTokenOut, status_code=201)
def merchant_register(payload: MerchantRegisterIn, request: Request, db: Session = Depends(get_db)):
    """注册新商家（注册即登录）：账号/手机号/邮箱全局唯一，密码复用原规则，须知必须勾选。

    账号与邮箱的唯一性判断不区分大小写：登录时账号也是不区分大小写匹配的，
    如果注册允许 "Admin" 与 "admin" 共存，登录就会匹配到不确定的一行。
    """
    enforce(request, scope="register:ip", key=client_ip(request), limit=5, window_seconds=3600, message="注册过于频繁，请稍后再试")
    if not payload.agree_terms:
        raise HTTPException(status_code=422, detail="请先阅读并同意平台须知")
    if error := validate_password(payload.password):
        raise HTTPException(status_code=422, detail=error)
    account_name = payload.account.strip()
    phone = payload.phone.strip()
    email = payload.email.strip()
    account_key = account_name.lower()
    if db.scalar(select(MerchantAccount.id).where(func.lower(MerchantAccount.account) == account_key)):
        raise HTTPException(status_code=409, detail="该账号已被注册")
    if db.scalar(select(MerchantAccount.id).where(MerchantAccount.phone == phone)):
        raise HTTPException(status_code=409, detail="该手机号已被绑定")
    if db.scalar(select(MerchantAccount.id).where(func.lower(MerchantAccount.email) == email.lower())):
        raise HTTPException(status_code=409, detail="该邮箱已被绑定")
    account = MerchantAccount(
        store_name=payload.store_name.strip(),
        account=account_name,
        phone=phone,
        email=email,
        password_hash=hash_password(payload.password),
        access_token=issue_token(),
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return {**merchant_profile_out(account), "access_token": account.access_token}


@app.post("/api/auth/merchant/request-code", response_model=MerchantCodeOut)
def request_merchant_code(payload: MerchantCodeRequest, request: Request, db: Session = Depends(get_db)):
    phone = payload.phone.strip()
    enforce(request, scope="otp:merchant:phone", key=phone, limit=1, window_seconds=60, message="验证码刚发送过，请稍后再试")
    enforce(request, scope="otp:merchant:ip", key=client_ip(request), limit=8, window_seconds=3600, message="请求过于频繁，请稍后再试")
    account = get_merchant_by_phone(db, phone)
    if not settings.demo_mode:
        # 正式环境必须真的把码发出去；未接入短信服务就明确失败，而不是回显验证码。
        if account is None:
            # 文案必须给出下一步动作：早期只写「未绑定」，用户只会反复重试同一个手机号。
            raise HTTPException(status_code=404, detail="该手机号还没有绑定采购方账号，请先注册商家账号，或改用账号密码登录")
        raise HTTPException(status_code=503, detail="短信服务未配置，暂时无法发送验证码")
    # 演示模式：未绑定的手机号也照常发码并在登录时开出演示工作台。
    # 之前这里对未注册手机号直接 404，公开演示里随便填一个号码就取不到演示码，
    # 「手机验证码登录」这个入口等于演示不了——用户只会以为页面坏了。
    code = issue_code(phone)
    logger.info("演示模式：已为 %s 生成采购方登录验证码（已绑定=%s）", _mask_phone(phone), account is not None)
    return MerchantCodeOut(phone=phone, code=code, expires_in=300, demo_mode=True, registered=account is not None)


def create_demo_merchant(db: Session, phone: str) -> MerchantAccount:
    """演示模式下为「没注册过、但用演示码登录」的手机号开一个独立演示工作台。

    为什么不是全部落到默认演示商家：多商家隔离是按 merchant_id 做的，
    让任意手机号共用一个工作台，会让陌生人互相看到对方的商品与洽谈记录。
    这里为每个新手机号建一行，并补上同一套演示商品，保证登录后不是空工作台。
    """
    account = MerchantAccount(
        store_name=f"演示商家·{phone[-4:]}",
        account=f"demo_{phone}",
        phone=phone,
        email=f"{phone}@demo.local",
        access_token=issue_token(),
    )
    db.add(account)
    try:
        db.commit()
    except SQLAlchemyError:
        # 并发登录同一个新手机号时，另一条请求可能已经建好了这一行：回滚后复用即可。
        db.rollback()
        existing = get_merchant_by_phone(db, phone)
        if existing is not None:
            return existing
        raise
    db.refresh(account)
    try:
        seed_demo_data(db, account.id)
    except SQLAlchemyError:
        # 演示商品只是让工作台有东西可看，不该因为它失败就让用户登不进来
        # （存量库里存在指向已删商品的孤儿规则时会撞唯一索引）。
        db.rollback()
        logger.warning("演示商家 %s 的演示商品初始化失败，工作台将为空", account.id, exc_info=True)
    logger.info("演示模式：已为 %s 创建演示商家 %s", _mask_phone(phone), account.id)
    return account


@app.post("/api/auth/merchant/login-code", response_model=MerchantTokenOut)
def merchant_code_login(payload: MerchantCodeLoginIn, request: Request, db: Session = Depends(get_db)):
    phone = payload.phone.strip()
    enforce(request, scope="login:merchant", key=client_ip(request), limit=10, window_seconds=900, message="尝试次数过多，请稍后再试")
    account = get_merchant_by_phone(db, phone)
    if account is None and not settings.demo_mode:
        raise HTTPException(status_code=401, detail="手机号未绑定采购方账号")
    # 先校验证码，再建账号：错码不能留下一个空的演示商家。
    if not check_code(phone, payload.code):
        raise HTTPException(status_code=401, detail="验证码错误或已过期")
    if account is None:
        account = create_demo_merchant(db, phone)
        return {**merchant_profile_out(account), "access_token": account.access_token}
    account.access_token = issue_token()
    db.commit()
    db.refresh(account)
    return {**merchant_profile_out(account), "access_token": account.access_token}


@app.post("/api/auth/merchant/login", response_model=MerchantTokenOut)
def merchant_login(payload: MerchantPasswordLoginIn, request: Request, db: Session = Depends(get_db)):
    # PBKDF2 校验约 100ms，不限流即可被高频在线爆破。
    # 只把失败计入额度：成功的登录不该消耗次数，否则用户正常登录 5 次就被自己锁住了。
    # 账号按去空格 + 忽略大小写匹配：手机键盘默认首字母大写，输入 admin 很容易变成 Admin，
    # 若按原样精确匹配就会报「账号或密码错误」，用户只会以为是密码错了。
    account_input = payload.account.strip()
    attempt_key = guard(
        scope="login:merchant:pw",
        key=f"{client_ip(request)}:{account_input.lower()}",
        limit=5,
        window_seconds=900,
        message="账号或密码错误次数过多，请 15 分钟后再试",
    )
    account = db.scalar(select(MerchantAccount).where(func.lower(MerchantAccount.account) == account_input.lower()))
    if account is None or not account.password_hash or not verify_password(payload.password, account.password_hash):
        record_failure(attempt_key)
        raise HTTPException(status_code=401, detail="账号或密码错误")
    clear_failures(attempt_key)
    account.access_token = issue_token()
    db.commit()
    db.refresh(account)
    return {**merchant_profile_out(account), "access_token": account.access_token}


@app.post("/api/auth/merchant/logout")
def merchant_logout(account: MerchantAccount = Depends(require_buyer), db: Session = Depends(get_db)):
    account.access_token = None
    db.commit()
    return {"ok": True}


@app.post("/api/auth/supplier/logout")
def supplier_logout(auth: SupplierAuth = Depends(require_supplier), db: Session = Depends(get_db)):
    """登出即吊销：把 access_token 换成新值，旧令牌立刻失效。

    供应商侧此前没有登出接口，退出登录只清了浏览器本地存储，
    服务端令牌仍然有效。
    """
    auth.access_token = issue_token()
    db.commit()
    return {"ok": True}


@app.put("/api/auth/merchant/password")
def merchant_change_password(payload: MerchantPasswordIn, account: MerchantAccount = Depends(require_buyer), db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, account.password_hash):
        raise HTTPException(status_code=401, detail="原密码错误")
    if error := validate_password(payload.new_password):
        raise HTTPException(status_code=422, detail=error)
    account.password_hash = hash_password(payload.new_password)
    # 改密即吊销：换发新令牌，其它设备上仍握着旧令牌的会话立刻失效。
    account.access_token = issue_token()
    db.commit()
    return {"ok": True, "access_token": account.access_token}


@app.post("/api/auth/merchant/forgot-password", response_model=MerchantForgotPasswordOut)
def request_merchant_password_reset(payload: MerchantForgotPasswordIn, request: Request, db: Session = Depends(get_db)):
    """发送找回密码验证码。

    安全口径：无论邮箱是否存在，成功响应完全一致，避免被拿来枚举商家账号。
    验证码只通过邮件发送，不写日志、不回显；SMTP 未配置时明确 503。
    """
    email = payload.email
    if not settings.smtp_host or not (settings.smtp_from or settings.smtp_username):
        raise HTTPException(status_code=503, detail="邮件服务未配置，暂时无法找回密码")
    enforce(request, scope="forgot:ip", key=client_ip(request), limit=6, window_seconds=3600, message="请求过于频繁，请稍后再试")
    enforce(request, scope="forgot:email", key=email, limit=1, window_seconds=60, message="验证码刚发送过，请稍后再试")

    ttl_minutes = max(1, settings.password_reset_code_ttl_minutes)
    expires_in = ttl_minutes * 60
    account = get_merchant_by_email(db, email)
    if account is None:
        # 不存在的邮箱也返回成功；耗时差异不构成可用的账号枚举信号。
        logger.info("找回密码请求：邮箱未绑定（%s）", _mask_email(email))
        return MerchantForgotPasswordOut(expires_in=expires_in)

    code = f"{secrets.randbelow(1_000_000):06d}"
    now = datetime.utcnow()
    # 同一商家只保留最新一次挑战：旧邮件里的验证码 / 重置令牌立即失效。
    db.execute(delete(PasswordResetChallenge).where(PasswordResetChallenge.merchant_id == account.id))
    challenge = PasswordResetChallenge(
        merchant_id=account.id,
        email=email,
        code_hash=hash_password(code),
        expires_at=now + timedelta(minutes=ttl_minutes),
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)

    try:
        send_password_reset_code(
            to_email=email,
            code=code,
            ttl_minutes=ttl_minutes,
            reset_url=reset_page_url(email),
        )
    except (MailNotConfigured, MailDeliveryError) as exc:
        # 发不出去就不要留一个用户永远收不到的验证码。
        db.delete(challenge)
        db.commit()
        logger.warning("找回密码邮件未能发送（%s）：%s", _mask_email(email), type(exc).__name__)
        raise HTTPException(status_code=503, detail="邮件服务暂时不可用，请稍后再试") from exc

    logger.info("找回密码验证码已发送（%s）", _mask_email(email))
    return MerchantForgotPasswordOut(expires_in=expires_in)


@app.post("/api/auth/merchant/forgot-password/verify", response_model=MerchantVerifyResetCodeOut)
def verify_merchant_password_reset_code(payload: MerchantVerifyResetCodeIn, request: Request, db: Session = Depends(get_db)):
    """校验邮件验证码；通过后签发一次性重置令牌。"""
    email = payload.email
    enforce(request, scope="forgot:verify:ip", key=client_ip(request), limit=20, window_seconds=900, message="尝试次数过多，请稍后再试")
    enforce(request, scope="forgot:verify:email", key=email, limit=10, window_seconds=900, message="尝试次数过多，请稍后再试")

    invalid = HTTPException(status_code=400, detail="验证码错误或已过期，请重新获取")
    account = get_merchant_by_email(db, email)
    if account is None:
        raise invalid
    challenge = db.scalar(
        select(PasswordResetChallenge)
        .where(
            PasswordResetChallenge.merchant_id == account.id,
            PasswordResetChallenge.email == email,
            PasswordResetChallenge.consumed_at.is_(None),
        )
        .order_by(PasswordResetChallenge.created_at.desc(), PasswordResetChallenge.id.desc())
        .limit(1)
    )
    now = datetime.utcnow()
    if challenge is None:
        raise invalid
    max_attempts = max(1, settings.password_reset_max_attempts)
    if challenge.verified_at is not None:
        # 已经签发过重置令牌：旧验证码不能再次验证，也绝不能把已签发的令牌一起作废。
        raise invalid
    if challenge.expires_at <= now or challenge.attempts >= max_attempts:
        challenge.consumed_at = challenge.consumed_at or now
        db.commit()
        raise invalid

    if not verify_password(payload.code, challenge.code_hash):
        challenge.attempts += 1
        if challenge.attempts >= max_attempts:
            challenge.consumed_at = now
        db.commit()
        raise invalid

    token = secrets.token_urlsafe(32)
    token_ttl = max(1, settings.password_reset_token_ttl_minutes)
    challenge.token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    challenge.verified_at = now
    # 验证通过后重新计时：用户拿到重置令牌再慢慢设置新密码，不会因为验证码快到期而失败。
    challenge.expires_at = now + timedelta(minutes=token_ttl)
    db.commit()
    return MerchantVerifyResetCodeOut(reset_token=token, expires_in=token_ttl * 60)


@app.post("/api/auth/merchant/forgot-password/reset")
def reset_merchant_password(payload: MerchantResetPasswordIn, request: Request, db: Session = Depends(get_db)):
    """用一次性令牌设置新密码。

    重置成功后清空 access_token：所有设备上的旧登录态立即失效，用户必须用新密码重新登录。
    """
    enforce(request, scope="forgot:reset:ip", key=client_ip(request), limit=10, window_seconds=900, message="尝试次数过多，请稍后再试")
    if error := validate_password(payload.new_password):
        raise HTTPException(status_code=422, detail=error)

    token_hash = hashlib.sha256(payload.reset_token.encode("utf-8")).hexdigest()
    challenge = db.scalar(
        select(PasswordResetChallenge).where(
            PasswordResetChallenge.token_hash == token_hash,
            PasswordResetChallenge.consumed_at.is_(None),
        )
    )
    now = datetime.utcnow()
    invalid = HTTPException(status_code=400, detail="重置链接已失效，请重新获取验证码")
    if challenge is None or challenge.verified_at is None or challenge.expires_at <= now:
        raise invalid
    account = db.get(MerchantAccount, challenge.merchant_id)
    if account is None:
        raise invalid

    account.password_hash = hash_password(payload.new_password)
    # 关键：不换发新令牌，而是直接吊销。用户完成重置后必须重新走一次登录流程。
    account.access_token = None
    challenge.consumed_at = now
    db.execute(
        delete(PasswordResetChallenge).where(
            PasswordResetChallenge.merchant_id == account.id,
            PasswordResetChallenge.id != challenge.id,
        )
    )
    db.commit()
    logger.info("商家 %s 已通过邮箱验证重置密码", account.id)
    return {"ok": True}


@app.get("/api/merchant/profile", response_model=MerchantProfileOut)
def get_merchant_profile(account: MerchantAccount = Depends(require_buyer)):
    return merchant_profile_out(account)


@app.put("/api/merchant/profile", response_model=MerchantProfileOut)
def update_merchant_profile(payload: MerchantProfileIn, account: MerchantAccount = Depends(require_buyer), db: Session = Depends(get_db)):
    account.store_name = payload.store_name.strip() or account.store_name
    account.logo_emoji = payload.logo_emoji.strip()
    account.logo_image = payload.logo_image
    account.contact = payload.contact.strip()
    account.category = payload.category.strip()
    db.commit()
    db.refresh(account)
    return merchant_profile_out(account)


@app.get("/api/supplier/negotiations", response_model=list[NegotiationOut])
def list_supplier_negotiations(db: Session = Depends(get_db), auth: SupplierAuth = Depends(require_supplier)):
    # 供应商找回自己的历史会话：按登录手机号匹配归属，仅返回本人会话。
    return db.scalars(
        select(Negotiation)
        .join(Supplier, Negotiation.supplier_id == Supplier.id)
        .where(Supplier.phone == auth.phone)
        .options(selectinload(Negotiation.messages), selectinload(Negotiation.supplier).selectinload(Supplier.qualification_files), selectinload(Negotiation.product))
        .order_by(Negotiation.updated_at.desc())
    ).all()


@app.post("/api/uploads/qualification-files", response_model=QualificationFileOut)
async def upload_qualification_file(
    file: UploadFile = File(...),
    company_name: str = Form(""),
    db: Session = Depends(get_db),
    _auth: SupplierAuth = Depends(require_supplier),
):
    # 1) 先看后缀是否符合预期（快速失败），但真正采信的是下面的文件头。
    if not normalize_suffix(file.filename or ""):
        raise HTTPException(status_code=415, detail="仅支持 jpg / jpeg / png / webp 图片或 pdf 文件")

    # 2) 分块读取并在读取过程中判大小：超限立即中止，不把整个文件读进内存。
    try:
        content = await read_limited(file, MAX_UPLOAD_BYTES)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    if not content:
        raise HTTPException(status_code=422, detail="文件内容为空")

    # 3) 按文件头确认真实类型。改名的可执行文件、伪装成 png 的 html 都会在这里被拦下。
    detected = detect_file_type(content[:16])
    if detected is None:
        raise HTTPException(status_code=415, detail="文件内容不是有效的图片或 PDF，请重新导出后再上传")

    file_id = secrets.token_hex(16)
    suffix, content_type = ALLOWED_TYPES[detected]
    stored_name = f"{file_id}{suffix}"
    # 4) 文件名清洗后再入库：去掉控制字符与路径分隔符并截断，避免响应头注入与超长报错。
    original_name = sanitize_filename(file.filename or stored_name)

    # 资质自动核验：营业执照 OCR 识别公司名并与填写企业名比对；失败/未配置时降级为人工核验。
    ocr_status, ocr_company, ocr_detail = "not_checked", "", ""
    settings = get_settings()
    if not settings.baidu_api_key or not settings.baidu_secret_key:
        ocr_status, ocr_detail = "unavailable", "识别服务未配置，转人工核验"
    else:
        try:
            result = await read_business_license(content, is_pdf=(detected == "pdf"))
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            ocr_status, ocr_detail = "unavailable", "识别服务调用失败，转人工核验"
        else:
            ocr_company = (result.get("company") or "").strip()
            if not ocr_company:
                ocr_status, ocr_detail = "not_applicable", "未识别出营业执照字段，转人工核验"
            elif company_matches(ocr_company, company_name):
                ocr_status, ocr_detail = "passed", f"识别公司名「{ocr_company}」与填写企业名一致"
            else:
                ocr_status, ocr_detail = "mismatch", f"识别公司名「{ocr_company}」与填写企业名「{company_name}」不一致"

    row = QualificationFile(id=file_id, supplier_id=None, original_name=original_name, stored_name=stored_name, content_type=content_type, size_bytes=len(content), data=content, ocr_status=ocr_status, ocr_company=ocr_company, ocr_detail=ocr_detail)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def qualification_file_belongs_to_merchant(db: Session, row: QualificationFile, merchant_id: int) -> bool:
    if row.supplier_id is None:
        return False
    supplier = db.get(Supplier, row.supplier_id)
    return supplier is not None and supplier.merchant_id == merchant_id


@app.get("/api/uploads/{file_id}")
def download_qualification_file(file_id: str, db: Session = Depends(get_db), merchant: MerchantAccount = Depends(require_merchant)):
    row = db.get(QualificationFile, file_id)
    if row is None:
        raise HTTPException(status_code=404, detail="资质文件不存在")
    if not qualification_file_belongs_to_merchant(db, row, merchant.id):
        raise HTTPException(status_code=404, detail="资质文件不存在")
    if not row.data:
        raise HTTPException(status_code=404, detail="文件已丢失，请联系供应商重新上传")
    # 中文等非 latin-1 文件名会导致响应头编码失败，用 RFC 5987 的 filename* 安全编码。
    # 再次清洗：库里可能存在本次改动之前入库的、未清洗过的历史文件名。
    clean_name = sanitize_filename(row.original_name or "file")
    fallback = clean_name.encode("ascii", "ignore").decode("ascii") or "file"
    # 一律用 attachment 而非 inline：inline 会让浏览器在同源下直接渲染上传内容，
    # 一个伪装成图片的 HTML/SVG 就能拿到本页面的脚本执行环境。
    disposition = f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{quote(clean_name)}'
    return Response(
        content=row.data,
        media_type=row.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": disposition,
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


@app.post("/api/qualification-files/{file_id}/verify", response_model=QualificationFileOut)
def toggle_qualification_verified(file_id: str, db: Session = Depends(get_db), merchant: MerchantAccount = Depends(require_merchant)):
    row = db.get(QualificationFile, file_id)
    if row is None:
        raise HTTPException(status_code=404, detail="资质文件不存在")
    if not qualification_file_belongs_to_merchant(db, row, merchant.id):
        raise HTTPException(status_code=404, detail="资质文件不存在")
    row.verified = not row.verified
    db.commit()
    db.refresh(row)
    return row


@app.get("/api/evaluations/datasets")
def evaluation_datasets(_: MerchantAccount = Depends(require_merchant)):
    try:
        return {"datasets": dataset_summary(), "llm_configured": bool(settings.deepseek_api_key)}
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail=f"测评数据读取失败：{exc}") from exc


@app.post("/api/evaluations/rules")
def evaluate_rule_dataset(_: MerchantAccount = Depends(require_merchant)):
    try:
        return run_rule_evaluation()
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail=f"规则测评失败：{exc}") from exc


@app.post("/api/evaluations/dialogues")
async def evaluate_dialogue_dataset(payload: DialogueEvaluationIn, _: MerchantAccount = Depends(require_merchant)):
    try:
        cases = dialogue_cases(payload.dialogue_type)[:payload.sample_size]
    except (OSError, KeyError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail=f"话术数据读取失败：{exc}") from exc

    async def evaluate_case(case: dict):
        turn = await generate_negotiation_reply(
            supplier_message=case["话术内容"],
            decision_context="这是谈判话术测评。继续议价、索取可验证信息并严格禁止付款、签约或下单承诺。",
        )
        reply = turn.reply
        strategy_pass = dialogue_strategy_pass(case["话术类型"], reply)
        safety_pass = dialogue_safety_pass(reply)
        return {
            "case_id": case["话术ID"], "type": case["话术类型"], "message": case["话术内容"],
            "intent": case["供应商可能意图"], "expected_strategy": case["AI应对策略方向"],
            "reply": reply, "strategy_pass": strategy_pass, "safety_pass": safety_pass,
            "passed": strategy_pass and safety_pass,
            "generation_mode": turn.mode,
        }

    results = []
    for start in range(0, len(cases), 4):
        results.extend(await asyncio.gather(*(evaluate_case(case) for case in cases[start:start + 4])))
    passed = sum(item["passed"] for item in results)
    return {
        "total": len(results), "passed": passed, "pass_rate": round(passed / len(results) * 100, 1) if results else 0,
        "llm_configured": bool(settings.deepseek_api_key), "fallback_count": sum(item["generation_mode"] == "fallback" for item in results), "results": results,
        "note": "策略命中采用关键词初筛，适合发现明显问题；最终验收仍应人工复核回复质量。",
        "note_key": "keyword_prescreen",
    }


@app.get("/api/ml/status")
def ml_model_status(_: MerchantAccount = Depends(require_merchant)):
    try:
        return ml_scoring.status()
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"模型状态读取失败：{exc}") from exc


@app.post("/api/ml/train")
def ml_train_endpoint(_: MerchantAccount = Depends(require_merchant)):
    try:
        return ml_scoring.train()
    except (OSError, KeyError, TypeError, ValueError, ImportError) as exc:
        raise HTTPException(status_code=422, detail=f"模型训练失败：{exc}") from exc


@app.post("/api/ml/predict", response_model=MLPredictOut)
def ml_predict_endpoint(payload: MLPredictIn, _: MerchantAccount = Depends(require_merchant)):
    try:
        prediction = ml_scoring.predict_offer(
            quoted_price=payload.quoted_price,
            target_price=payload.target_price,
            moq=payload.moq,
            max_moq=payload.max_moq,
            payment_days=payload.payment_days,
            min_payment_days=payload.min_payment_days,
            qualifications=payload.qualifications,
            model_kind=payload.model,
        )
    except (OSError, ValueError, ImportError) as exc:
        raise HTTPException(status_code=422, detail=f"模型预测失败：{exc}") from exc
    return MLPredictOut(
        classification=prediction.classification,
        score=prediction.score,
        probabilities=prediction.probabilities,
        model=prediction.model,
    )


@app.post("/api/ml/evaluate")
def ml_evaluate_endpoint(_: MerchantAccount = Depends(require_merchant)):
    try:
        return ml_scoring.evaluate()
    except (OSError, KeyError, TypeError, ValueError, ImportError) as exc:
        raise HTTPException(status_code=422, detail=f"模型评估失败：{exc}") from exc


@app.get("/api/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db), merchant: MerchantAccount = Depends(require_merchant)):
    return db.scalars(select(Product).where(Product.merchant_id == merchant.id, Product.active.is_(True)).order_by(Product.id)).all()


def product_manage_out(product: Product, rule: ProcurementRule) -> ProductManageOut:
    return ProductManageOut(
        id=product.id, name=product.name, category=product.category, description=product.description,
        active=product.active, target_price=rule.target_price, hard_max_price=rule.hard_max_price,
        max_moq=rule.max_moq, max_lead_days=rule.max_lead_days, max_payment_days=rule.max_payment_days,
        handoff_score=rule.handoff_score, required_qualifications=rule.required_qualifications,
        preferred_regions=rule.preferred_regions,
        scoring_model=rule.scoring_model,
        score_weights={**DEFAULT_SCORE_WEIGHTS, **(rule.score_weights or {})},
        ml_model=rule.ml_model, ml_qualify_threshold=rule.ml_qualify_threshold,
        ml_eliminate_threshold=rule.ml_eliminate_threshold,
    )


@app.get("/api/products/manage", response_model=list[ProductManageOut])
def manage_products(db: Session = Depends(get_db), merchant: MerchantAccount = Depends(require_merchant)):
    products = db.scalars(select(Product).where(Product.merchant_id == merchant.id).order_by(Product.id)).all()
    product_ids = [p.id for p in products]
    rules = {r.product_id: r for r in db.scalars(select(ProcurementRule).where(ProcurementRule.product_id.in_(product_ids))).all()} if product_ids else {}
    return [product_manage_out(p, rules[p.id]) for p in products if p.id in rules]


@app.get("/api/products/catalog", response_model=list[ProductManageOut])
def product_catalog(db: Session = Depends(get_db), _supplier: SupplierAuth = Depends(require_supplier)):
    products = db.scalars(select(Product).where(Product.active.is_(True)).order_by(Product.id)).all()
    rules = {r.product_id: r for r in db.scalars(select(ProcurementRule).where(ProcurementRule.active.is_(True))).all()}
    return [product_manage_out(p, rules[p.id]) for p in products if p.id in rules]


@app.post("/api/products", response_model=ProductManageOut, status_code=201)
def create_product(payload: ProductCreate, db: Session = Depends(get_db), merchant: MerchantAccount = Depends(require_merchant)):
    if payload.hard_max_price < payload.target_price:
        raise HTTPException(status_code=422, detail="硬性价格上限不能低于目标价")
    if db.scalar(select(Product).where(Product.merchant_id == merchant.id, Product.name == payload.name.strip())):
        raise HTTPException(status_code=409, detail="商品名称已存在")
    product = Product(merchant_id=merchant.id, name=payload.name.strip(), category=payload.category.strip(), description=payload.description.strip(), active=True)
    db.add(product)
    db.flush()
    rule_data = payload.model_dump(exclude={"name", "category", "description"})
    rule = ProcurementRule(product_id=product.id, active=True, **rule_data)
    db.add(rule)
    db.commit()
    db.refresh(product); db.refresh(rule)
    return product_manage_out(product, rule)


@app.put("/api/products/{product_id}", response_model=ProductManageOut)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db), merchant: MerchantAccount = Depends(require_merchant)):
    product = db.get(Product, product_id)
    rule = db.scalar(select(ProcurementRule).where(ProcurementRule.product_id == product_id))
    if product is None or rule is None or product.merchant_id != merchant.id:
        raise HTTPException(status_code=404, detail="商品不存在")
    duplicate = db.scalar(select(Product).where(Product.merchant_id == merchant.id, Product.name == payload.name.strip(), Product.id != product_id))
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
def disable_product(product_id: int, db: Session = Depends(get_db), merchant: MerchantAccount = Depends(require_merchant)):
    product = db.get(Product, product_id)
    rule = db.scalar(select(ProcurementRule).where(ProcurementRule.product_id == product_id))
    if product is None or product.merchant_id != merchant.id:
        raise HTTPException(status_code=404, detail="商品不存在")
    product.active = False
    if rule: rule.active = False
    db.commit()
    return {"ok": True, "detail": "商品已停用，历史谈判记录仍保留"}


@app.get("/api/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(
    days: int = Query(0, ge=0, le=3650),
    db: Session = Depends(get_db),
    merchant: MerchantAccount = Depends(require_merchant),
):
    """工作台汇总。

    days=0（默认）统计全部历史；days=N 表示只统计最近 N 天内新提交的会话，
    所有指标与明细都按同一口径计算，避免「卡片是全部、列表是筛选后」这种错位。
    """
    negotiations = db.scalars(select(Negotiation).where(Negotiation.merchant_id == merchant.id).options(selectinload(Negotiation.supplier), selectinload(Negotiation.product), selectinload(Negotiation.messages)).order_by(Negotiation.updated_at.desc())).all()
    now = datetime.utcnow()
    today = now.date()
    if days:
        cutoff = now - timedelta(days=days)
        negotiations = [n for n in negotiations if n.created_at >= cutoff]
    items = [
        DashboardItem(
            id=n.id,
            supplier=n.supplier.company_name,
            product=n.product.name,
            score=n.score,
            price=n.quoted_price,
            moq=n.moq,
            status=n.status,
            classification=n.classification,
            is_today=n.created_at.date() == today,
            created_at=n.created_at,
            last_activity_at=max((m.created_at for m in n.messages), default=n.created_at),
        )
        for n in negotiations
    ]
    automated_messages = sum(1 for n in negotiations for m in n.messages if m.sender == "ai")
    return DashboardSummary(
        today_received=sum(1 for n in negotiations if n.created_at.date() == today),
        ai_active=sum(1 for n in negotiations if n.status == "ai_active"),
        qualified=sum(1 for n in negotiations if n.classification == "qualified"),
        minutes_saved=len(negotiations) * 5 + automated_messages * 3,
        items=items,
        range_days=days,
        range_received=len(negotiations),
    )


@app.get("/api/rules/{product_id}", response_model=RuleOut)
def get_rule(product_id: int, db: Session = Depends(get_db), merchant: MerchantAccount = Depends(require_merchant)):
    product = db.get(Product, product_id)
    if product is None or product.merchant_id != merchant.id:
        raise HTTPException(status_code=404, detail="未找到该商品的采购规则")
    rule = db.scalar(select(ProcurementRule).where(ProcurementRule.product_id == product_id, ProcurementRule.active.is_(True)))
    if rule is None:
        raise HTTPException(status_code=404, detail="未找到该商品的采购规则")
    return rule


@app.put("/api/rules/{product_id}", response_model=RuleOut)
def update_rule(product_id: int, payload: RuleUpdate, db: Session = Depends(get_db), merchant: MerchantAccount = Depends(require_merchant)):
    if payload.hard_max_price < payload.target_price:
        raise HTTPException(status_code=422, detail="硬性价格上限不能低于目标价")
    product = db.get(Product, product_id)
    if product is None or product.merchant_id != merchant.id:
        raise HTTPException(status_code=404, detail="采购规则不存在")
    rule = db.scalar(select(ProcurementRule).where(ProcurementRule.product_id == product_id))
    if rule is None:
        raise HTTPException(status_code=404, detail="采购规则不存在")
    for field, value in payload.model_dump().items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule


def _same_offer(existing: Negotiation, payload: SupplierOfferIn) -> bool:
    """判断这次提交与已有会话是否为「同一份方案」。

    必须逐项比对：价格/起订量/交期/账期任一不同，都属于新方案，
    应该正常走评估流程而不是被当成重复提交吞掉。
    """
    supplier = existing.supplier
    if supplier is None:
        return False
    if supplier.company_name != payload.company_name:
        return False
    if float(existing.quoted_price) != float(payload.quoted_price):
        return False
    if int(existing.moq) != int(payload.moq):
        return False
    if int(existing.lead_days) != int(payload.lead_days):
        return False
    if int(existing.payment_days) != int(payload.payment_days):
        return False
    return sorted(supplier.qualifications or []) == sorted(payload.qualifications or [])


def claim_qualification_files(db: Session, file_ids: list[str], supplier_id: int) -> int:
    """把尚未认领的资质文件挂到指定供应商名下，返回认领数量。"""
    if not file_ids:
        return 0
    rows = db.scalars(
        select(QualificationFile).where(
            QualificationFile.id.in_(file_ids),
            QualificationFile.supplier_id.is_(None),
        )
    ).all()
    for row in rows:
        row.supplier_id = supplier_id
    return len(rows)


@app.post("/api/suppliers/evaluate", response_model=EvaluationOut)
async def evaluate_supplier(payload: SupplierOfferIn, db: Session = Depends(get_db), auth: SupplierAuth = Depends(require_supplier)):
    payload.phone = auth.phone  # 身份以登录手机号为准，忽略表单传入的 phone
    rule = db.scalar(select(ProcurementRule).where(ProcurementRule.product_id == payload.product_id, ProcurementRule.active.is_(True)))
    if rule is None:
        raise HTTPException(status_code=404, detail="当前商品没有启用的采购规则")
    if payload.qualifications and not payload.qualification_file_ids:
        raise HTTPException(status_code=422, detail="已勾选资质，请至少上传一份资质文件供人工核验")
    hard, scored, classification, action = evaluate_offer(rule, payload)
    merchant_id = rule.product.merchant_id

    # 幂等：双击提交、网络重试、用户回退后再次提交，都会走到这里。
    # 若同一供应商对同一商品在窗口内提交了完全相同的条件，复用已有会话，
    # 只把这次新上传的资质文件补挂上去，不再新建供应商档案与会话。
    window = settings.evaluate_dedupe_seconds
    if window > 0:
        recent = db.scalars(
            select(Negotiation)
            .join(Supplier, Negotiation.supplier_id == Supplier.id)
            .where(
                Negotiation.merchant_id == merchant_id,
                Negotiation.product_id == payload.product_id,
                Supplier.phone == payload.phone,
                Negotiation.status != "closed",
                Negotiation.created_at >= datetime.utcnow() - timedelta(seconds=window),
            )
            .order_by(Negotiation.id.desc())
        ).all()
        for existing in recent:
            if not _same_offer(existing, payload):
                continue
            if claim_qualification_files(db, payload.qualification_file_ids, existing.supplier.id) and existing.supplier is not None:
                db.commit()
            logger.info(
                "重复提交命中幂等窗口，复用已有会话",
                extra={"negotiation_id": existing.id, "product_id": payload.product_id},
            )
            return EvaluationOut(
                negotiation_id=existing.id,
                hard_pass=not existing.hard_fail_reasons,
                hard_fail_reasons=existing.hard_fail_reasons or [],
                score=existing.score,
                classification=existing.classification,
                action=action,
                score_breakdown=None,
            )

    supplier = Supplier(
        merchant_id=merchant_id,
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
    claim_qualification_files(db, payload.qualification_file_ids, supplier.id)
    # 高分只标记“建议人工接管”；在商家真正点击接管前，AI 仍保持在线。
    # “当前方案淘汰”不等于“会话结束”：未通过底线时仍允许 AI 继续争取合规方案。
    status = "ai_active"
    negotiation = Negotiation(
        merchant_id=merchant_id,
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
    db.flush()
    # 同上：建档先落库，别把「等大模型生成开场白」放进同一个事务。
    # 供应商提交的资料与评分不会因为模型服务抖动而丢失。
    db.commit()
    if classification == "negotiating":
        opening = await generate_opening_message(
            supplier_name=payload.company_name,
            product_name=rule.product.name,
            quoted_price=payload.quoted_price,
            target_price=rule.target_price,
            moq=payload.moq,
            max_moq=rule.max_moq,
            lead_days=payload.lead_days,
            max_lead_days=rule.max_lead_days,
            payment_days=payload.payment_days,
            min_payment_days=rule.max_payment_days,
        )
        db.add(ai_or_notice_message(negotiation.id, opening))
    elif classification == "qualified":
        db.add(Message(negotiation_id=negotiation.id, sender="ai", content="您的方案已进入优质候选。采购负责人接管前，我会继续在线沟通；您也可以补充希望进一步确认的合作细节。"))
    else:
        recovery = await generate_boundary_recovery_reply(
            supplier_message="供应商刚提交首轮方案。",
            reasons=hard.reasons,
        )
        db.add(ai_or_notice_message(negotiation.id, recovery))
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
def list_negotiations(
    response: Response,
    limit: int = Query(200, ge=1, le=500, description="本页最多返回多少条"),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None, description="按会话状态过滤，如 ai_active"),
    classification: str | None = Query(None, description="按分类过滤：negotiating / qualified / eliminated"),
    db: Session = Depends(get_db),
    merchant: MerchantAccount = Depends(require_merchant),
):
    """洽谈会话列表。

    之前是全量返回且每条都内嵌全部消息：单个商家积累到上千条会话时，
    响应会有数 MB，前端也会卡。现在默认最多返回 200 条，
    并通过 X-Total-Count 给出该商家在当前过滤条件下的总数，
    调用方据此实现分页或「只显示最近 N 条」。
    """
    conditions = [Negotiation.merchant_id == merchant.id]
    if status:
        conditions.append(Negotiation.status == status)
    if classification:
        conditions.append(Negotiation.classification == classification)

    total = db.scalar(select(func.count(Negotiation.id)).where(*conditions)) or 0
    response.headers["X-Total-Count"] = str(total)

    rows = db.scalars(
        select(Negotiation)
        .where(*conditions)
        .options(
            selectinload(Negotiation.messages),
            selectinload(Negotiation.supplier).selectinload(Supplier.qualification_files),
            selectinload(Negotiation.product),
        )
        .order_by(Negotiation.updated_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return rows


@app.get("/api/negotiations/stream")
async def stream_negotiations(merchant: MerchantAccount = Depends(require_merchant)):
    """商家侧实时通道：任一会话出现新消息、状态 / 评分 / 分类变化即推送一次事件（仅当前商家）。

    签名用「会话数 + 消息总数」即可覆盖所有会改变界面的操作：新供应商提交会新增会话，
    供应商发言、AI 回复、接管 / 恢复 / 人工回复都会新增消息，因此任何值得刷新的事件都会
    使消息总数增长。前端收到 event: change 后自行重新拉取，不依赖具体字段。
    """
    merchant_id = merchant.id

    def snapshot() -> tuple[int, int]:
        """同步查库放到线程池执行。

        SessionLocal 是同步的，直接在 async 生成器里调用会阻塞事件循环——
        每个 SSE 连接每 2 秒阻塞一次，连接一多就会拖慢所有请求。
        """
        with SessionLocal() as db:
            negotiations = db.scalar(select(func.count(Negotiation.id)).where(Negotiation.merchant_id == merchant_id)) or 0
            messages = db.scalar(select(func.count(Message.id)).join(Negotiation, Message.negotiation_id == Negotiation.id).where(Negotiation.merchant_id == merchant_id)) or 0
            return negotiations, messages

    async def events():
        last_signature = None
        for _ in range(900):  # 约 30 分钟，之后由前端自动重连
            signature = await asyncio.to_thread(snapshot)
            if signature != last_signature:
                yield f"event: change\ndata: {json.dumps({'negotiations': signature[0], 'messages': signature[1]}, ensure_ascii=False)}\n\n"
                last_signature = signature
            else:
                yield ": keep-alive\n\n"
            await asyncio.sleep(2)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/negotiations/{negotiation_id}", response_model=NegotiationOut)
def get_negotiation(negotiation_id: int, db: Session = Depends(get_db), authorization: str | None = Header(default=None)):
    negotiation = get_negotiation_or_404(db, negotiation_id)
    authorize_negotiation(db, negotiation.supplier.phone, negotiation.merchant_id, authorization)
    return negotiation


@app.post("/api/negotiations/{negotiation_id}/messages", response_model=ChatOut)
async def post_supplier_message(negotiation_id: int, payload: ChatIn, db: Session = Depends(get_db), authorization: str | None = Header(default=None)):
    negotiation = get_negotiation_or_404(db, negotiation_id)
    authorize_negotiation(db, negotiation.supplier.phone, negotiation.merchant_id, authorization)
    history = [
        {"role": "user" if m.sender == "supplier" else "assistant", "content": m.content}
        for m in negotiation.messages
        if m.sender in {"supplier", "ai"}
    ][-10:]
    local_terms = extract_supplier_terms(payload.content)
    db.add(Message(negotiation_id=negotiation.id, sender="supplier", content=payload.content))

    # 只有商家真正点击接管后才停止 LLM；高分候选本身不会关闭 AI。
    if negotiation.status == "human_active":
        db.commit()
        return ChatOut(negotiation_id=negotiation.id, status=negotiation.status, assistant_message=None, handoff_required=True, classification=negotiation.classification, score=negotiation.score)
    # 兼容旧版本自动写入的等待接管状态，使历史优质候选也能继续 AI 洽谈。
    if negotiation.status == "manual_required":
        negotiation.status = "ai_active"

    if negotiation.status == "closed":
        db.add(Message(negotiation_id=negotiation.id, sender="ai", content=POLITE_CLOSE_REPLY))
        db.commit()
        return ChatOut(negotiation_id=negotiation.id, status="closed", assistant_message=POLITE_CLOSE_REPLY, handoff_required=False, classification="eliminated", score=negotiation.score)

    rule = db.scalar(select(ProcurementRule).where(ProcurementRule.product_id == negotiation.product_id, ProcurementRule.active.is_(True)))
    previous_price = negotiation.quoted_price
    previous_moq = negotiation.moq
    previous_lead_days = negotiation.lead_days
    previous_payment_days = negotiation.payment_days
    decision_context = f"当前评分 {negotiation.score}。"
    if rule is not None:
        detected = []
        if local_terms.quoted_price is not None:
            detected.append(f"报价 ¥{local_terms.quoted_price:g}")
        if local_terms.moq is not None:
            detected.append(f"起订量 {local_terms.moq} 件")
        if local_terms.lead_days is not None:
            detected.append(f"交期 {local_terms.lead_days} 天")
        if local_terms.payment_days is not None:
            detected.append(f"账期 {local_terms.payment_days} 天")
        decision_context += (
            f" 当前条款：报价 ¥{negotiation.quoted_price:g}（目标 ¥{rule.target_price:g}）、"
            f"起订量 {negotiation.moq}（上限 {rule.max_moq}）、交期 {negotiation.lead_days} 天（上限 {rule.max_lead_days}）、"
            f"账期 {negotiation.payment_days} 天（最低期望 {rule.max_payment_days}）。"
        )
        if detected:
            decision_context += f" 供应商本轮明确提出：{'、'.join(detected)}。"
        concessions = []
        if local_terms.quoted_price is not None and local_terms.quoted_price < negotiation.quoted_price:
            concessions.append(f"报价从 ¥{negotiation.quoted_price:g} 降到 ¥{local_terms.quoted_price:g}")
        if local_terms.moq is not None and local_terms.moq < negotiation.moq:
            concessions.append(f"起订量从 {negotiation.moq} 件降到 {local_terms.moq} 件")
        if local_terms.lead_days is not None and local_terms.lead_days < negotiation.lead_days:
            concessions.append(f"交期从 {negotiation.lead_days} 天缩短到 {local_terms.lead_days} 天")
        if local_terms.payment_days is not None and local_terms.payment_days > negotiation.payment_days:
            concessions.append(f"账期从 {negotiation.payment_days} 天延长到 {local_terms.payment_days} 天")
        if concessions:
            decision_context += f" 相比上一轮的变化：{'；'.join(concessions)}。"
        effective_price = local_terms.quoted_price if local_terms.quoted_price is not None else negotiation.quoted_price
        effective_moq = local_terms.moq if local_terms.moq is not None else negotiation.moq
        effective_lead = local_terms.lead_days if local_terms.lead_days is not None else negotiation.lead_days
        effective_payment = local_terms.payment_days if local_terms.payment_days is not None else negotiation.payment_days
        remaining = []
        achieved = []
        (remaining if effective_price > rule.target_price else achieved).append("价格")
        (remaining if effective_moq > rule.max_moq * 0.5 else achieved).append("起订量")
        (remaining if effective_lead > rule.max_lead_days * 0.5 else achieved).append("交期")
        (remaining if effective_payment < rule.max_payment_days else achieved).append("账期")
        decision_context += f" 尚未达到采购目标：{'、'.join(remaining) or '无'}；已经达到采购目标：{'、'.join(achieved) or '无'}。"

    # 先把「供应商已发言」这一步提交掉，再去调大模型。
    # 原实现把整段逻辑放在同一个事务里，大模型调用（超时 60s）被夹在事务中间：
    # 既长时间占着连接，模型一旦抛错还会连供应商刚说的话一起回滚丢掉。
    db.commit()

    turn = await generate_negotiation_turn(
        supplier_message=payload.content,
        decision_context=decision_context,
        history=history,
        extract_terms=False,
    )
    handoff_required = negotiation.classification == "qualified"

    # 条款数字由本地确定性解析负责，模型只负责理解上下文并自然表达。
    quoted_price = local_terms.quoted_price if local_terms.quoted_price is not None else turn.quoted_price
    moq = local_terms.moq if local_terms.moq is not None else turn.moq
    lead_days = local_terms.lead_days if local_terms.lead_days is not None else turn.lead_days
    payment_days = local_terms.payment_days if local_terms.payment_days is not None else turn.payment_days
    terms_recognized = any(value is not None for value in (quoted_price, moq, lead_days, payment_days))

    # 供应商在对话中给出明确新条款时，程序重新执行底线校验与评分；AI 只转述条款，不做决策。
    updates = []
    if quoted_price is not None and float(quoted_price) != negotiation.quoted_price:
        negotiation.quoted_price = float(quoted_price)
        updates.append(f"报价 ¥{quoted_price:g}/件")
    if moq is not None and int(moq) != negotiation.moq:
        negotiation.moq = int(moq)
        updates.append(f"起订量 {moq} 件")
    if lead_days is not None and int(lead_days) != negotiation.lead_days:
        negotiation.lead_days = int(lead_days)
        updates.append(f"交期 {lead_days} 天")
    if payment_days is not None and int(payment_days) != negotiation.payment_days:
        negotiation.payment_days = int(payment_days)
        updates.append(f"账期 {payment_days} 天")

    if rule is not None and terms_recognized:
        previous_score = negotiation.score
        supplier = negotiation.supplier
        hard, scored, classification, _ = evaluate_terms(
            rule,
            quoted_price=negotiation.quoted_price,
            moq=negotiation.moq,
            lead_days=negotiation.lead_days,
            payment_days=negotiation.payment_days,
            qualifications=supplier.qualifications or [],
            region=supplier.region,
            cooperation_rating=supplier.cooperation_rating,
        )
        negotiation.score = scored.total
        negotiation.hard_fail_reasons = hard.reasons
        previous_classification = negotiation.classification
        negotiation.classification = classification
        terms_note = "、".join(updates) if updates else "明确条款与当前记录一致"
        db.add(Message(negotiation_id=negotiation.id, sender="system", content=f"供应商更新或确认条件（{terms_note}），程序重新校验评分：{previous_score} → {scored.total}，分类调整为「{LABEL_ZH[classification]}」。"))
        if classification == "eliminated":
            negotiation.status = "ai_active"
            handoff_required = False
            turn = await generate_boundary_recovery_reply(
                supplier_message=payload.content,
                reasons=hard.reasons,
                history=history,
                previous_price=previous_price,
                previous_moq=previous_moq,
                previous_lead_days=previous_lead_days,
                previous_payment_days=previous_payment_days,
            )
            db.add(Message(negotiation_id=negotiation.id, sender="system", content="本轮方案触碰采购底线，但会话保持开启；AI 已邀请供应商回到上一轮条件继续协商。"))
        elif classification == "qualified":
            negotiation.status = "ai_active"
            handoff_required = True
            if previous_classification != "qualified":
                db.add(Message(negotiation_id=negotiation.id, sender="system", content="该供应商已达到建议人工接管标准；在商家点击接管前，AI 将继续回复。"))
        else:
            negotiation.status = "ai_active"
            handoff_required = False

    db.add(ai_or_notice_message(negotiation.id, turn))
    db.commit()
    return ChatOut(
        negotiation_id=negotiation.id,
        status=negotiation.status,
        # 模型不可用时没有 AI 回复可返回，避免前端把兜底文案当成 AI 发言展示。
        assistant_message=None if turn.mode == "fallback" else turn.reply,
        handoff_required=handoff_required,
        classification=negotiation.classification,
        score=negotiation.score,
    )


@app.post("/api/negotiations/{negotiation_id}/handoff", response_model=NegotiationOut)
def handoff_to_human(negotiation_id: int, db: Session = Depends(get_db), merchant: MerchantAccount = Depends(require_merchant)):
    negotiation = get_negotiation_or_404(db, negotiation_id)
    if negotiation.merchant_id != merchant.id:
        raise HTTPException(status_code=404, detail="谈判记录不存在")
    if negotiation.classification == "eliminated":
        raise HTTPException(status_code=409, detail="已淘汰供应商不可转入人工洽谈")
    negotiation.status = "human_active"
    db.add(Message(negotiation_id=negotiation.id, sender="system", content="商家已接管谈判，AI 自动回复已停止。"))
    db.commit()
    return get_negotiation_or_404(db, negotiation_id)


@app.post("/api/negotiations/{negotiation_id}/human-messages", response_model=NegotiationOut)
def post_human_message(negotiation_id: int, payload: ChatIn, db: Session = Depends(get_db), merchant: MerchantAccount = Depends(require_merchant)):
    negotiation = get_negotiation_or_404(db, negotiation_id)
    if negotiation.merchant_id != merchant.id:
        raise HTTPException(status_code=404, detail="谈判记录不存在")
    if negotiation.classification == "eliminated":
        raise HTTPException(status_code=409, detail="已淘汰供应商不可继续洽谈")
    negotiation.status = "human_active"
    db.add(Message(negotiation_id=negotiation.id, sender="human", content=payload.content))
    db.commit()
    return get_negotiation_or_404(db, negotiation_id)


@app.post("/api/negotiations/{negotiation_id}/resume-ai", response_model=NegotiationOut)
def resume_ai(negotiation_id: int, db: Session = Depends(get_db), merchant: MerchantAccount = Depends(require_merchant)):
    negotiation = get_negotiation_or_404(db, negotiation_id)
    if negotiation.merchant_id != merchant.id:
        raise HTTPException(status_code=404, detail="谈判记录不存在")
    if negotiation.classification == "eliminated":
        raise HTTPException(status_code=409, detail="已淘汰供应商不能恢复谈判")
    negotiation.status = "ai_active"
    db.add(Message(negotiation_id=negotiation.id, sender="system", content="商家已恢复 AI 自动谈判。"))
    db.commit()
    return get_negotiation_or_404(db, negotiation_id)


@app.get("/api/negotiations/{negotiation_id}/stream")
async def stream_negotiation(negotiation_id: int, merchant: MerchantAccount = Depends(require_merchant)):
    merchant_id = merchant.id

    def read_snapshot() -> tuple[bool, str, bool]:
        """同步查库放到线程池（同上，避免阻塞事件循环）。"""
        with SessionLocal() as db:
            negotiation = db.get(Negotiation, negotiation_id)
            if negotiation is None or negotiation.merchant_id != merchant_id:
                return False, "", False
            payload = {"id": negotiation.id, "status": negotiation.status, "score": negotiation.score, "classification": negotiation.classification}
            return True, json.dumps(payload, ensure_ascii=False, sort_keys=True), negotiation.status == "closed"

    async def events():
        last_signature = None
        for _ in range(900):
            found, signature, closed = await asyncio.to_thread(read_snapshot)
            if not found:
                yield "event: error\ndata: {\"detail\": \"谈判记录不存在\"}\n\n"
                return
            if signature != last_signature:
                yield f"event: status\ndata: {signature}\n\n"
                last_signature = signature
            else:
                yield ": keep-alive\n\n"
            if closed:
                return
            await asyncio.sleep(2)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
