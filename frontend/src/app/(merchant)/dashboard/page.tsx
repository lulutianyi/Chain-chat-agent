"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  ChevronRight,
  Clock3,
  Info,
  PackageCheck,
  PackagePlus,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProductLibraryDrawer } from "@/components/product-library-drawer";
import { getDashboardSummary, type DashboardItem, type DashboardSummary } from "@/lib/api";
import { localeTag } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

type MetricKey = "today" | "ai" | "qualified" | "saved";
type SortKey = "recent" | "score" | "price" | "moq";
type RangeKey = "all" | "d7" | "d30" | "d90";

const PAGE_SIZE = 10;

const RANGES: { days: number; key: RangeKey }[] = [
  { days: 0, key: "all" },
  { days: 7, key: "d7" },
  { days: 30, key: "d30" },
  { days: 90, key: "d90" },
];

/** 排序项的 key 与词典 sorts 的键一一对应，展示名直接取词典。 */
const SORTS: SortKey[] = ["recent", "score", "price", "moq"];

const emptySummary: DashboardSummary = {
  today_received: 0, ai_active: 0, qualified: 0, minutes_saved: 0,
  items: [], range_days: 0, range_received: 0,
};

// 中文语境下不用 0h 30m 这类英文单位；不足 1 小时只显示分钟。
// 单位写法随语言变化，由调用方把词典里的 duration 传进来。
function formatMinutes(minutes: number, units: { minutes: string; hours: string; hoursMinutes: string }): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return format(units.minutes, { n: total });
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest
    ? format(units.hoursMinutes, { h: hours, m: rest })
    : format(units.hours, { n: hours });
}

function matchesMetric(item: DashboardItem, metric: MetricKey): boolean {
  if (metric === "today") return item.is_today;
  if (metric === "ai") return item.status === "ai_active";
  if (metric === "qualified") return item.classification === "qualified";
  return true;
}

