"use client";

import { Languages } from "lucide-react";
import { LOCALE_FULL_NAMES, LOCALE_LABELS, LOCALES, htmlLang, type Locale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

/**
 * 中英语言切换按钮。
 *
 * 形态随宽度切换（纯 CSS，不用 JS 判断，避免首帧闪一下）：
 *   ≥lg(1024px)：分段控件「中文 | EN」+ 地球图标，当前语言高亮，一眼看出现在是什么、还能切到什么。
 *   <lg：收成一个按钮：地球图标 + **要切过去的那个语言**（中文界面显示 EN，英文界面显示 中文）。
 *   <360px：连那个短标签都拿下，只留地球图标，名称交给 aria-label / title。
 *
 * 为什么窄屏要收：它省下的 30–50px 正是「我是供应商」快捷入口能不能留在顶栏的关键。
 * 顶栏是每屏都占位置的常驻区域，工具型控件不该按桌面尺寸占宽度；
 * 而且单按钮形态给的是「点一下会发生什么」（目标语言），比展示当前语言更可操作。
 *
 * 视觉沿用站点既有令牌：外框 --line、底 --surface、选中态 --accent-strong
 * （与 Button 的 accent 变体同色，白字 5.17:1 达标）。
 *
 * 切换期间禁用：过渡层已经在跑，中途再点只会让 cookie 与正在加载的内容对不上。
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, d, switching, setLocale } = useI18n();
  const target: Locale = locale === "en" ? "zh" : "en";
  const switchTo = format(d.common.language.switchTo, { target: LOCALE_FULL_NAMES[target] });

  const shell = cn(
    "flex shrink-0 items-center gap-0.5 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] p-0.5",
    className,
  );
  const segment = "h-6 rounded-[calc(var(--radius-control)-3px)] px-1.5 text-[11px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1";
  const idle = "text-[var(--muted)] hover:bg-[var(--paper)] hover:text-[var(--ink)]";
  const active = "bg-[var(--accent-strong)] text-white";

  return (
    <div role="group" aria-label={d.common.language.label} className={shell}>
      {/* <lg：单个按钮，标签是目标语言 */}
      <button
        type="button"
        lang={htmlLang(target)}
        aria-label={switchTo}
        title={switchTo}
        disabled={switching}
        onClick={() => setLocale(target)}
        className={cn(segment, idle, "lg:hidden", switching && "cursor-default opacity-60")}
      >
        <Languages className="size-3.5 min-[360px]:hidden" aria-hidden="true" />
        <span className="hidden min-[360px]:inline">{LOCALE_LABELS[target]}</span>
      </button>

      {/* ≥lg：分段控件 */}
      <div className="hidden items-center gap-0.5 lg:flex">
        {LOCALES.map((option: Locale) => {
          const isActive = option === locale;
          return (
            <button
              key={option}
              type="button"
              lang={htmlLang(option)}
              aria-pressed={isActive}
              disabled={switching}
              title={format(d.common.language.switchTo, { target: LOCALE_FULL_NAMES[option] })}
              onClick={() => setLocale(option)}
              className={cn(segment, isActive ? active : idle, switching && "cursor-default opacity-60")}
            >
              {LOCALE_LABELS[option]}
            </button>
          );
        })}
      </div>

      {/* 桌面端补一个地球图标：分段控件旁边的「这里是语言」提示。
          窄屏没有它的位置——图标省下来正好让给业务入口。 */}
      <Languages className="mx-1 hidden size-3.5 text-[var(--muted)] lg:block" aria-hidden="true" />
    </div>
  );
}
