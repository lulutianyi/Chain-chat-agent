import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale, type Locale } from "./config";

/**
 * 非 React 模块（api.ts、stream.ts 这类纯函数）取当前语言的地方。
 *
 * 为什么不在这些模块里直接读 document.cookie：读 cookie 是每次调用都要解析
 * 一整条字符串，而且 SSR 阶段没有 document。改成一个进程内的当前值，由
 * LanguageProvider 在挂载与切换时写入；万一没人写（例如服务端预渲染），
 * 再从 cookie/默认语言兜底。
 */
let active: Locale | null = null;

export function setActiveLocale(locale: Locale): void {
  active = locale;
}

export function getActiveLocale(): Locale {
  if (active) return active;
  if (typeof document !== "undefined") {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`));
    if (match) {
      active = resolveLocale(decodeURIComponent(match[1]));
      return active;
    }
  }
  return DEFAULT_LOCALE;
}
