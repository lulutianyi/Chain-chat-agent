from dataclasses import dataclass


# 七维满分默认值，键与前端「打分权重」表一一对应。
DEFAULT_SCORE_WEIGHTS = {
    "price": 30,
    "moq": 15,
    "qualification": 20,
    "delivery": 10,
    "payment": 10,
    "region": 5,
    "cooperation": 10,
}
SCORE_WEIGHT_KEYS = tuple(DEFAULT_SCORE_WEIGHTS)


@dataclass(frozen=True)
class ScoreResult:
    total: int
    breakdown: dict[str, int]


def _resolve_weights(weights: dict[str, int] | None) -> dict[str, int]:
    """把采购方提交的七维满分合并进默认值：缺键回退默认，取值钳到 [0,100]。"""
    resolved = dict(DEFAULT_SCORE_WEIGHTS)
    for key in SCORE_WEIGHT_KEYS:
        if weights and key in weights:
            resolved[key] = max(0, min(100, int(weights[key])))
    return resolved


def calculate_supplier_score(
    *,
    quoted_price: float,
    target_price: float,
    moq: int,
    max_moq: int,
    qualifications: list[str],
    required_qualifications: list[str],
    region: str,
    preferred_regions: list[str],
    cooperation_rating: int,
    hard_max_price: float | None = None,
    lead_days: int = 0,
    max_lead_days: int = 0,
    payment_days: int = 0,
    min_payment_days: int = 0,
    weights: dict[str, int] | None = None,
) -> ScoreResult:
    """硬规则通过后的 100 分适配度：价格30、起订15、资质20、交期10、账期10、区域5、配合度10。

    weights 为空（默认）时走原有整数常量公式，保证既有行为、测评与测试逐分一致；
    采购方自定义七维满分后，各维按「0..1 归一比例 × 该维满分」套用新权重。
    """
    w = _resolve_weights(weights)
    if w == DEFAULT_SCORE_WEIGHTS:
        breakdown = _legacy_breakdown(
            quoted_price=quoted_price,
            target_price=target_price,
            moq=moq,
            max_moq=max_moq,
            qualifications=qualifications,
            required_qualifications=required_qualifications,
            region=region,
            preferred_regions=preferred_regions,
            cooperation_rating=cooperation_rating,
            hard_max_price=hard_max_price,
            lead_days=lead_days,
            max_lead_days=max_lead_days,
            payment_days=payment_days,
            min_payment_days=min_payment_days,
        )
    else:
        breakdown = _weighted_breakdown(
            weights=w,
            quoted_price=quoted_price,
            target_price=target_price,
            moq=moq,
            max_moq=max_moq,
            qualifications=qualifications,
            required_qualifications=required_qualifications,
            region=region,
            preferred_regions=preferred_regions,
            cooperation_rating=cooperation_rating,
            hard_max_price=hard_max_price,
            lead_days=lead_days,
            max_lead_days=max_lead_days,
            payment_days=payment_days,
            min_payment_days=min_payment_days,
        )
    return ScoreResult(total=sum(breakdown.values()), breakdown=breakdown)


