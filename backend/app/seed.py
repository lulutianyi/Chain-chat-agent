from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import MerchantAccount, Product, ProcurementRule
from app.security import hash_password


# 默认演示商家的绑定邮箱（写死，可后续改成环境变量）。
DEMO_EMAIL = "admin@liantan.local"


DEMO_PRODUCTS = [
    {
        "name": "素色麻布抱枕",
        "category": "家居布艺",
        "description": "45×45cm，棉麻面料，可拆洗，适合秋季测款。",
        "rule": dict(target_price=22, hard_max_price=24.5, max_moq=200, max_lead_days=14),
        "regions": ["福建", "浙江", "江苏", "广东"],
    },
    {
        "name": "可叠衣物收纳篮",
        "category": "收纳日用",
        "description": "中号可叠收纳篮，带把手，支持定制外包装。",
        "rule": dict(target_price=15, hard_max_price=17, max_moq=150, max_lead_days=10),
        "regions": ["浙江", "江苏", "广东"],
    },
    {
        "name": "竹木餐盘·中号",
        "category": "厨房用品",
        "description": "原木色竹木餐盘，食品接触级涂层。",
        "rule": dict(target_price=17.5, hard_max_price=20, max_moq=120, max_lead_days=12),
        "regions": ["福建", "浙江", "江西"],
    },
]


def seed_merchant_account(db: Session) -> MerchantAccount:
    """幂等写入默认演示商家（虚构「小鹿生活馆」），返回该商家行。

    账号 / 手机号 / 密码分别取 MERCHANT_ACCOUNT / MERCHANT_PHONE / MERCHANT_PASSWORD 环境变量，
    邮箱使用 DEMO_EMAIL（写死）。旧库已有商家但缺这些字段时回填，保证升级后登录与隔离可用。
    """
    settings = get_settings()
    account = db.scalar(select(MerchantAccount).order_by(MerchantAccount.id).limit(1))
    if account is None:
        account = MerchantAccount(
            store_name="小鹿生活馆",
            logo_emoji="🦌",
            contact="",
            category="",
            account=settings.merchant_account,
            phone=settings.merchant_phone,
            email=DEMO_EMAIL,
            password_hash=hash_password(settings.merchant_password),
        )
        db.add(account)
    else:
        if not account.account:
            account.account = settings.merchant_account
        if not account.phone:
            account.phone = settings.merchant_phone
        if not account.email:
            account.email = DEMO_EMAIL
    db.commit()
    return account


def seed_demo_data(db: Session, merchant_id: int) -> None:
    """给指定商家写入 3 个演示商品（若该商家还没有任何商品）。"""
    if db.scalar(select(Product.id).where(Product.merchant_id == merchant_id).limit(1)) is not None:
        return
    for item in DEMO_PRODUCTS:
        product = Product(
            merchant_id=merchant_id,
            name=item["name"],
            category=item["category"],
            description=item["description"],
        )
        db.add(product)
        db.flush()
        db.add(
            ProcurementRule(
                product_id=product.id,
                **item["rule"],
                max_payment_days=30,
                handoff_score=82,
                required_qualifications=["营业执照", "质检报告"],
                preferred_regions=item["regions"],
            )
        )
    db.commit()
    if db.bind and db.bind.dialect.name == "sqlite":
        db.connection().exec_driver_sql("PRAGMA optimize")
