"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LanguageTransition } from "@/components/language-transition";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, htmlLang, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./dict";
import { setActiveLocale } from "./locale-store";

interface LanguageContextValue {
  /** 当前界面语言。 */
  locale: Locale;
  /** 当前语言的词典。 */
  d: Dictionary;
  /** 是否正在切换语言（过渡层展示中）。 */
  switching: boolean;
  /** 切换语言：写 cookie → 立刻换本地文案 → 刷新服务端渲染的内容。 */
  setLocale: (next: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * 过渡层的最短展示时长。接口/服务端很快时，直接闪一下反而像页面抖了一下；
 * 400–600ms 是「看得出来发生了一次跳转、又不拖沓」的区间。
 */
const MIN_OVERLAY_MS = 560;

/**
 * 兜底时长：万一 refresh 的 pending 因为网络挂住一直不结束，
 * 也必须把过渡层收掉，不能把用户永远按在一块遮罩下面。
 */
const MAX_OVERLAY_MS = 12_000;

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [pendingSwitch, setPendingSwitch] = useState<{ from: Locale; to: Locale } | null>(null);
  const [pending, startTransition] = useTransition();
  const startedAt = useRef(0);

  // 服务端刷新完成后，以服务端读到的 cookie 为准（它才是权威值）。
  useEffect(() => {
    setLocaleState(initialLocale);
    setActiveLocale(initialLocale);
  }, [initialLocale]);

  const change = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      startedAt.current = Date.now();
      setPendingSwitch({ from: locale, to: next });
      // 本地文案立刻跟上：按钮、过渡层以外的界面文字不必等到服务端返回才变。
      setLocaleState(next);
      setActiveLocale(next);
      // 同一个 cookie 名：服务端 getLocale() 读的就是它。
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
      document.documentElement.lang = htmlLang(next);
      // router.refresh() 重新拉取服务端组件；包在 startTransition 里才能拿到 pending，
      // 也才不会把整棵树卸载重建（客户端状态、已填的表单都保留）。
      startTransition(() => {
        router.refresh();
      });
    },
    [locale, router],
  );

  // 服务端内容到位后收起过渡层，但至少展示 MIN_OVERLAY_MS。
  useEffect(() => {
    if (!pendingSwitch || pending) return;
    const wait = Math.max(0, MIN_OVERLAY_MS - (Date.now() - startedAt.current));
    const timer = setTimeout(() => setPendingSwitch(null), wait);
    return () => clearTimeout(timer);
  }, [pendingSwitch, pending]);

  // 兜底：无论 pending 是什么状态，到点就收。
  useEffect(() => {
    if (!pendingSwitch) return;
    const timer = setTimeout(() => setPendingSwitch(null), MAX_OVERLAY_MS);
    return () => clearTimeout(timer);
  }, [pendingSwitch]);

  // 过渡层展开时锁住滚动，避免用户在切换中途滚到半渲染的页面。
  useEffect(() => {
    if (!pendingSwitch) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [pendingSwitch]);

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, d: getDictionary(locale), switching: pendingSwitch !== null, setLocale: change }),
    [locale, pendingSwitch, change],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
      {pendingSwitch && <LanguageTransition from={pendingSwitch.from} to={pendingSwitch.to} />}
    </LanguageContext.Provider>
  );
}

const FALLBACK: LanguageContextValue = {
  locale: DEFAULT_LOCALE,
  d: getDictionary(DEFAULT_LOCALE),
  switching: false,
  setLocale: () => {
    /* 没有 Provider 时（例如组件被单独渲染）静默降级：宁可不切换，也不要抛错白屏。 */
  },
};

/** 客户端组件取语言与词典：const { locale, d } = useI18n(); */
export function useI18n(): LanguageContextValue {
  return useContext(LanguageContext) ?? FALLBACK;
}
