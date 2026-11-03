// 商家必备资质与供应商资质勾选共用同一组选项，保证两端判断口径一致。
export const QUALIFICATION_OPTIONS = ["营业执照", "质检报告", "可开发票"];

// 开发调试能力总开关（免登录调试入口、模拟供应商视角、管理员令牌兜底）。
// 由构建期环境变量控制，公开部署不设置即为关闭；开启方式见 .env.example。
export const DEBUG_TOOLS_ENABLED = process.env.NEXT_PUBLIC_SHOW_DEBUG_ENTRY === "true";

// 打分模型：custom_rule = 自定义规则（七维满分权重），ml = 机器学习打分。
export const SCORING_MODEL_OPTIONS = [
  { value: "custom_rule", label: "自定义规则模式" },
  { value: "ml", label: "机器学习打分模式" },
] as const;

// 百分制打分的七个维度，顺序与默认满分与后端 scoring.DEFAULT_SCORE_WEIGHTS 一致。
export const SCORE_DIMENSIONS = [
  { key: "price", label: "价格", default: 30 },
  { key: "moq", label: "起订量", default: 15 },
  { key: "qualification", label: "资质", default: 20 },
  { key: "delivery", label: "交期", default: 10 },
  { key: "payment", label: "账期", default: 10 },
  { key: "region", label: "区域", default: 5 },
  { key: "cooperation", label: "配合度", default: 10 },
] as const;

export const DEFAULT_SCORE_WEIGHTS: Record<string, number> = Object.fromEntries(
  SCORE_DIMENSIONS.map((item) => [item.key, item.default]),
);
