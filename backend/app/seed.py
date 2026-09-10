from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MerchantAccount, Product, ProcurementRule
from app.security import hash_password


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


def seed_demo_data(db: Session) -> None:
    if db.scalar(select(Product.id).limit(1)) is not None:
        return
    for item in DEMO_PRODUCTS:
        product = Product(name=item["name"], category=item["category"], description=item["description"])
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


def seed_merchant_account(db: Session) -> None:
    """幂等写入唯一采购方账号（虚构「小鹿生活馆」），默认密码 链谈Agent123，可在账号安全里改。"""
    if db.scalar(select(MerchantAccount.id).limit(1)) is not None:
        return
    db.add(
        MerchantAccount(
            store_name="小鹿生活馆",
            logo_emoji="🦌",
            contact="",
            category="",
            password_hash=hash_password("链谈Agent123"),
        )
    )
    db.commit()
