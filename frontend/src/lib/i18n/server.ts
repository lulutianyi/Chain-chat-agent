import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./dict";

/**
 * 服务端读语言。cookie 是唯一来源——它同时也是客户端切换时写入的那一份，
 * 因此「按钮上显示的语言」与「页面渲染出来的语言」永远出自同一个值。
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}

/** 服务端组件取词典的标准姿势：const { locale, d } = await getI18n(); */
export async function getI18n(): Promise<{ locale: Locale; d: Dictionary }> {
  const locale = await getLocale();
  return { locale, d: getDictionary(locale) };
}
