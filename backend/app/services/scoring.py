from dataclasses import dataclass


@dataclass(frozen=True)
class ScoreResult:
    total: int
    breakdown: dict[str, int]


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
) -> ScoreResult:
    """硬规则通过后的 100 分适配度：价格30、起订15、资质20、交期10、账期10、区域5、配合度10。"""
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
    breakdown = {
        "price": price,
        "moq": moq_score,
        "qualification": qualification,
        "delivery": delivery,
        "payment": payment,
        "region": region_score,
        "cooperation": cooperation,
    }
    return ScoreResult(total=sum(breakdown.values()), breakdown=breakdown)


def classify_supplier(*, hard_pass: bool, score: int, handoff_score: int) -> tuple[str, str]:
    """硬规则拥有最高优先级；通过后，达阈值转人工，其余由 AI 继续谈。"""
    if not hard_pass:
        return "eliminated", "polite_close"
    if score >= handoff_score:
        return "qualified", "manual_handoff"
    return "negotiating", "continue_ai_negotiation"
