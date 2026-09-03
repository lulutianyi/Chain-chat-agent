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
) -> ScoreResult:
    """100 分加权评分：价格 35，起订 20，资质 25，区域 10，配合度 10。"""
    price_ratio = quoted_price / target_price
    price = 35 if price_ratio <= 1 else max(0, round(35 - (price_ratio - 1) * 70))
    moq_ratio = moq / max_moq
    moq_score = 20 if moq_ratio <= 0.5 else max(0, round(20 - (moq_ratio - 0.5) * 20))
    required = set(required_qualifications)
    qualification = 25 if not required else round(25 * len(required & set(qualifications)) / len(required))
    region_score = 10 if any(preferred in region for preferred in preferred_regions) else 5
    cooperation = round(max(0, min(100, cooperation_rating)) / 10)
    breakdown = {
        "price": price,
        "moq": moq_score,
        "qualification": qualification,
        "region": region_score,
        "cooperation": cooperation,
    }
    return ScoreResult(total=sum(breakdown.values()), breakdown=breakdown)


def classify_supplier(*, hard_pass: bool, score: int, handoff_score: int) -> tuple[str, str]:
    if not hard_pass:
        return "eliminated", "polite_close"
    if score >= handoff_score:
        return "qualified", "manual_handoff"
    return "negotiating", "continue_ai_negotiation"
