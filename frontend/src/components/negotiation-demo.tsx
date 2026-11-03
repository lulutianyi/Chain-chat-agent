"use client";

import * as React from "react";
import { BadgeCheck, Bell, Bot, Check, CircleCheck, FileBadge2, Handshake, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import { getDictionary, type Dictionary } from "@/lib/i18n/dict";
import { format } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

/* ============================================================================
 * 首页产品影片（1280×960 定尺舞台）
 * ——
 * 为什么是一段「时间的纯函数」而不是几张手绘截图：
 *   1. 首页要放动态演示，而视频必须能逐帧录制，所以每一帧都得能被时间唯一确定。
 *      本文件里**没有一处 CSS 动画 / transition**——位移、透明度、进度条、数字
 *      全部由 time 算出。同一个 time 永远得到同一帧，录制才可复现、才能重跑。
 *   2. 同一个组件既是影片的源，也能在任意时刻定格成静态帧（减少动态效果用户的
 *      降级画面就是从这里取的），两者不会随改动而漂移。
 *
 * 影片讲什么（严格照产品的真实决策链路，不编造产品做不到的事）：
 *   01 自动接待 → 02 底线校验全部通过 → 03 首次评分 62 未达阈值，AI 继续议价
 *   → 供应商让步后**重新校验**，62 → 86 达标 → 04 分层转人工
 *   注意：硬性底线一旦触碰是「立即礼貌结束」而不是继续谈，所以这里不能为了
 *   戏剧性演「报价超上限还被压价成功」——那会宣传一个产品并不具备的行为。
 * ============================================================================ */

/** 影片时长（秒）。改这里要同步 build-demo-video.mjs 的 --poster-at。 */
export const DEMO_SECONDS = 16.2;

/** 五幕的起点（秒）：顶部进度轨、场景位移、脚本取帧共用这一份时间轴。 */
const SCENE = { reception: 0, bottomline: 2.8, scoring: 6.6, recheck: 10, handoff: 13.2 } as const;

/** 三幕进度轨：步骤号本身是数字，留在代码里；标签取词典（dict/film.ts 的 rail）。 */
const RAIL = [
  { step: "01", key: "reception" },
  { step: "02", key: "bottomline" },
  { step: "03", key: "handoff" },
] as const;

/**
 * 供应商首次提交的条款：金额、件数、天数全是数字，一律留在代码里；单位取自词典。
 * 底线阈值与让步后的条款也放在这里，让「哪几项变了」只有一个来源。
 */
const FIRST_TERMS = { price: "¥42.50", moq: 800, leadTime: 12, payment: 30 } as const;

/** 商家的硬性底线：与首页「采购底线可配置」一一对应，任一触线即当场说明。 */
const LIMITS = { price: "¥43.00", moq: 1000, leadTime: 15, payment: 30 } as const;

/** 供应商让步后的条款：价格、起订量、账期三项的变化正是重新校验的输入。 */
const CONCEDED = { price: "¥41.80", moq: 500, payment: 45 } as const;

/** 报价单的四栏。key 取词典 terms，unit 取词典 units。 */
const QUOTE = [
  { key: "quote", value: FIRST_TERMS.price, unit: "perPiece" },
  { key: "moq", value: String(FIRST_TERMS.moq), unit: "pieces" },
  { key: "leadTime", value: String(FIRST_TERMS.leadTime), unit: "days" },
  { key: "payment", value: String(FIRST_TERMS.payment), unit: "days" },
] as const;

/**
 * 七维加权：low 是首次评分（合计 62，未达阈值），high 是供应商让步后重算的分
 * （合计 86，达标）。两组都必须等于大屏总分，否则影片自己就打脸「评分口径透明」。
 * 议价谈的是起订量、账期与价格——哪几维变了一目了然。
 */
const DIMENSIONS = [
  { key: "price", low: 20, high: 27, max: 30 },
  { key: "moq", low: 7, high: 13, max: 15 },
  { key: "credentials", low: 20, high: 20, max: 20 },
  { key: "leadTime", low: 6, high: 8, max: 10 },
  { key: "payment", low: 4, high: 8, max: 10 },
  { key: "region", low: 2, high: 3, max: 5 },
  { key: "responsiveness", low: 3, high: 7, max: 10 },
] as const;
const SCORE_LOW = DIMENSIONS.reduce((sum, item) => sum + item.low, 0);
const SCORE_HIGH = DIMENSIONS.reduce((sum, item) => sum + item.high, 0);
const THRESHOLD = 80;

/** 影片每一幕都要词典；类型取自聚合后的总表，键写错在 tsc 阶段就会报错。 */
type FilmDict = Dictionary["film"];

interface SceneProps {
  time: number;
  d: FilmDict;
}

/**
 * 底线核验的五行的「规则 + 实际值」。数字留在代码里，字段名、规则与单位取自词典，
 * 规则里的 {limit} 在这里填空——词典因此不含任何数字，改阈值也只有一处要改。
 */
function bottomLines(d: FilmDict) {
  const u = d.units;
  const r = d.bottomline.rules;
  return [
    { key: "quote", value: FIRST_TERMS.price, rule: format(r.quote, { limit: LIMITS.price }) },
    { key: "moq", value: `${FIRST_TERMS.moq} ${u.pieces}`, rule: format(r.moq, { limit: `${LIMITS.moq} ${u.pieces}` }) },
    { key: "leadTime", value: `${FIRST_TERMS.leadTime} ${u.days}`, rule: format(r.leadTime, { limit: `${LIMITS.leadTime} ${u.days}` }) },
    { key: "payment", value: `${FIRST_TERMS.payment} ${u.days}`, rule: format(r.payment, { limit: `${LIMITS.payment} ${u.days}` }) },
    { key: "credentials", value: d.bottomline.verified, rule: r.credentials },
  ] as const;
}

/** 让步后变化的三个字段：左值来自首次条款，右值来自让步条款。 */
function deltas(d: FilmDict) {
  const u = d.units;
  return [
    { key: "quote", from: FIRST_TERMS.price, to: CONCEDED.price },
    { key: "moq", from: `${FIRST_TERMS.moq} ${u.pieces}`, to: `${CONCEDED.moq} ${u.pieces}` },
    { key: "payment", from: `${FIRST_TERMS.payment} ${u.days}`, to: `${CONCEDED.payment} ${u.days}` },
  ] as const;
}

/* ------------------------------ 时间工具 ------------------------------ */

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/** 分段进度：把绝对时间切成「第 X 秒到第 Y 秒之间从 0 走到 1」，越界即夹住。 */
function seg(time: number, start: number, end: number, ease: (p: number) => number = easeOut) {
  if (end <= start) return time >= end ? 1 : 0;
  return ease(clamp01((time - start) / (end - start)));
}

/** 入场：12px 位移 + 淡入，与全站 rise 动效同一套手感。 */
function enter(progress: number, shift = 12): React.CSSProperties {
  return { opacity: progress, transform: `translateY(${(1 - progress) * shift}px)` };
}

/* ------------------------------ 零件 ------------------------------ */

function FilmBrandMark() {
  return (
    <span className="relative grid size-11 place-items-center rounded-[14px] bg-[var(--ink)]" aria-hidden="true">
      <span className="absolute left-[11px] top-[11px] size-[9px] rounded-full border-2 border-[var(--accent)]" />
      <span className="absolute bottom-[11px] right-[11px] size-[9px] rounded-full border-2 border-white" />
      <span className="h-px w-5 rotate-45 bg-white/70" />
    </span>
  );
}

/** 三点「正在输入」。相位由 time 推导，因此录制时同样可复现。 */
function TypingDots({ time, tone }: { time: number; tone: "ink" | "accent" }) {
  return (
    <span className="inline-flex items-center gap-[7px]" aria-hidden="true">
      {[0, 1, 2].map((index) => {
        const wave = 0.5 + 0.5 * Math.sin((time * 5.2 - index * 0.75) * Math.PI);
        return (
          <span
            key={index}
            className="inline-block rounded-full"
            style={{
              width: 9,
              height: 9,
              background: tone === "ink" ? "var(--muted)" : "var(--accent)",
              opacity: 0.3 + 0.7 * wave,
              transform: `translateY(${-2.5 * wave}px)`,
            }}
          />
        );
      })}
    </span>
  );
}

/** 顶部进度轨：三幕的骨架，始终可见，让「现在讲到哪一步」一眼可读。 */
function Rail({ time, d }: SceneProps) {
  const active = time < SCENE.bottomline ? 0 : time < SCENE.handoff ? 1 : 2;
  const links = [
    seg(time, SCENE.bottomline - 0.6, SCENE.bottomline + 0.5),
    seg(time, SCENE.handoff - 0.6, SCENE.handoff + 0.5),
  ];

  return (
    <div className="flex items-center gap-5 border-b border-[var(--line)] px-12 py-6">
      {RAIL.map((item, index) => (
        <React.Fragment key={item.step}>
          {index > 0 && (
            <span className="relative h-px flex-1 bg-[var(--line)]">
              <span className="absolute inset-y-0 left-0 bg-[var(--accent)]" style={{ width: `${links[index - 1] * 100}%` }} />
            </span>
          )}
          <span className="flex items-center gap-3">
            <span
              className={cn(
                "tnum grid size-8 place-items-center rounded-full text-[15px] font-bold",
                index === active
                  ? "bg-[var(--accent)] text-white"
                  : index < active
                    ? "bg-[var(--accent-faint)] text-[var(--accent-strong)]"
                    : "bg-[var(--paper-deep)] text-[var(--muted)]",
              )}
            >
              {index < active ? <Check className="size-4" /> : item.step}
            </span>
            <span className={cn("text-[22px] font-semibold", index === active ? "text-[var(--ink)]" : "text-[var(--muted)]")}>
              {d.rail[item.key]}
            </span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

/** 供应商头像：方牌 + 一个字（英文用首字母），和产品里的会话列表同一形制。 */
function SupplierAvatar({ d }: { d: FilmDict }) {
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[var(--paper-deep)] text-[19px] font-bold text-[var(--ink-soft)]">
      {d.supplier.avatar}
    </span>
  );
}

/* ------------------------------ 第一幕：自动接待 ------------------------------ */

function ReceptionScene({ time, d }: SceneProps) {
  const greeting = seg(time, 0.35, 0.85);
  const quote = seg(time, 1.15, 1.65);
  const typing = time >= 1.95 && time < 2.4;
  const reply = seg(time, 2.4, 2.8);

  return (
    <div className="flex h-full flex-col px-12 py-8">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[30px] font-bold tracking-tight">{d.reception.title}</h3>
        <span className="text-[22px] text-[var(--muted)]">{d.reception.subtitle}</span>
      </div>

      <div className="mt-7 flex flex-1 flex-col gap-5">
        <div className="flex items-start gap-4" style={enter(greeting)}>
          <SupplierAvatar d={d} />
          <div className="max-w-[760px] rounded-[18px] rounded-tl-[6px] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
            <p className="text-[28px] leading-[1.5]">{format(d.reception.greeting, { name: d.supplier.name })}</p>
          </div>
        </div>

        {/* 条款结构化：报价不再只是聊天里的一句话，而是一组可校验的字段 */}
        <div className="ml-[60px] rounded-[18px] border border-[var(--line)] bg-[var(--paper)] p-6" style={enter(quote)}>
          <div className="mb-5 flex items-center justify-between">
            <span className="text-[20px] font-semibold text-[var(--muted)]">{d.reception.termsTitle}</span>
            <span className="rounded-full bg-[var(--paper-deep)] px-4 py-1.5 text-[19px] font-semibold text-[var(--ink-soft)]">
              {d.reception.termsPending}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {QUOTE.map((item) => (
              <div key={item.key}>
                <div className="text-[20px] text-[var(--muted)]">{d.terms[item.key]}</div>
                <div className="tnum mt-2 text-[36px] font-bold leading-none">
                  {item.value}
                  <span className="ml-1 text-[20px] font-normal text-[var(--muted)]">{d.units[item.unit]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto flex items-start justify-end gap-4">
          <div className="flex flex-col items-end gap-3">
            {typing && (
              <div className="rounded-[18px] rounded-tr-[6px] border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
                <TypingDots time={time} tone="ink" />
              </div>
            )}
            {reply > 0 && (
              <div
                className="max-w-[780px] rounded-[18px] rounded-tr-[6px] px-6 py-5 text-white"
                style={{ ...enter(reply), background: "var(--surface-inverse)" }}
              >
                <p className="text-[28px] leading-[1.5]">
                  {d.reception.reply}
                </p>
              </div>
            )}
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[var(--accent)] text-white">
            <Bot className="size-6" />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 第二幕：底线校验 ------------------------------ */

function BottomLineScene({ time, d }: SceneProps) {
  const head = seg(time, 2.9, 3.25);
  const summary = seg(time, 6.05, 6.4);
  const lines = bottomLines(d);

  return (
    <div className="flex h-full flex-col px-12 py-7">
      <div className="flex items-baseline justify-between" style={enter(head)}>
        <h3 className="flex items-center gap-3 text-[30px] font-bold tracking-tight">
          <ShieldCheck className="size-7 text-[var(--accent)]" />
          {d.bottomline.title}
        </h3>
        <span className="text-[22px] text-[var(--muted)]">{d.bottomline.subtitle}</span>
      </div>

      <div className="mt-5 flex flex-1 flex-col justify-center gap-2">
        {lines.map((line, index) => {
          const rowIn = seg(time, 3.05 + index * 0.1, 3.35 + index * 0.1);
          const tickAt = 3.35 + index * 0.44;
          const tick = seg(time, tickAt, tickAt + 0.3);
          const passed = tick > 0;
          return (
            <div
              key={line.key}
              className="flex items-center gap-5 rounded-[16px] border px-6 py-3"
              style={{
                ...enter(rowIn),
                borderColor: passed ? "color-mix(in srgb, var(--success) 28%, transparent)" : "var(--line)",
                background: passed ? "var(--success-faint)" : "var(--surface)",
              }}
            >
              <span
                className="grid size-11 shrink-0 place-items-center rounded-full"
                style={{
                  background: passed ? "var(--success)" : "var(--paper-deep)",
                  color: passed ? "#fff" : "var(--muted)",
                  transform: `scale(${0.86 + 0.14 * tick})`,
                }}
              >
                {passed ? <Check className="size-6" /> : <span className="text-[19px] font-bold">{index + 1}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[26px] font-bold leading-tight">{d.terms[line.key]}</span>
                <span className="mt-1 block text-[19px] leading-tight text-[var(--muted)]">{line.rule}</span>
              </span>
              <span
                className="tnum text-[28px] font-bold"
                style={{ color: passed ? "var(--success)" : "var(--muted)", opacity: 0.45 + 0.55 * tick }}
              >
                {line.value}
              </span>
            </div>
          );
        })}
      </div>

      <div
        className="mt-3 flex items-center gap-3 rounded-[16px] bg-[var(--success-faint)] px-6 py-3.5 text-[24px] font-semibold text-[var(--success)]"
        style={enter(summary, 8)}
      >
        <CircleCheck className="size-6" />
        {format(d.bottomline.summary, { count: lines.length })}
      </div>
    </div>
  );
}

/* ------------------------------ 第三幕：首次评分 62，未达阈值 ------------------------------ */

function ScoringScene({ time, d }: SceneProps) {
  const head = seg(time, 6.75, 7.1);
  const chip = seg(time, 9.3, 9.65);

  // 每一维各自填条，总分等于「当前已填出的分数之和」：
  // 条走到哪大数字就跟到哪，不会出现「条没填完总分先跳完」的假动画。
  const animated = DIMENSIONS.map((item, index) => item.low * seg(time, 6.9 + index * 0.3, 7.36 + index * 0.3));
  const total = Math.round(animated.reduce((sum, value) => sum + value, 0));

  return (
    <div className="flex h-full flex-col px-12 py-8">
      <div className="flex items-baseline justify-between" style={enter(head)}>
        <h3 className="flex items-center gap-3 text-[30px] font-bold tracking-tight">
          <Handshake className="size-7 text-[var(--accent)]" />
          {d.scoring.title}
        </h3>
        <span className="text-[22px] text-[var(--muted)]">{d.scoring.subtitle}</span>
      </div>

      <div className="mt-6 flex flex-1 gap-10">
        <div className="flex w-[300px] shrink-0 flex-col justify-center">
          <div className="text-[20px] text-[var(--muted)]">{d.scoring.supplierScore}</div>
          <div className="mt-2 flex items-end gap-3">
            <span className="tnum text-[132px] font-bold leading-[.9] tracking-tight">{total}</span>
            <span className="pb-3 text-[24px] text-[var(--muted)]">/ 100</span>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--paper-deep)]">
              <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${total}%` }} />
            </span>
            <span className="tnum text-[20px] text-[var(--muted)]">{format(d.scoring.threshold, { value: THRESHOLD })}</span>
          </div>
          <div
            className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-[var(--warning-faint)] px-4 py-2 text-[22px] font-semibold text-[var(--warning)]"
            style={enter(chip, 6)}
          >
            <TriangleAlert className="size-5" />
            {d.scoring.belowThreshold}
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-3.5">
          {DIMENSIONS.map((item, index) => {
            const start = 6.9 + index * 0.3;
            const fill = seg(time, start, start + 0.46);
            const rowIn = seg(time, start - 0.3, start + 0.05);
            return (
              <div key={item.key} className="flex items-center gap-5" style={enter(rowIn, 6)}>
                <span className="w-[150px] shrink-0 text-[24px]">{d.dimensions[item.key]}</span>
                <span className="h-[14px] flex-1 overflow-hidden rounded-full bg-[var(--paper-deep)]">
                  <span
                    className="block h-full rounded-full bg-[var(--paper-deep)]"
                    style={{ width: "100%" }}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(item.low / item.max) * 100}%`,
                        background: "var(--accent)",
                        transform: `scaleX(${fill})`,
                        transformOrigin: "left center",
                      }}
                    />
                  </span>
                </span>
                <span className="tnum w-[104px] shrink-0 whitespace-nowrap text-right text-[24px] font-semibold">
                  {Math.round(item.low * fill)}
                  <span className="text-[var(--muted)]"> / {item.max}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-[16px] bg-[var(--warning-faint)] px-6 py-4 text-[24px] font-semibold text-[var(--warning)]" style={enter(seg(time, 9.5, 9.85), 8)}>
        <TriangleAlert className="size-6" />
        {format(d.scoring.summary, { score: total, threshold: THRESHOLD })}
      </div>
    </div>
  );
}

/* ------------------------------ 第四幕：供应商让步，重新校验 62 → 86 ------------------------------ */

function RecheckScene({ time, d }: SceneProps) {
  const ask = seg(time, 10.15, 10.55);
  const reply = seg(time, 10.9, 11.3);
  const panel = seg(time, 11.5, 11.85);
  const swap = seg(time, 11.7, 12.5);
  const system = seg(time, 12.55, 12.9);

  const total = Math.round(SCORE_LOW + (SCORE_HIGH - SCORE_LOW) * swap);
  const changed = deltas(d);

  return (
    <div className="flex h-full flex-col px-12 py-8">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[30px] font-bold tracking-tight">{d.recheck.title}</h3>
        <span className="text-[22px] text-[var(--muted)]">{d.recheck.subtitle}</span>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <div className="flex items-start justify-end gap-4" style={enter(ask)}>
          <div
            className="max-w-[860px] rounded-[18px] rounded-tr-[6px] px-6 py-5 text-white"
            style={{ background: "var(--surface-inverse)" }}
          >
            <p className="text-[27px] leading-[1.5]">
              {format(d.recheck.ask, {
                score: SCORE_LOW,
                threshold: THRESHOLD,
                moq: CONCEDED.moq,
                days: CONCEDED.payment,
              })}
            </p>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[var(--accent)] text-white">
            <Bot className="size-6" />
          </span>
        </div>

        <div className="flex items-start gap-4" style={enter(reply)}>
          <SupplierAvatar d={d} />
          <div className="max-w-[820px] rounded-[18px] rounded-tl-[6px] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
            <p className="text-[27px] leading-[1.5]">
              {format(d.recheck.reply, { moq: CONCEDED.moq, days: CONCEDED.payment, price: CONCEDED.price })}
            </p>
          </div>
        </div>
      </div>

      {/* 变化的三个字段直接摊开：这是「规则写在明面上」最有说服力的一屏 */}
      <div className="mt-5 grid grid-cols-3 gap-4" style={enter(panel, 8)}>
        {changed.map((delta) => (
          <div key={delta.key} className="rounded-[16px] border border-[var(--line)] bg-[var(--paper)] px-5 py-4">
            <div className="text-[19px] text-[var(--muted)]">{d.terms[delta.key]}</div>
            <div className="tnum mt-2 flex items-center gap-2 text-[26px] font-semibold">
              <span className="text-[var(--muted)] line-through decoration-[var(--muted)]/50">{delta.from}</span>
              <span className="text-[var(--accent-strong)]">→</span>
              <span className="font-bold">{delta.to}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-6 rounded-[18px] border px-7 py-5"
        style={{
          ...enter(panel, 8),
          borderColor: "color-mix(in srgb, var(--success) 28%, transparent)",
          background: "var(--success-faint)",
        }}
      >
        <span className="text-[22px] font-semibold text-[var(--muted)]">{d.recheck.scoreLabel}</span>
        <span className="tnum flex items-end gap-3">
          <span className="text-[42px] font-bold text-[var(--muted)]">{SCORE_LOW}</span>
          <span className="pb-1.5 text-[30px] text-[var(--muted)]">→</span>
          <span className="text-[64px] font-bold leading-none text-[var(--success)]">{total}</span>
        </span>
        <span className="ml-auto flex items-center gap-2 rounded-full bg-[var(--success)] px-5 py-2.5 text-[22px] font-semibold text-white">
          <BadgeCheck className="size-5" />
          {d.recheck.qualified}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[22px] text-[var(--muted)]" style={enter(system, 6)}>
        <CircleCheck className="size-5 text-[var(--success)]" />
        {format(d.recheck.system, {
          from: SCORE_LOW,
          to: SCORE_HIGH,
          fromLabel: d.recheck.classification.negotiating,
          toLabel: d.recheck.classification.qualified,
        })}
      </div>
    </div>
  );
}

/* ------------------------------ 第五幕：分层转人工 ------------------------------ */

function HandoffScene({ time, d }: SceneProps) {
  const banner = seg(time, 13.35, 13.8);
  const stop = seg(time, 13.8, 14.2);
  const alert = seg(time, 14.25, 14.65);
  const card = seg(time, 14.7, 15.15);
  const bell = 1 + 0.06 * Math.sin((time - 14.25) * Math.PI * 3.2);

  return (
    <div className="flex h-full flex-col px-12 py-8">
      <div
        className="flex items-center gap-5 rounded-[20px] border px-7 py-6"
        style={{
          ...enter(banner, 8),
          borderColor: "color-mix(in srgb, var(--success) 30%, transparent)",
          background: "var(--success-faint)",
        }}
      >
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--success)] text-white">
          <CircleCheck className="size-8" />
        </span>
        <span className="flex-1">
          <span className="tnum block text-[34px] font-bold leading-tight text-[var(--success)]">
            {format(d.handoff.headline, { score: SCORE_HIGH, threshold: THRESHOLD })}
          </span>
          <span className="mt-1.5 block text-[22px] text-[var(--muted)]">
            {d.handoff.principle}
          </span>
        </span>
      </div>

      <div className="mt-6 flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-4" style={enter(stop, 6)}>
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--paper-deep)] text-[var(--muted)]">
            <Bot className="size-6" />
          </span>
          <span className="text-[27px]">
            {d.handoff.stopped.lead}
            <span className="font-bold">{d.handoff.stopped.strong}</span>
            {d.handoff.stopped.tail}
          </span>
        </div>

        <div className="flex items-center gap-4" style={enter(alert, 6)}>
          <span
            className="relative grid size-11 shrink-0 place-items-center rounded-full bg-[var(--accent-faint)] text-[var(--accent-strong)]"
            style={{ transform: `scale(${bell})` }}
          >
            <Bell className="size-6" />
            <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[var(--danger)] text-[12px] font-bold text-white">
              1
            </span>
          </span>
          <span className="text-[27px]">
            {d.handoff.alerted.lead}
            <span className="font-bold">{d.handoff.alerted.strong}</span>
            {d.handoff.alerted.tail}
          </span>
        </div>

        <div
          className="mt-auto flex items-center gap-5 rounded-[18px] border border-[var(--line)] bg-[var(--paper)] px-6 py-5"
          style={enter(card, 8)}
        >
          <SupplierAvatar d={d} />
          <span className="min-w-0 flex-1">
            <span className="block text-[26px] font-bold">
              {d.supplier.name} · {d.supplier.contact}
            </span>
            <span className="mt-1 block text-[20px] text-[var(--muted)]">
              {format(d.handoff.card, {
                price: CONCEDED.price,
                moq: CONCEDED.moq,
                days: CONCEDED.payment,
                from: SCORE_LOW,
                to: SCORE_HIGH,
              })}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-[21px] font-semibold text-white">
            <FileBadge2 className="size-5" />
            {d.handoff.pending}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 主组件 ------------------------------ */

/**
 * 影片主组件。
 *
 * 语言是 props 显式传进来的：**不在组件内部读 useI18n() / cookie / matchMedia**，
 * 因为影片的每一帧必须是 (time, locale) 的纯函数——录制脚本逐帧定格截图，
 * 一旦有第二个输入源（cookie、随机数、当前时间），同一时刻就可能录出两种画面。
 * 默认 "zh"，与录制舞台 /demo-stage 的首帧初值一致。
 */
export function NegotiationDemo({
  time,
  locale = "zh",
  className,
}: {
  time: number;
  locale?: Locale;
  className?: string;
}) {
  const t = Math.max(0, Math.min(DEMO_SECONDS, time));
  const dict = getDictionary(locale);
  const d = dict.film;

  // 幕间位移：0 → 4，每段 0.45s，与场景内部的入场动画并行推进
  const stage =
    seg(t, SCENE.bottomline, SCENE.bottomline + 0.45)
    + seg(t, SCENE.scoring, SCENE.scoring + 0.45)
    + seg(t, SCENE.recheck, SCENE.recheck + 0.45)
    + seg(t, SCENE.handoff, SCENE.handoff + 0.45);

  // 首尾各 0.35s 让整块卡片淡入淡出：录出来的视频可以无缝循环，
  // 而不是从「待人工接管」硬切回空白。
  const veil = Math.min(seg(t, 0, 0.35), 1 - seg(t, DEMO_SECONDS - 0.35, DEMO_SECONDS));

  const live = t < SCENE.handoff;
  const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * Math.PI * 1.6));

  return (
    <div className={cn("relative h-[960px] w-[1280px] overflow-hidden bg-[var(--paper)]", className)}>
      {/* 环境底纹：与认证页品牌区同一套 48px 网格，让影片和整站是同一个世界 */}
      <div className="ambient-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />

      <div
        className="relative m-16 flex h-[832px] flex-col overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_18px_40px_-24px_rgba(26,26,46,.28)]"
        style={{ opacity: veil }}
      >
        <div className="flex items-center gap-4 border-b border-[var(--line)] px-12 py-5">
          <FilmBrandMark />
          <span className="text-[26px] font-bold tracking-tight">
            {dict.common.brand.name} <span className="text-[var(--accent)]">{dict.common.brand.suffix}</span>
          </span>
          <span className="h-6 w-px bg-[var(--line)]" />
          <span className="text-[23px] text-[var(--muted)]">
            {format(d.chrome.desk, { supplier: d.supplier.name })}
          </span>

          <span className="ml-auto flex items-center gap-3">
            <span
              className="flex items-center gap-2.5 rounded-full px-4 py-2 text-[21px] font-semibold"
              style={
                live
                  ? { background: "var(--accent-faint)", color: "var(--accent-strong)" }
                  : { background: "var(--paper-deep)", color: "var(--muted)" }
              }
            >
              <span
                className="size-2.5 rounded-full"
                style={{ background: live ? "var(--accent)" : "var(--muted)", opacity: live ? pulse : 1 }}
              />
              {live ? d.chrome.live : d.chrome.handedOff}
            </span>
          </span>
        </div>

        <Rail time={t} d={d} />

        {/* 舞台：五幕纵向串成一条带子，按时间平移。用位移而不是交叉淡出，
            避免两幕内容叠在一起互相糊住。 */}
        <div className="relative flex-1 overflow-hidden">
          <div className="absolute inset-x-0 top-0" style={{ height: "500%", transform: `translateY(-${(stage * 100) / 5}%)` }}>
            {/* 每一幕都 overflow-hidden：内容一旦比幕高更高，宁可裁掉也不能溢到相邻幕上，
                否则平移过程中会出现「上一幕的结论条压在下一幕标题上」这种穿帮。 */}
            <div className="h-1/5 overflow-hidden"><ReceptionScene time={t} d={d} /></div>
            <div className="h-1/5 overflow-hidden"><BottomLineScene time={t} d={d} /></div>
            <div className="h-1/5 overflow-hidden"><ScoringScene time={t} d={d} /></div>
            <div className="h-1/5 overflow-hidden"><RecheckScene time={t} d={d} /></div>
            <div className="h-1/5 overflow-hidden"><HandoffScene time={t} d={d} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
