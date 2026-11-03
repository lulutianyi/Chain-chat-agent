/**
 * 品牌色的唯一来源。
 *
 * 为什么这里还是字面量：Next 的 metadata API（viewport.themeColor）与
 * manifest.ts 只接受字符串常量，无法引用 CSS 变量。
 * 因此把值集中在这里，并在下方注明必须与 globals.css 的令牌保持一致，
 * 避免两个文件各写一份、改一处漏一处。
 *
 * 对应 globals.css:
 *   --color-accent: #3b82f6
 *   --color-paper:  #e8edf5
 */
export const BRAND_COLORS = {
  accent: "#3b82f6",
  paper: "#e8edf5",
} as const;