def _legacy_breakdown(
    *,
    quoted_price: float,
    target_price: float,
    moq: int,
    max_moq: int,
    qualifications: list[str],
    required_qualifications: list[str],
    region: str,
    preferred_regions: list[str],
    cooperation_rating: int,
    hard_max_price: float | None,
    lead_days: int,
    max_lead_days: int,
    payment_days: int,
    min_payment_days: int,
) -> dict[str, int]:
    """默认权重下的原有整数常量公式（与历史行为完全一致）。"""
    price_ceiling = max(target_price, hard_max_price or target_price * 1.25)
    if quoted_price <= target_price:
        price = 30
    elif price_ceiling <= target_price:
        price = 12
    else:
        price = max(0, round(30 - 18 * (quoted_price - target_price) / (price_ceiling - target_price)))
    moq_ratio = moq / max_moq
    moq_score = 15 if moq_ratio <= 0.5 else max(0, round(15 - (moq_ratio - 0.5) * 18))
    required = set(required_qualifications)
    qualification = 20 if not required else round(20 * len(required & set(qualifications)) / len(required))
    if max_lead_days <= 0:
        delivery = 10
    else:
        delivery_ratio = lead_days / max_lead_days
        delivery = 10 if delivery_ratio <= 0.5 else max(0, round(10 - (delivery_ratio - 0.5) * 10))
    if min_payment_days <= 0:
        payment = 10
    elif payment_days < min_payment_days:
        payment = max(0, round(7 * payment_days / min_payment_days))
    else:
        payment = min(10, round(7 + 3 * (payment_days - min_payment_days) / min_payment_days))
    region_score = 5 if not preferred_regions or any(preferred in region for preferred in preferred_regions) else 3
    cooperation = round(max(0, min(100, cooperation_rating)) / 10)
    return {
        "price": price,
        "moq": moq_score,
        "qualification": qualification,
        "delivery": delivery,
        "payment": payment,
        "region": region_score,
        "cooperation": cooperation,
    }


def _weighted_breakdown(
    *,
    weights: dict[str, int],
    quoted_price: float,
    target_price: float,
    moq: int,
    max_moq: int,
    qualifications: list[str],
    required_qualifications: list[str],
    region: str,
    preferred_regions: list[str],
    cooperation_rating: int,
    hard_max_price: float | None,
    lead_days: int,
    max_lead_days: int,
    payment_days: int,
    min_payment_days: int,
) -> dict[str, int]:
    """自定义权重：每维先算 0..1 归一比例，再 round(比例 × 该维满分)。"""
    price_ceiling = max(target_price, hard_max_price or target_price * 1.25)
    if quoted_price <= target_price:
        price_ratio = 1.0
    elif price_ceiling <= target_price:
        price_ratio = 0.4
    else:
        price_ratio = max(0.0, 0.4 + 0.6 * (price_ceiling - quoted_price) / (price_ceiling - target_price))

    moq_ratio = moq / max_moq if max_moq else 0.0
    moq_norm = 1.0 if moq_ratio <= 0.5 else max(0.0, 1.0 - 1.2 * (moq_ratio - 0.5))

    required = set(required_qualifications)
    qual_norm = 1.0 if not required else len(required & set(qualifications)) / len(required)

    if max_lead_days <= 0:
        delivery_norm = 1.0
    else:
        delivery_ratio = lead_days / max_lead_days
        delivery_norm = 1.0 if delivery_ratio <= 0.5 else max(0.0, 1.0 - (delivery_ratio - 0.5))

    if min_payment_days <= 0:
        payment_norm = 1.0
    elif payment_days < min_payment_days:
        payment_norm = max(0.0, 0.7 * payment_days / min_payment_days)
    else:
        payment_norm = min(1.0, 0.7 + 0.3 * (payment_days - min_payment_days) / min_payment_days)

    region_norm = 1.0 if not preferred_regions or any(preferred in region for preferred in preferred_regions) else 0.6
    cooperation_norm = max(0.0, min(100, cooperation_rating)) / 100.0

    return {
        "price": round(weights["price"] * price_ratio),
        "moq": round(weights["moq"] * moq_norm),
        "qualification": round(weights["qualification"] * qual_norm),
        "delivery": round(weights["delivery"] * delivery_norm),
        "payment": round(weights["payment"] * payment_norm),
        "region": round(weights["region"] * region_norm),
        "cooperation": round(weights["cooperation"] * cooperation_norm),
    }


def classify_supplier(*, hard_pass: bool, score: int, handoff_score: int) -> tuple[str, str]:
    """硬规则拥有最高优先级；通过后，达阈值转人工，其余由 AI 继续谈。"""
    if not hard_pass:
        return "eliminated", "polite_close"
    if score >= handoff_score:
        return "qualified", "manual_handoff"
    return "negotiating", "continue_ai_negotiation"
