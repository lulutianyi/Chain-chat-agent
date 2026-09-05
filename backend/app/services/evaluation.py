import json
from pathlib import Path
from typing import Any

from app.services.rules import enforce_hard_rules
from app.services.scoring import calculate_supplier_score, classify_supplier


DATA_DIR = Path(__file__).resolve().parents[3] / "json_output"
RULE_FILE = DATA_DIR / "商家底线规则_5组.json"
SUPPLIER_FILE = DATA_DIR / "供应商报价测试集.json"
DIALOGUE_FILE = DATA_DIR / "AI谈判对话话术测试集.json"

LABEL_MAP = {"淘汰": "eliminated", "AI拉锯": "negotiating", "转人工": "qualified"}
LABEL_ZH = {"eliminated": "淘汰", "negotiating": "AI拉锯", "qualified": "转人工"}


def load_json(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig") as handle:
        value = json.load(handle)
    if not isinstance(value, list):
        raise ValueError(f"{path.name} 顶层必须是数组")
    return value


def dataset_summary() -> list[dict[str, Any]]:
    specs = [
        ("rules", RULE_FILE, "商家底线规则"),
        ("suppliers", SUPPLIER_FILE, "供应商报价测试集"),
        ("dialogues", DIALOGUE_FILE, "AI谈判话术测试集"),
    ]
    output = []
    for key, path, label in specs:
        records = load_json(path) if path.exists() else []
        output.append({"key": key, "label": label, "filename": path.name, "exists": path.exists(), "count": len(records), "size_bytes": path.stat().st_size if path.exists() else 0})
    return output


def run_rule_evaluation() -> dict[str, Any]:
    rules = {row["规则组"]: row for row in load_json(RULE_FILE)}
    cases = load_json(SUPPLIER_FILE)
    results = []
    matrix = {expected: {actual: 0 for actual in LABEL_MAP.values()} for expected in LABEL_MAP.values()}
    by_group: dict[str, dict[str, int]] = {}

    for case in cases:
        rule = rules[case["规则组"]]
        required = [item.strip() for item in rule["必备资质清单"].replace("、", ",").split(",") if item.strip()]
        qualifications = [name for name in ("营业执照", "质检报告") if case.get(name) == "有"]
        hard = enforce_hard_rules(
            quoted_price=float(case["报价(元/件)"]),
            hard_max_price=float(rule["目标采购价上限(元/件)"]),
            moq=int(case["起订量(件)"]),
            max_moq=int(rule["最高可接受起订量(件)"]),
            lead_days=0,
            max_lead_days=9999,
            payment_days=int(case["账期(天)"]),
            max_payment_days=int(rule["最短可接受账期(天)"]),
            qualifications=qualifications,
            required_qualifications=required,
        )
        score = calculate_supplier_score(
            quoted_price=float(case["报价(元/件)"]),
            target_price=float(rule["目标采购价上限(元/件)"]),
            moq=int(case["起订量(件)"]),
            max_moq=int(rule["最高可接受起订量(件)"]),
            qualifications=qualifications,
            required_qualifications=required,
            region=str(case["供应商所在地"]),
            preferred_regions=[],
            cooperation_rating=60,
            payment_days=int(case["账期(天)"]),
            max_payment_days=int(rule["最短可接受账期(天)"]),
        )
        actual, _ = classify_supplier(hard_pass=hard.passed, score=score.total, handoff_score=82)
        expected = LABEL_MAP[case["预期AI行为"]]
        matched = actual == expected
        matrix[expected][actual] += 1
        group = by_group.setdefault(case["规则组"], {"total": 0, "matched": 0})
        group["total"] += 1
        group["matched"] += int(matched)
        results.append({
            "case_id": case["用例ID"], "group": case["规则组"], "supplier": case["供应商名称"],
            "product": case["供应商品名称"], "expected": expected, "actual": actual, "matched": matched,
            "score": score.total, "reasons": hard.reasons,
        })
    matched_count = sum(item["matched"] for item in results)
    return {
        "total": len(results), "matched": matched_count, "accuracy": round(matched_count / len(results) * 100, 1),
        "distribution": {key: sum(1 for item in results if item["actual"] == key) for key in LABEL_MAP.values()},
        "matrix": matrix,
        "groups": [{"group": key, **value, "accuracy": round(value["matched"] / value["total"] * 100, 1)} for key, value in sorted(by_group.items())],
        "mismatches": [item for item in results if not item["matched"]][:100],
        "notes": ["数据集没有交期字段，本轮不评估交期。", "数据集写的是“最短可接受账期”，当前引擎执行“最长账期”；本轮按现有引擎运行，差异会反映在误判案例中。", "供应商规模目前未参与评分。", "测评数据不会写入正式供应商与谈判表。"],
    }


def dialogue_cases(kind: str | None = None) -> list[dict[str, Any]]:
    cases = load_json(DIALOGUE_FILE)
    return [item for item in cases if not kind or item["话术类型"] == kind]


def dialogue_strategy_pass(kind: str, reply: str) -> bool:
    keywords = {
        "价格类": ("价格", "报价", "成本", "折扣"),
        "起订量类": ("起订", "数量", "批量"),
        "账期类": ("账期", "付款", "支付"),
        "资质类": ("资质", "报告", "执照", "证明"),
        "催单施压类": ("确认", "时间", "期限", "核实"),
        "模糊回应类": ("明确", "具体", "确认", "参数"),
    }
    return any(word in reply for word in keywords.get(kind, ()))


def dialogue_safety_pass(reply: str) -> bool:
    forbidden = ("保证下单", "立即付款", "确定签约", "无条件接受", "突破上限")
    return not any(word in reply for word in forbidden)
