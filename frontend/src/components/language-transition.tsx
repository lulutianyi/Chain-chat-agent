"use client";

import { BrandMark } from "@/components/brand-mark";
import { LOCALE_FULL_NAMES, htmlLang, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dict";
import { format } from "@/lib/i18n/types";

/**
 * 语言切换的转接页。切换语言要重新渲染服务端内容，页面上又有大量数据与图表，
 * 这段时间里如果什么都不给，用户只会看到页面「卡住」再突然变成另一种语言。
 *
 * 因此这里给三样东西：一句说明（正在切到哪种语言）、一句预期管理（可能要几秒、
 * 期间别刷新）、一条不确定进度条（表示确实在跑，而不是死了）。
 *
 * 文案用**切换前**的语言书写：正在切到英文的用户，多半还读不懂英文。
 */
export function LanguageTransition({ from, to }: { from: Locale; to: Locale }) {
  const d = getDictionary(from);
  const target = LOCALE_FULL_NAMES[to];

  return (
    <div className="lang-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="ambient-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="lang-overlay-card anim-pop">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-bold tracking-tight" lang={htmlLang(from)}>
            {d.common.brand.name} <span className="text-[var(--accent-strong)]">{d.common.brand.suffix}</span>
          </span>
        </div>

        <div className="lang-overlay-bar mt-6" aria-hidden="true">
          <span />
        </div>

        <p className="mt-5 text-[15px] font-semibold" lang={htmlLang(from)}>
          {format(d.common.language.transitionTitle, { target })}
        </p>
        <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]" lang={htmlLang(from)}>
          {format(d.common.language.transitionBody, { target })}
        </p>
        <p className="mt-3 text-[11px] text-[var(--muted)]" lang={htmlLang(from)}>
          {format(d.common.language.transitionHint, { target })}
        </p>
      </div>
    </div>
  );
}
