import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Building2,
  ClipboardCheck,
  FileBadge2,
  Handshake,
  LineChart,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ProductFilm } from "@/components/product-film";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getI18n } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/types";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return {
    title: d.common.meta.defaultTitle,
    description: d.common.meta.description,
    alternates: { canonical: "/" },
  };
}

/** 三步流程的图标。文案随语言变，图标不变，所以图标留在代码里、只把文字放进词典。 */
const flowIcons = [Bot, ShieldCheck, Handshake];

/** 四张能力卡的图标，与词典里 capability.items 的顺序一一对应。 */
const capabilityIcons = [ClipboardCheck, LineChart, FileBadge2, BadgeCheck];

export default async function LandingPage() {
  const { d } = await getI18n();
  const t = d.home;

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-30 bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-3 min-[360px]:px-4 sm:gap-6 sm:px-6">
          {/* shrink-0 + nowrap：窄屏上品牌名会被 flex 压到换行（「链谈」上一行、「Agent」下一行），
              这是最不该动的元素，宁可让右侧按钮先让位。 */}
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <BrandMark />
            <span className="whitespace-nowrap text-lg font-bold tracking-tight">
              {d.common.brand.name} <span className="text-[var(--accent-strong)]">{d.common.brand.suffix}</span>
            </span>
          </Link>
          <nav className="ml-4 hidden items-center gap-6 text-sm text-[var(--muted)] md:flex">
            <a className="transition-colors hover:text-[var(--ink)]" href="#flow">{t.nav.flow}</a>
            <a className="transition-colors hover:text-[var(--ink)]" href="#capability">{t.nav.capability}</a>
            <a className="transition-colors hover:text-[var(--ink)]" href="#supplier">{t.nav.supplier}</a>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* 顶栏右侧分两层：
                业务动作（供应商入口 → 商家登录）保持原有次序与位置，
                语言切换是站点级工具，放到最外侧的角落里、并用一条细分割线与动作分开，
                避免和「登录 / 供货」这类动作混成一组被误点。
                语言按钮在 <lg 时是「地球 + 目标语言」的单按钮（分段控件只在桌面出现），
                省下的宽度正好让供应商快捷入口从 460px 起就留在顶栏（原来要 560px）；
                768–1023px 这一档顶栏最挤，而导航里本来就有「供应商入口」，这一段先让位；
                ≥1024px 桌面端空间充裕，快捷入口照旧显示（与改造前的观感一致）。
                460px 是实测出来的：英文界面下「品牌 + 语言 + Supplier + Sign in」正好 451px，
                再窄就得让整页被手机缩小，那比少一个快捷入口更糟；正文与页脚始终留有入口。 */}
            <Link href="/supplier/login" className="hidden min-[460px]:block md:hidden lg:block">
              <Button variant="ghost" size="sm">{t.header.supplierEntry}</Button>
            </Link>
            <Link href="/login">
              <Button variant="accent" size="sm">{t.header.merchantLogin}</Button>
            </Link>
            <LanguageSwitcher className="sm:ml-0.5 sm:border-l sm:border-[var(--line)] sm:pl-2.5" />
          </div>
        </div>
      </header>

      {/* Hero —— 左栏文案按 60ms 逐项入场，右栏是产品影片（首屏第二顺位出现） */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <div className="anim-rise inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]">
              <Sparkles className="size-3.5 text-[var(--accent-strong)]" />
              {t.hero.badge}
            </div>
            <h1 className="anim-rise anim-d1 mt-5 text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl">
              {t.hero.titleLead}
              <br />
              <span className="text-[var(--accent-strong)]">{t.hero.titleAccent}</span>
              {t.hero.titleTail}
            </h1>
            <p className="anim-rise anim-d2 mt-5 max-w-xl text-base leading-8 text-[var(--muted)]">
              {t.hero.body}
            </p>
            <p className="anim-rise anim-d3 mt-4 max-w-xl rounded-[var(--radius-control)] border-l-2 border-[var(--accent)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--ink)]">
              <span className="font-semibold">{t.hero.principleLabel}</span>
              {t.hero.principleLead}
              <span className="font-semibold text-[var(--accent-strong)]">{t.hero.principleStrong}</span>
              {t.hero.principleTail}
            </p>
            <div className="anim-rise anim-d4 mt-8 flex flex-wrap items-center gap-3">
              <Link href="/register">
                <Button variant="accent" size="lg">
                  {t.hero.primaryCta}
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg">{t.hero.secondaryCta}</Button>
              </Link>
            </div>
            <p className="anim-rise anim-d5 mt-4 text-xs text-[var(--muted)]">
              {t.hero.demoNote}
            </p>
          </div>

          <div className="anim-rise anim-d2">
            <ProductFilm />
          </div>
        </div>
      </section>

      {/* 工作流程 */}
      <section id="flow" className="scroll-mt-20 border-y border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.flow.title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
              {t.flow.body}
            </p>
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {t.flow.items.map((item, index) => {
              const Icon = flowIcons[index] ?? Bot;
              return (
                <Reveal key={item.step} delay={index * 80}>
                  <Card className="lift h-full">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <span className="grid size-10 place-items-center rounded-[var(--radius-control)] bg-[var(--accent-faint)] text-[var(--accent-strong)]">
                          <Icon className="size-5" />
                        </span>
                        <span className="tnum text-sm font-bold text-[var(--muted)]">{item.step}</span>
                      </div>
                      <h3 className="mt-5 font-bold">{item.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{item.body}</p>
                    </CardContent>
                  </Card>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* 产品能力 */}
      <section id="capability" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
        {/* 左栏是真实数据（七维权重），右栏是四张说明卡：给数据多留一点宽度，
            窄屏下 7 档权重的差异才读得出来——原来的 0.9/1.1 恰好把这个顺序搞反了。 */}
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
          <div>
            <Reveal>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.capability.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                {t.capability.body}
              </p>
            </Reveal>
            <Reveal delay={80}>
              <div className="mt-8 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
                <div className="text-xs font-semibold text-[var(--muted)]">{t.capability.weightsTitle}</div>
                <div className="mt-4 space-y-3">
                  {t.capability.dimensions.map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-sm">{item.label}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--paper-deep)]">
                        <span
                          className="block h-full rounded-full bg-[var(--accent)]"
                          style={{ width: `${(item.weight / 30) * 100}%` }}
                        />
                      </span>
                      <span className="tnum w-8 shrink-0 text-right text-sm font-semibold">{item.weight}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {t.capability.items.map((item, index) => {
              const Icon = capabilityIcons[index] ?? ClipboardCheck;
              return (
                <Reveal key={item.title} delay={index * 80}>
                  <Card className="lift h-full">
                    <CardContent className="p-5">
                      <span className="grid size-9 place-items-center rounded-[var(--radius-chip)] bg-[var(--paper)] text-[var(--accent-strong)]">
                        <Icon className="size-4.5" />
                      </span>
                      <h3 className="mt-4 text-sm font-bold">{item.title}</h3>
                      <p className="mt-2 text-xs leading-6 text-[var(--muted)]">{item.body}</p>
                    </CardContent>
                  </Card>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* 供应商入口 */}
      <section id="supplier" className="scroll-mt-20 border-y border-[var(--line)] bg-[var(--surface)]">
        <Reveal className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--ink)] text-white">
              <Building2 className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-tight">{t.supplier.title}</h2>
              <p className="mt-2 max-w-xl text-sm leading-7 text-[var(--muted)]">
                {t.supplier.body}
              </p>
            </div>
          </div>
          <Link href="/supplier/login" className="shrink-0">
            <Button variant="accent" size="lg">
              {t.supplier.cta}
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </Reveal>
      </section>

      {/* 页脚 */}
      <footer className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <span className="font-bold tracking-tight">
                {d.common.brand.name} <span className="text-[var(--accent-strong)]">{d.common.brand.suffix}</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-xs leading-6 text-[var(--muted)]">
              {t.footer.body}
            </p>
          </div>
          <div className="flex gap-12 text-sm">
            <div>
              <div className="font-semibold">{t.footer.productsTitle}</div>
              <div className="mt-3 space-y-2 text-[var(--muted)]">
                <Link className="block transition-colors hover:text-[var(--ink)]" href="/register">{t.footer.createAccount}</Link>
                <Link className="block transition-colors hover:text-[var(--ink)]" href="/login">{t.footer.merchantLogin}</Link>
                <Link className="block transition-colors hover:text-[var(--ink)]" href="/supplier/login">{t.footer.supplierLogin}</Link>
              </div>
            </div>
            <div>
              <div className="font-semibold">{t.footer.termsTitle}</div>
              <div className="mt-3 space-y-2 text-[var(--muted)]">
                <Link className="block transition-colors hover:text-[var(--ink)]" href="/terms">{t.footer.platformNotice}</Link>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-[var(--line)] pt-6 text-xs text-[var(--muted)] sm:flex-row sm:justify-between">
          <span>{format(t.footer.copyright, { year: new Date().getFullYear() })}</span>
          <span>{t.footer.pendingInfo}</span>
        </div>
      </footer>
    </div>
  );
}
