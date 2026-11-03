from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class RuleDecision:
    passed: bool
    reasons: list[str]
    # 结构化原因：reasons 是给人看的中文文案，reason_codes 供需要多语言展示的
    # 前端按 code + 参数自行翻译。两者同源生成，避免只改一侧导致口径不一致。
    reason_codes: list[dict[str, Any]] = field(default_factory=list)


def enforce_hard_rules(
    *,
    quoted_price: float,
    hard_max_price: float,
    moq: int,
    max_moq: int,
    lead_days: int,
    max_lead_days: int,
    payment_days: int = 0,
    min_payment_days: int = 0,
    qualifications: list[str],
    required_qualifications: list[str],
) -> RuleDecision:
    """硬性底线由程序执行，永远不由 LLM 判断。"""
    reasons: list[str] = []
    reason_codes: list[dict[str, Any]] = []
    if quoted_price > hard_max_price:
        reasons.append(f"报价 {quoted_price:.2f} 超过硬性上限 {hard_max_price:.2f}")
        reason_codes.append({"code": "price_above_ceiling", "quoted_price": round(quoted_price, 2), "hard_max_price": round(hard_max_price, 2)})
    if moq > max_moq:
        reasons.append(f"起订量 {moq} 超过上限 {max_moq}")
        reason_codes.append({"code": "moq_above_max", "moq": moq, "max_moq": max_moq})
    if lead_days > max_lead_days:
        reasons.append(f"交付周期 {lead_days} 天超过上限 {max_lead_days} 天")
        reason_codes.append({"code": "lead_time_above_max", "lead_days": lead_days, "max_lead_days": max_lead_days})
    if payment_days < min_payment_days:
        reasons.append(f"账期 {payment_days} 天低于最低要求 {min_payment_days} 天")
        reason_codes.append({"code": "payment_below_min", "payment_days": payment_days, "min_payment_days": min_payment_days})
    missing = sorted(set(required_qualifications) - set(qualifications))
    if missing:
        reasons.append("缺少必备资质：" + "、".join(missing))
        reason_codes.append({"code": "missing_qualifications", "qualifications": missing})
    return RuleDecision(passed=not reasons, reasons=reasons, reason_codes=reason_codes)
