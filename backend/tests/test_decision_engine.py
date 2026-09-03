import unittest

from app.services.rules import enforce_hard_rules
from app.services.scoring import calculate_supplier_score, classify_supplier


class DecisionEngineTests(unittest.TestCase):
    def test_hard_rule_rejects_moq_and_missing_qualification(self):
        result = enforce_hard_rules(
            quoted_price=21,
            hard_max_price=24.5,
            moq=300,
            max_moq=200,
            lead_days=7,
            max_lead_days=14,
            qualifications=["营业执照"],
            required_qualifications=["营业执照", "质检报告"],
        )
        self.assertFalse(result.passed)
        self.assertEqual(len(result.reasons), 2)

    def test_high_quality_supplier_requires_manual_handoff(self):
        score = calculate_supplier_score(
            quoted_price=18.6,
            target_price=22,
            moq=80,
            max_moq=200,
            qualifications=["营业执照", "质检报告", "可开发票"],
            required_qualifications=["营业执照", "质检报告"],
            region="福建",
            preferred_regions=["福建", "浙江"],
            cooperation_rating=90,
        )
        classification, action = classify_supplier(hard_pass=True, score=score.total, handoff_score=82)
        self.assertGreaterEqual(score.total, 82)
        self.assertEqual((classification, action), ("qualified", "manual_handoff"))


if __name__ == "__main__":
    unittest.main()
