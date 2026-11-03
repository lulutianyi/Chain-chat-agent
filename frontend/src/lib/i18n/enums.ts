import { SCORE_DIMENSIONS, SCORING_MODEL_OPTIONS } from "@/lib/constants";
import type { Locale } from "./config";

/**
 * 「枚举值」的翻译。
 *
 * 与页面文案分开的原因：这些中文串同时是**提交给后端的值**
 * （资质名称、评分维度 key、打分模型 value），翻译只能发生在展示层，
 * 值本身必须原样保留，否则后端不认识。因此这里做成 value → 显示名的映射，
 * 而不是把 constants.ts 里的字面量直接改掉。
 */

const QUALIFICATION_LABELS: Record<Locale, Record<string, string>> = {
  zh: {
    营业执照: "营业执照",
    质检报告: "质检报告",
    可开发票: "可开发票",
  },
  en: {
    营业执照: "Business licence",
    质检报告: "Quality inspection report",
    可开发票: "Invoice available",
  },
};

/** 把一条资质值翻成当前语言的显示名；没登记的（历史数据/自定义项）原样返回。 */
export function qualificationLabel(value: string, locale: Locale): string {
  return QUALIFICATION_LABELS[locale][value] ?? value;
}

const SCORE_DIMENSION_LABELS: Record<Locale, Record<string, string>> = {
  zh: { price: "价格", moq: "起订量", qualification: "资质", delivery: "交期", payment: "账期", region: "区域", cooperation: "配合度" },
  en: { price: "Price", moq: "MOQ", qualification: "Credentials", delivery: "Lead time", payment: "Payment terms", region: "Region", cooperation: "Responsiveness" },
};

/** 评分维度显示名（key 与后端 scoring.DEFAULT_SCORE_WEIGHTS 一致，永不翻译）。 */
export function scoreDimensionLabel(key: string, locale: Locale): string {
  return SCORE_DIMENSION_LABELS[locale][key] ?? SCORE_DIMENSIONS.find((item) => item.key === key)?.label ?? key;
}

const SCORING_MODEL_LABELS: Record<Locale, Record<string, string>> = {
  zh: { custom_rule: "自定义规则模式", ml: "机器学习打分模式" },
  en: { custom_rule: "Custom rule set", ml: "Machine-learning scoring" },
};

/** 打分模型显示名（value = custom_rule / ml，原样提交给后端）。 */
export function scoringModelLabel(value: string, locale: Locale): string {
  return SCORING_MODEL_LABELS[locale][value] ?? SCORING_MODEL_OPTIONS.find((item) => item.value === value)?.label ?? value;
}
