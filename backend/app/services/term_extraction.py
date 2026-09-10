import re
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class SupplierTerms:
    quoted_price: float | None = None
    moq: int | None = None
    lead_days: int | None = None
    payment_days: int | None = None

    @property
    def detected(self) -> bool:
        return any(value is not None for value in (self.quoted_price, self.moq, self.lead_days, self.payment_days))


NUMBER = r"(?P<value>\d+(?:\.\d+)?)"
NEGATIVE_AFTER = re.compile(r"(?:不行|不可以|不能|无法|不接受|做不到|没办法|不考虑)")
CLAUSE_SPLIT = re.compile(r"[，,。；;！？!?\n]+")


def _normalise(text: str) -> str:
    return unicodedata.normalize("NFKC", text).replace("块钱", "元").replace("块", "元")


def _candidate_is_rejected(clause: str, start: int, end: int) -> bool:
    """忽略“50元不行”里的50，但保留“最低只能51元”里的51。"""
    after = clause[end:end + 8]
    before = clause[max(0, start - 10):start]
    return bool(NEGATIVE_AFTER.search(after)) and not re.search(r"最低|底价|只能|至少", before)


def _last_value(clauses: list[str], keywords: re.Pattern[str], patterns: list[re.Pattern[str]], cast):
    candidates: list[tuple[int, float]] = []
    offset = 0
    for clause in clauses:
        if not keywords.search(clause):
            offset += len(clause) + 1
            continue
        for pattern in patterns:
            for match in pattern.finditer(clause):
                if _candidate_is_rejected(clause, match.start("value"), match.end("value")):
                    continue
                value = float(match.group("value"))
                if value > 0:
                    candidates.append((offset + match.start(), value))
        offset += len(clause) + 1
    return cast(candidates[-1][1]) if candidates else None


def extract_supplier_terms(message: str) -> SupplierTerms:
    """从供应商原话提取明确条款。只认带业务关键词/单位的数字，避免把普通日期或序号当成报价。"""
    text = _normalise(message)
    clauses = [part.strip() for part in CLAUSE_SPLIT.split(text) if part.strip()]

    price = _last_value(
        clauses,
        re.compile(r"报价|价格|单价|成本|底价|元|¥|￥"),
        [
            re.compile(rf"(?:调整|修改|降低|降|改|做到|给到|报|定|最低|底价|只能)[^\d]{{0,8}}(?:到|为|是)?[^\d]{{0,3}}[¥￥]?\s*{NUMBER}\s*元?"),
            re.compile(rf"[¥￥]\s*{NUMBER}"),
            re.compile(rf"{NUMBER}\s*元(?:\s*/\s*件|每件)?"),
        ],
        float,
    )
    moq = _last_value(
        clauses,
        re.compile(r"起订|MOQ|订量|首批|试单", re.IGNORECASE),
        [
            re.compile(rf"(?:起订量|最低起订量|MOQ|首批|试单)[^\d]{{0,10}}{NUMBER}\s*(?:件|个|套)?", re.IGNORECASE),
            re.compile(rf"{NUMBER}\s*(?:件|个|套)\s*(?:起订|起做|试单)"),
        ],
        int,
    )
    lead_days = _last_value(
        clauses,
        re.compile(r"交期|备货|交货|发货|出货|排产"),
        [
            re.compile(rf"(?:交期|备货周期|交货周期|发货周期|排产)[^\d]{{0,10}}{NUMBER}\s*天"),
            re.compile(rf"{NUMBER}\s*天[^，,。；;]{{0,5}}(?:交货|发货|出货|备货)"),
        ],
        int,
    )
    payment_days = _last_value(
        clauses,
        re.compile(r"账期|付款周期|结算周期|月结"),
        [
            re.compile(rf"(?:账期|付款周期|结算周期|月结)[^\d]{{0,10}}{NUMBER}\s*天"),
            re.compile(rf"{NUMBER}\s*天[^，,。；;]{{0,5}}(?:账期|付款|结算)"),
        ],
        int,
    )
    return SupplierTerms(quoted_price=price, moq=moq, lead_days=lead_days, payment_days=payment_days)