export default function DashboardPage() {
  const { locale, d } = useI18n();
  const t = d.merchant.dashboard;
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [online, setOnline] = useState(true);
  const [metric, setMetric] = useState<MetricKey>("today");
  const [days, setDays] = useState(0);
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);
  const [showCostBasis, setShowCostBasis] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);

  const refresh = useCallback(async (rangeDays: number) => {
    try {
      setSummary(await getDashboardSummary(rangeDays));
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => { void refresh(days); }, [refresh, days]);
  // 切换口径或指标后回到第一页，避免停在空白页。
  useEffect(() => { setPage(1); }, [metric, days, sort]);

  function statusLabel(item: DashboardItem): string {
    if (item.status === "ai_active") return t.status.aiActive;
    if (item.classification === "qualified") return t.status.qualified;
    if (item.status === "human_active") return t.status.humanActive;
    return t.status.closed;
  }

  const metrics = [
    { key: "today" as const, label: t.metrics.today, value: String(summary.today_received), note: t.metrics.todayNote, icon: UsersRound },
    { key: "ai" as const, label: t.metrics.ai, value: String(summary.ai_active), note: t.metrics.aiNote, icon: Bot },
    { key: "qualified" as const, label: t.metrics.qualified, value: String(summary.qualified), note: t.metrics.qualifiedNote, icon: PackageCheck },
    { key: "saved" as const, label: t.metrics.saved, value: formatMinutes(summary.minutes_saved, t.duration), note: t.metrics.savedNote, icon: Clock3 },
  ];
  const selectedMetric = metrics.find((item) => item.key === metric)!;

  const visibleItems = useMemo(() => {
    const filtered = summary.items.filter((item) => matchesMetric(item, metric));
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "score") return b.score - a.score;
      if (sort === "price") return a.price - b.price;
      if (sort === "moq") return a.moq - b.moq;
      return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
    });
    return sorted;
  }, [summary.items, metric, sort]);

  const pageCount = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedItems = visibleItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // 评分分布：用当前口径下的真实评分画直方图，不编造趋势数据。
  const scoreBuckets = useMemo(() => {
    const buckets = [
      { label: "0-59", min: 0, max: 59, count: 0 },
      { label: "60-69", min: 60, max: 69, count: 0 },
      { label: "70-79", min: 70, max: 79, count: 0 },
      { label: "80-89", min: 80, max: 89, count: 0 },
      { label: "90-100", min: 90, max: 100, count: 0 },
    ];
    for (const item of summary.items) {
      const bucket = buckets.find((b) => item.score >= b.min && item.score <= b.max);
      if (bucket) bucket.count += 1;
    }
    return buckets;
  }, [summary.items]);
  const maxBucket = Math.max(1, ...scoreBuckets.map((b) => b.count));
  const rangeLabel = t.ranges[RANGES.find((r) => r.days === days)?.key ?? "all"];

  return (
    <div className="animate-rise space-y-6">
      {/* 页头 */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--accent-strong)]">
            <span className="h-px w-5 bg-[var(--accent)]" />
            {t.eyebrow}
          </div>
          <h1 className="text-[28px] font-bold tracking-tight">{t.title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {t.rangeLabel}<span className="font-semibold text-[var(--ink)]">{rangeLabel}</span>
            {format(t.rangeNote, { count: summary.range_received })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] p-1">
            {RANGES.map((item) => (
              <button
                key={item.days}
                type="button"
                onClick={() => setDays(item.days)}
                className={cn(
                  "rounded-[var(--radius-chip)] px-2.5 py-1.5 text-xs font-semibold transition",
                  days === item.days ? "bg-[var(--ink)] text-white" : "text-[var(--muted)] hover:text-[var(--ink)]",
                )}
              >
                {t.ranges[item.key]}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={() => void refresh(days)}>
            <RefreshCw className="size-4" />
            {t.refresh}
          </Button>
          <Button variant="accent" onClick={() => setProductsOpen(true)}>
            <PackagePlus className="size-4" />
            {t.manageProducts}
          </Button>
        </div>
      </section>

      {!online && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--warning)]/20 bg-[var(--warning-faint)] px-4 py-3 text-sm text-[var(--warning)]">
          <span>{t.offline}</span>
          <Button size="sm" variant="outline" onClick={() => void refresh(days)}>
            <RefreshCw className="size-3.5" />
            {d.common.actions.retry}
          </Button>
        </div>
      )}

      {/* 指标卡 */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item, index) => (
          <button key={item.key} onClick={() => setMetric(item.key)} className="text-left">
            <Card className={cn("h-full transition hover:-translate-y-0.5", metric === item.key && "border-[var(--accent)] ring-2 ring-[var(--accent-faint)]")}>
              <CardContent className="p-5">
                <item.icon className={cn("size-5", index === 2 ? "text-[var(--success)]" : "text-[var(--accent)]")} />
                <div className="tnum mt-5 text-3xl font-bold">{item.value}</div>
                <div className="mt-1 text-sm font-semibold">{item.label}</div>
                <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted)]">
                  <span>{item.note}</span>
                  <ChevronRight className="size-4" />
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* 明细 */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-bold">{format(t.detailTitle, { label: selectedMetric.label })}</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {format(t.detailSummary, { count: visibleItems.length, sort: t.sorts[sort] })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-[var(--radius-control)] border border-[var(--line)] p-0.5">
                {SORTS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setSort(item)}
                    className={cn(
                      "rounded-[var(--radius-chip)] px-2 py-1 text-[11px] font-semibold transition",
                      sort === item ? "bg-[var(--paper-deep)] text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]",
                    )}
                  >
                    {t.sorts[item]}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {metric === "saved" && (
              <div className="mb-4 rounded-[var(--radius-control)] bg-[var(--paper)] p-4 text-xs leading-5 text-[var(--muted)]">
                {format(t.savedBasis, { count: summary.items.length })}
              </div>
            )}

            {pagedItems.length ? (
              <>
                <div className="divide-y divide-[var(--line)]">
                  {pagedItems.map((item) => (
                    <div key={item.id} className="grid gap-3 py-4 sm:grid-cols-[1.3fr_1fr_.55fr_.8fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{item.supplier}</div>
                        <div className="truncate text-xs text-[var(--muted)]">{item.product}</div>
                      </div>
                      <div className="tnum text-sm">{format(t.row.priceMoq, { price: item.price, moq: item.moq })}</div>
                      <div className="tnum text-sm font-bold">{format(t.row.score, { score: item.score })}</div>
                      <div className="flex flex-col gap-1">
                        <Badge className="w-fit">{statusLabel(item)}</Badge>
                        <span className="tnum text-[11px] text-[var(--muted)]">
                          {new Date(item.created_at).toLocaleDateString(localeTag(locale))}
                        </span>
                      </div>
                      <Link
                        href={`/negotiate?id=${item.id}`}
                        aria-label={format(t.row.openAria, { supplier: item.supplier })}
                        className="grid size-8 place-items-center rounded-[var(--radius-chip)] border border-[var(--line)] transition hover:border-[var(--ink)]"
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </div>
                  ))}
                </div>
                {pageCount > 1 && (
                  <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
                    <span className="tnum">{format(t.pagination.page, { page: currentPage, total: pageCount })}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                        {t.pagination.previous}
                      </Button>
                      <Button size="sm" variant="outline" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                        {t.pagination.next}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-10 text-center text-sm text-[var(--muted)]">
                <p>{t.empty.title}</p>
                {summary.items.length > 0 && (
                  <p className="mt-2 text-xs">
                    {format(t.empty.hint, { count: summary.items.length })}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {days !== 0 && (
                    <Button size="sm" variant="outline" onClick={() => setDays(0)}>{t.empty.switchAll}</Button>
                  )}
                  {metric !== "saved" && summary.items.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setMetric("saved")}>{t.empty.viewAll}</Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 评分分布 + 口径说明 */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <h2 className="font-bold">{t.distribution.title}</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {format(t.distribution.note, { count: summary.items.length })}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {scoreBuckets.map((bucket) => (
                <div key={bucket.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="tnum text-[var(--muted)]">{format(t.distribution.bucket, { label: bucket.label })}</span>
                    <span className="tnum font-semibold">{format(t.distribution.count, { count: bucket.count })}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--paper-deep)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${(bucket.count / maxBucket) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {!summary.items.length && (
                <p className="py-6 text-center text-xs text-[var(--muted)]">{t.distribution.empty}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-1.5">
                <Info className="size-4 text-[var(--accent)]" />
                <h2 className="font-bold">{t.basis.title}</h2>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs leading-6 text-[var(--muted)]">
              <p>
                {t.basis.lead}
                <span className="font-semibold text-[var(--ink)]">{rangeLabel}</span>
                {t.basis.tail}
              </p>
              <button
                type="button"
                onClick={() => setShowCostBasis((v) => !v)}
                aria-expanded={showCostBasis}
                className="font-semibold text-[var(--accent-strong)] underline underline-offset-2"
              >
                {showCostBasis ? t.basis.hide : t.basis.show}
              </button>
              {showCostBasis && (
                <div className="rounded-[var(--radius-control)] bg-[var(--paper)] p-3 leading-6">
                  {t.basis.intakeLead}<span className="tnum font-semibold text-[var(--ink)]">{t.basis.intake}</span>
                  {t.basis.replyLead}<span className="tnum font-semibold text-[var(--ink)]">{t.basis.reply}</span>
                  {t.basis.beforeCount}{summary.range_received}{t.basis.afterCount}
                  <span className="tnum font-semibold text-[var(--ink)]">{formatMinutes(summary.minutes_saved, t.duration)}</span>
                  {t.basis.note}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {productsOpen && (
        <ProductLibraryDrawer
          onClose={() => setProductsOpen(false)}
          onChanged={() => void refresh(days)}
        />
      )}
    </div>
  );
}
