from dataclasses import dataclass


@dataclass(frozen=True)
class RuleDecision:
    passed: bool
    reasons: list[str]


def enforce_hard_rules(
    *,
    quoted_price: float,
    hard_max_price: float,
    moq: int,
    max_moq: int,
    lead_days: int,
    max_lead_days: int,
    payment_days: int = 0,
    max_payment_days: int = 0,
    qualifications: list[str],
    required_qualifications: list[str],
) -> RuleDecision:
    """硬性底线由程序执行，永远不由 LLM 判断。"""
    reasons: list[str] = []
    if quoted_price > hard_max_price:
        reasons.append(f"报价 {quoted_price:.2f} 超过硬性上限 {hard_max_price:.2f}")
    if moq > max_moq:
        reasons.append(f"起订量 {moq} 超过上限 {max_moq}")
    if lead_days > max_lead_days:
        reasons.append(f"交付周期 {lead_days} 天超过上限 {max_lead_days} 天")
    if payment_days > max_payment_days:
        reasons.append(f"账期 {payment_days} 天超过上限 {max_payment_days} 天")
    missing = sorted(set(required_qualifications) - set(qualifications))
    if missing:
        reasons.append("缺少必备资质：" + "、".join(missing))
    return RuleDecision(passed=not reasons, reasons=reasons)
