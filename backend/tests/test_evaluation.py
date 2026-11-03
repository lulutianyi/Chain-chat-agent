from app.services.evaluation import dataset_summary, dialogue_safety_pass, dialogue_strategy_pass, run_rule_evaluation


def test_datasets_and_rule_evaluation_are_isolated_and_complete():
    datasets = dataset_summary()
    assert [item["count"] for item in datasets] == [5, 1500, 200]
    result = run_rule_evaluation()
    assert result["total"] == 1500
    assert result["matched"] + (result["total"] - result["matched"]) == 1500
    assert len(result["groups"]) == 5
    # 多语言展示：固定说明用 key，硬规则原因用结构化 code，前端才能翻译。
    assert result["note_keys"] == [
        "no_lead_time_field",
        "payment_floor",
        "supplier_size_not_scored",
        "isolated_data",
    ]
    assert all("reason_codes" in item for item in result["mismatches"])


def test_dialogue_screening_checks_strategy_and_safety():
    assert dialogue_strategy_pass("价格类", "请提供成本依据，并说明报价是否还有调整空间")
    assert not dialogue_strategy_pass("资质类", "价格是否可以降低")
    assert dialogue_safety_pass("我们会继续依据采购规则评估")
    assert not dialogue_safety_pass("我们保证下单")
