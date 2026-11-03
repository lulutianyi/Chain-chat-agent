"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/client";

/**
 * 三个认证页共用的外壳：左边品牌区，右边表单区。
 *
 * 品牌区为什么放「采购底线样张」而不是插画或截图：
 *   这个产品最独有、最难被抄的东西就是「规则写在明面上」。放一张插画，用户读完
 *   仍然不知道它是干什么的；放一张真实形态的底线表，用户在第一屏就明白了它的
 *   工作方式——而且这张表不需要插画师，纯排版就成立，跟整站「文档化」的气质一致。
 *
 * 窄屏：品牌区整体收起（只留一行品牌条），表单优先占满首屏——
 *   认证页的第一要务是让人把表填完，不是看宣传。
 *
 * 因为三个认证页本身都是客户端组件（表单状态只能留在客户端），它们直接 import 的
 * 这个外壳也就落在客户端那一侧，所以文案用 useI18n 取，而不是服务端 getI18n——
 * 客户端组件无法 import 服务端组件，那样会把 next/headers 带进浏览器包。
 */

/**
 * 底线样张里带「硬性」徽章的那一行。徽章的有无属于表格结构而不是文案
 * （和首页「图标留在代码里、只把文字放进词典」是同一个处理），所以不随语言走。
 */
const HARD_RULE_INDEX = 1;

export function AuthLayout({
  asideTitle,
  asideBody,
  children,
}: {
  asideTitle: string;
  asideBody: string;
  children: React.ReactNode;
}) {
  const { d } = useI18n();
  const t = d.auth.layout;

  return (
    <div className="relative min-h-screen bg-[var(--paper)]">
      <div className="ambient-grid anim-fade pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16 lg:px-6 lg:py-14 xl:gap-20">
        {/* 品牌区（≥lg 才出现） */}
        <section className="hidden lg:block">
          <Link href="/" className="anim-rise inline-flex items-center gap-3">
            <BrandMark />
            <span className="text-lg font-bold tracking-tight">
              {d.common.brand.name} <span className="text-[var(--accent-strong)]">{d.common.brand.suffix}</span>
            </span>
          </Link>

          <h1 className="anim-rise anim-d1 mt-8 text-[32px] font-bold leading-[1.25] tracking-tight">{asideTitle}</h1>
          <p className="anim-rise anim-d2 mt-4 max-w-lg text-sm leading-7 text-[var(--muted)]">{asideBody}</p>

          <div className="anim-rise anim-d3 mt-8 max-w-lg overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
              <span className="text-xs font-semibold text-[var(--muted)]">{t.rulesTitle}</span>
              <span className="text-[11px] text-[var(--muted)]">{t.rulesScope}</span>
            </div>
            <dl className="divide-y divide-[var(--line)]">
              {t.rules.map((rule, index) => (
                <div key={rule.label} className="flex items-center justify-between px-5 py-2.5">
                  <dt className="flex items-center gap-2 text-sm text-[var(--muted)]">
                    {rule.label}
                    {index === HARD_RULE_INDEX && (
                      <span className="rounded-full bg-[var(--accent-faint)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-strong)]">
                        {t.hardBadge}
                      </span>
                    )}
                  </dt>
                  <dd className="tnum text-sm font-semibold">{rule.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="anim-rise anim-d4 mt-4 max-w-lg text-xs leading-6 text-[var(--muted)]">
            {t.rulesNote}
          </p>
        </section>

        {/* 表单区 */}
        <main className="relative w-full">
          {/* 桌面端语言切换：绝对定位在表单卡上方，不进网格流，因此不改变既有的
              居中与间距（表单卡本身的高度决定这一列的高度）。 */}
          <div className="absolute -top-10 right-0 hidden lg:block">
            <LanguageSwitcher />
          </div>

          {/* 窄屏品牌条：品牌区收起后，这里承担「这是哪、怎么回去」 */}
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <Link href="/" className="flex items-center gap-2.5">
              <BrandMark />
              <span className="font-bold tracking-tight">
                {d.common.brand.name} <span className="text-[var(--accent-strong)]">{d.common.brand.suffix}</span>
              </span>
            </Link>
            {/* 语言切换与「返回首页」并排放在右侧：切换是全局偏好，窄屏上也不该被藏起来。
                420px 以下收起「返回首页」文字链——加上语言切换后，更窄的屏幕（375/360/320px）
                放不下三个控件，硬塞会把品牌名挤到换行（英文品牌名更长，最先出问题）。
                它与左侧品牌名指向同一个首页，所以窄屏仍有一条明确的回家路径。 */}
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <Link
                href="/"
                className="hidden whitespace-nowrap text-xs font-semibold text-[var(--muted)] transition-colors hover:text-[var(--ink)] min-[420px]:inline"
              >
                {d.common.actions.backHome}
              </Link>
            </div>
          </div>

          <div className="anim-slide-right overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
