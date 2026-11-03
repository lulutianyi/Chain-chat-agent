/**
 * 全站语言的唯一来源。
 *
 * 语言存在 cookie 里而不是 URL 里：本站的路由（工作台、洽谈、测评、供应商端）
 * 都已经带着各自的查询参数（`?id=`、`?product=`），再把语言塞进路径会让
 * 每一条链接都要拼语言前缀，改动面远大于收益。cookie 的代价是整站因此变成
 * 动态渲染（服务端要读 cookie 决定 <html lang> 与首屏文案），对本站这种
 * 「打开就要拉数据」的应用没有实际损失。
 */

export const LOCALES = ["zh", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** 默认语言，也是读不到 cookie 时的回退语言。 */
export const DEFAULT_LOCALE: Locale = "zh";

/** cookie 名。带前缀避免和其他站点/其他功能的自定义 cookie 撞名。 */
export const LOCALE_COOKIE = "liantan_lang";

/** 一年。语言是长期偏好，不该每次访问都重问一遍。 */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** 把任意输入收敛成一个合法语言：非法值一律回退，不抛错。 */
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** <html lang> 用的写法。中文必须带地区，否则浏览器会把简体中文按日文规则换行。 */
export function htmlLang(locale: Locale): string {
  return locale === "en" ? "en" : "zh-CN";
}

/** 切换按钮上两个选项的短标签。两种语言都用自己的写法，不做翻译。 */
export const LOCALE_LABELS: Record<Locale, string> = { zh: "中文", en: "EN" };

/** 说明性文案里提到目标语言时用的全称（「正在切换到 English 界面…」）。 */
export const LOCALE_FULL_NAMES: Record<Locale, string> = { zh: "中文", en: "English" };

/** 解析日期/数字时用的 BCP 47 标记。 */
export function localeTag(locale: Locale): string {
  return locale === "en" ? "en-US" : "zh-CN";
}
