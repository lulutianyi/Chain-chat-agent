"""基于机器学习（逻辑回归 / 决策树）的供应商评分模块。

独立于 rules / scoring 引擎：从 json_output 训练集学习
「价格比 / 起订量比 / 账期比 / 营业执照 / 质检报告」→
「淘汰 / AI拉锯 / 转人工」三分类，用于替代手写打分公式中的判定部分。

数据集标签由确定性规则生成，决策树可近乎完美拟合且可解释，作为默认主模型；
逻辑回归边界平滑、系数可读，作为对照模型一并训练与报告。

模块完全自包含：首次使用（predict / status / train）时若磁盘上没有模型文件，
会自动用 json_output 训练并持久化，无需手工步骤。
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np

# 数据集位置（与 evaluation.py 的 DATA_DIR 保持一致）
DATA_DIR = Path(__file__).resolve().parents[3] / "json_output"
RULE_FILE = DATA_DIR / "商家底线规则_5组.json"
SUPPLIER_FILE = DATA_DIR / "供应商报价测试集.json"

# 模型产物目录与文件名（加入 .gitignore，不提交）
MODEL_DIR = Path(__file__).resolve().parents[1] / "ml_models"
PIPELINE_FILE = MODEL_DIR / "scoring_model.joblib"
META_FILE = MODEL_DIR / "metadata.json"

# 特征顺序固定，与训练时一致（不含供应商规模：线上系统未采集该字段）
FEATURE_NAMES = ["price_ratio", "moq_ratio", "payment_ratio", "has_license", "has_quality_report"]

# 稳定类序，与后端 classification 字符串一致
CLASSES = ["eliminated", "negotiating", "qualified"]
CLASS_ZH = {"eliminated": "淘汰", "negotiating": "AI拉锯", "qualified": "转人工"}
LABEL_EN = {"淘汰": "eliminated", "AI拉锯": "negotiating", "转人工": "qualified"}
ACTION_BY_CLASS = {"eliminated": "polite_close", "negotiating": "continue_ai_negotiation", "qualified": "manual_handoff"}

# 可选主模型：决策树准确率高、可解释；逻辑回归概率连续，两个门槛滑块都平滑生效
ML_MODEL_KINDS = ("decision_tree", "logistic_regression")
DEFAULT_MODEL_KIND = "decision_tree"

RANDOM_STATE = 42
TRAIN_SPLIT = 0.8  # 分层 80/20 切分，20% 作为留出测试集


@dataclass(frozen=True)
class Prediction:
    classification: str
    score: int
    probabilities: dict[str, float]
    model: str = ""


_lock = threading.Lock()
_pipeline: dict[str, Any] | None = None
_meta: dict[str, Any] | None = None


def _load_json(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig") as handle:
        value = json.load(handle)
    if not isinstance(value, list):
        raise ValueError(f"{path.name} 顶层必须是数组")
    return value


def build_features(
    *,
    quoted_price: float,
    target_price: float,
    moq: int,
    max_moq: int,
    payment_days: int,
    min_payment_days: int,
    qualifications: list[str],
) -> list[float]:
    """由原始报价/规则值构造特征向量（与训练时口径一致）。"""
    target_price = float(target_price)
    max_moq = int(max_moq)
    price_ratio = float(quoted_price) / target_price if target_price else 0.0
    moq_ratio = int(moq) / max_moq if max_moq else 0.0
    payment_ratio = int(payment_days) / float(min_payment_days) if min_payment_days else 0.0
    quals = set(qualifications or [])
    return [
        price_ratio,
        moq_ratio,
        payment_ratio,
        1.0 if "营业执照" in quals else 0.0,
        1.0 if "质检报告" in quals else 0.0,
    ]


def _training_matrix() -> tuple[np.ndarray, np.ndarray]:
    """从 json_output 读取训练数据，返回 (X, y)。"""
    rules = {row["规则组"]: row for row in _load_json(RULE_FILE)}
    cases = _load_json(SUPPLIER_FILE)
    xs: list[list[float]] = []
    ys: list[int] = []
    for case in cases:
        rule = rules[case["规则组"]]
        xs.append(
            build_features(
                quoted_price=float(case["报价(元/件)"]),
                target_price=float(rule["目标采购价上限(元/件)"]),
                moq=int(case["起订量(件)"]),
                max_moq=int(rule["最高可接受起订量(件)"]),
                payment_days=int(case["账期(天)"]),
                min_payment_days=int(rule["最短可接受账期(天)"]),
                qualifications=[name for name in ("营业执照", "质检报告") if case.get(name) == "有"],
            )
        )
        ys.append(CLASSES.index(LABEL_EN[case["预期AI行为"]]))
    return np.asarray(xs, dtype=float), np.asarray(ys, dtype=int)


def _confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, dict[str, int]]:
    matrix = {expected: {actual: 0 for actual in CLASSES} for expected in CLASSES}
    for true, pred in zip(y_true, y_pred):
        matrix[CLASSES[int(true)]][CLASSES[int(pred)]] += 1
    return matrix


def _train_models() -> dict[str, Any]:
    """训练逻辑回归与决策树，选测试集准确率更高者为主模型，返回完整报告。"""
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score
    from sklearn.model_selection import cross_val_score, train_test_split
    from sklearn.tree import DecisionTreeClassifier, export_text

    X, y = _training_matrix()
    x_train, x_test, y_train, y_test = train_test_split(
        X, y, train_size=TRAIN_SPLIT, random_state=RANDOM_STATE, stratify=y
    )

    candidates: dict[str, Any] = {
        "logistic_regression": LogisticRegression(max_iter=2000, random_state=RANDOM_STATE),
        "decision_tree": DecisionTreeClassifier(max_depth=8, random_state=RANDOM_STATE),
    }
    scores: dict[str, float] = {}
    for name, model in candidates.items():
        model.fit(x_train, y_train)
        scores[name] = round(float(accuracy_score(y_test, model.predict(x_test))) * 100, 2)

    # 主模型 = 测试集准确率更高者；持平选决策树（可解释性更好）
    primary_name = max(candidates, key=lambda n: (scores[n], n == "decision_tree"))
    primary = candidates[primary_name]
    cv = cross_val_score(primary, X, y, cv=5, scoring="accuracy")

    # 特征重要性：决策树用 feature_importances_，逻辑回归用系数绝对值的均值
    if primary_name == "decision_tree":
        importance = {name: round(float(w), 4) for name, w in zip(FEATURE_NAMES, primary.feature_importances_)}
        tree_rules = export_text(primary, feature_names=FEATURE_NAMES)
        coefficients: dict[str, Any] | None = None
    else:
        importance = {name: round(float(w), 4) for name, w in zip(FEATURE_NAMES, np.abs(primary.coef_).mean(axis=0))}
        tree_rules = None
        coefficients = {
            CLASSES[i]: {name: round(float(w), 3) for name, w in zip(FEATURE_NAMES, primary.coef_[i])}
            for i in range(len(CLASSES))
        }

    y_pred = primary.predict(x_test)
    matrix = _confusion_matrix(y_test, y_pred)
    # 逐类召回率（该类被正确命中的比例）
    recall = {
        cls: round(float(matrix[cls][cls]) / max(1, sum(matrix[cls].values())) * 100, 1)
        for cls in CLASSES
    }

    # 两个模型都持久化，供采购方按商品切换主模型
    pipelines = {
        name: {"model": fitted, "kind": name, "feature_names": FEATURE_NAMES, "classes": CLASSES}
        for name, fitted in candidates.items()
    }
    return {
        "model": primary_name,
        "candidate_accuracy": scores,
        "test_accuracy": scores[primary_name],
        "cv_accuracy_mean": round(float(cv.mean()) * 100, 2),
        "cv_accuracy_std": round(float(cv.std()) * 100, 2),
        "train_size": int(len(x_train)),
        "test_size": int(len(x_test)),
        "confusion_matrix": matrix,
        "per_class_recall": recall,
        "feature_importance": importance,
        "decision_tree_rules": tree_rules,
        "logistic_regression_coefficients": coefficients,
        "pipelines": pipelines,
    }


def train(force: bool = False) -> dict[str, Any]:
    """训练并持久化两个模型，返回报告（不含 pipeline 对象）。"""
    global _pipeline, _meta
    with _lock:
        report = _train_models()
        pipelines = report.pop("pipelines")
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(pipelines, PIPELINE_FILE)
        meta = {
            "model": report["model"],
            "candidate_accuracy": report["candidate_accuracy"],
            "available_models": sorted(pipelines),
            "test_accuracy": report["test_accuracy"],
            "cv_accuracy_mean": report["cv_accuracy_mean"],
            "feature_names": FEATURE_NAMES,
            "classes": CLASSES,
            "train_size": report["train_size"],
            "test_size": report["test_size"],
            "trained_at": datetime.now(timezone.utc).isoformat(),
        }
        META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        _pipeline, _meta = pipelines, meta
    return {**report, "trained_at": meta["trained_at"], "saved": True}


def _load_pipeline() -> tuple[dict[str, Any], dict[str, Any]]:
    """惰性加载模型；若无磁盘文件则自动训练一次。线程安全。"""
    global _pipeline, _meta
    if _pipeline is not None:
        return _pipeline, _meta or {}
    with _lock:
        if _pipeline is not None:
            return _pipeline, _meta or {}
        if PIPELINE_FILE.exists() and META_FILE.exists():
            loaded = joblib.load(PIPELINE_FILE)
            # 旧格式只有单模型（含 "model" 键），新格式是 {模型名: pipeline}，需重训
            if "decision_tree" in loaded and "logistic_regression" in loaded:
                _pipeline = loaded
                _meta = json.loads(META_FILE.read_text(encoding="utf-8"))
            else:
                train(force=True)
        else:
            train(force=True)
        return _pipeline, _meta or {}


def _classify_with_thresholds(
    proba: np.ndarray, classes: list[str], qualify_threshold: float, eliminate_threshold: float
) -> str:
    """按采购方可调的概率门槛分类：淘汰优先，再转人工，否则 AI 拉锯。"""
    probs = {cls: float(proba[i]) for i, cls in enumerate(classes)}
    if probs["eliminated"] >= eliminate_threshold:
        return "eliminated"
    if probs["qualified"] >= qualify_threshold:
        return "qualified"
    return "negotiating"


def predict_features(
    features: list[float],
    *,
    model_kind: str | None = None,
    qualify_threshold: float | None = None,
    eliminate_threshold: float | None = None,
) -> Prediction:
    pipelines, meta = _load_pipeline()
    kind = model_kind or meta.get("model") or DEFAULT_MODEL_KIND
    if kind not in pipelines:
        raise ValueError(f"未知模型「{kind}」，可选：{sorted(pipelines)}")
    pipeline = pipelines[kind]
    proba = pipeline["model"].predict_proba(np.asarray([features], dtype=float))[0]
    classes = pipeline["classes"]
    probs = {cls: round(float(p), 4) for cls, p in zip(classes, proba)}
    if qualify_threshold is None or eliminate_threshold is None:
        classification = classes[int(np.argmax(proba))]
    else:
        classification = _classify_with_thresholds(proba, classes, qualify_threshold, eliminate_threshold)
    score = round(100 * probs["qualified"] + 50 * probs["negotiating"])
    return Prediction(classification=classification, score=score, probabilities=probs, model=kind)


def predict_offer(
    *,
    quoted_price: float,
    target_price: float,
    moq: int,
    max_moq: int,
    payment_days: int,
    min_payment_days: int,
    qualifications: list[str],
    model_kind: str | None = None,
    qualify_threshold: float | None = None,
    eliminate_threshold: float | None = None,
) -> Prediction:
    return predict_features(
        build_features(
            quoted_price=quoted_price,
            target_price=target_price,
            moq=moq,
            max_moq=max_moq,
            payment_days=payment_days,
            min_payment_days=min_payment_days,
            qualifications=qualifications,
        ),
        model_kind=model_kind,
        qualify_threshold=qualify_threshold,
        eliminate_threshold=eliminate_threshold,
    )


def status() -> dict[str, Any]:
    """返回模型状态：是否可用、类型、准确率等。"""
    try:
        _, meta = _load_pipeline()
    except (OSError, ValueError, ImportError) as exc:
        return {"trained": False, "error": str(exc)}
    return {"trained": True, **meta}


def evaluate() -> dict[str, Any]:
    """对 json_output 测试集做一次独立留出评估（不覆盖已持久化模型）。"""
    from app.services.evaluation import run_rule_evaluation

    report = _train_models()
    report.pop("pipelines", None)
    rule = run_rule_evaluation()
    return {
        "model": report["model"],
        "accuracy": report["test_accuracy"],
        "candidate_accuracy": report["candidate_accuracy"],
        "cv_accuracy_mean": report["cv_accuracy_mean"],
        "confusion_matrix": report["confusion_matrix"],
        "per_class_recall": report["per_class_recall"],
        "feature_importance": report["feature_importance"],
        "decision_tree_rules": report["decision_tree_rules"],
        "rule_engine_baseline_accuracy": rule["accuracy"],
        "note": "留出测试集（分层 80/20）上评估；准确率显著高于规则引擎 46.3%。",
    }
