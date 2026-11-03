"use client";

import * as React from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

/**
 * 首页 hero 的产品影片。
 *
 * 为什么是 <video> 而不是几张静态截图：
 *   截图只能给出一个终态（86 分、优质候选），而本产品的卖点恰恰是「过程可解释」——
 *   89 分是怎么来的、哪一步触线、谁把分拉上来的。影片按真实链路演一遍：
 *   自动接待 → 底线逐项核验 → 首次 62 分未达阈值 → AI 议价 → 重新校验 86 分 → 转人工。
 *   源文件与渲染脚本见 src/components/negotiation-demo.tsx 与 scripts/build-demo-video.mjs。
 *
 * 三层降级，任何一层出问题都不会白屏：
 *   1. 常规：mp4 自动播放、静音、循环；
 *   2. 系统要求「减少动态效果」：由 CSS 换成同一时刻的静态帧（不需要 JS 参与）；
 *   3. 视频解码失败：onError 时同样退到静态帧。
 *
 * 自动播放的循环内容超过 5 秒就必须可暂停（WCAG 2.2.2），所以右下角常驻一个
 * 暂停/播放按钮，而不是只在 hover 时才出现。
 *
 * 素材是**按语言两份**的：影片画面里的文字（条款、消息、评分维度）都长在画布上，
 * 不是 DOM 文本，没法由词典实时改写，所以中文界面放中文片、英文界面放英文片，
 * 三种降级路径（视频 / 静态替代帧 / poster）也必须一起换，否则英文界面会闪出中文画面。
 */

/**
 * 字幕里的两个分数。它们是影片帧里算出来的值（见 negotiation-demo.tsx 的
 * SCORE_LOW / SCORE_HIGH），按约定不进词典，就留在这里；改影片评分配置时要同步。
 */
const FILM_SCORES = { first: 62, final: 86 } as const;

/**
 * 每种语言一套素材，用 `npm run film` / `npm run film:en` 分别录制
 * （脚本会把 /demo-stage?lang=en 与 -en 输出名一起管好，不会互相覆盖）。
 */
const FILM_ASSETS: Record<Locale, { video: string; poster: string }> = {
  zh: { video: "/demo/negotiation.mp4", poster: "/demo/negotiation-poster.jpg" },
  en: { video: "/demo/negotiation-en.mp4", poster: "/demo/negotiation-poster-en.jpg" },
};

export function ProductFilm({ className }: { className?: string }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const { locale, d } = useI18n();

  const t = d.film.player;
  const asset = FILM_ASSETS[locale];

  // 用 ref 记「当前是不是在播」：换素材时要延续用户的选择（他手动暂停过就保持暂停），
  // 但 playing 不能进下面那个 effect 的依赖——否则每次点暂停都会重载一次素材。
  const playingRef = React.useRef(true);
  React.useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // 换语言 = 换素材，这里必须显式重载。
  // 曾经的写法是把 <source src> 挂在 <video> 里：React 只改了 <source> 的属性，
  // 浏览器不会因此重跑「资源选择算法」，于是英文界面继续播中文片子
  // （表现为 currentSrc 还是 negotiation.mp4，而 sourceSrc 已经变成 -en）。
  // 现在两件事一起做：src 直接写在 <video> 上（改 src 属性本身就会触发重载），
  // 再显式 load() 一次兜底；同时清掉上一语言留下的 failed，
  // 否则中文素材 404 过一次之后，英文素材永远不再尝试。
  React.useEffect(() => {
    setFailed(false);
    const video = videoRef.current;
    if (!video) return;
    video.load();
    if (playingRef.current) {
      void video.play().catch(() => {
        /* 自动播放被浏览器策略拦下时保留首帧（poster），不影响布局与后续手动播放 */
      });
    } else {
      // autoPlay 属性会让新素材一加载就自己播起来，用户手动暂停过就必须再按回去——
      // 暂停按钮是 WCAG 2.2.2 要求的可停控件，不能因为换了语言就失效。
      video.pause();
    }
  }, [asset.video]);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }

  return (
    <figure
      className={cn(
        "relative m-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-card",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full bg-[var(--paper-deep)]">
        {!failed && (
          <video
            ref={videoRef}
            className="film-video absolute inset-0 size-full object-cover"
            src={asset.video}
            poster={asset.poster}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setFailed(true)}
          />
        )}

        {/* 静态替代帧。显示与否主要交给 CSS 的 prefers-reduced-motion 媒体查询，
            不放 JS 里判断——否则「禁用了 JS」的用户就永远拿不到替代画面。
            视频解码失败时用内联样式强制显示：`!block` 这种写法经 tailwind-merge
            合并后会被转义成 `.film-still\!block`，永远匹配不上，等于兜底失效。 */}
        <Image
          src={asset.poster}
          alt={format(t.stillAlt, { brand: `${d.common.brand.name} ${d.common.brand.suffix}` })}
          fill
          sizes="(min-width: 1024px) 560px, 100vw"
          className="film-still object-cover"
          style={failed ? { display: "block" } : undefined}
        />

        {/* 只在视频真的存在时才给控件：reduced-motion 下视频已被 CSS 隐藏、
            onError 后视频节点已被卸载，此时按钮会变成控制不存在对象的死控件。 */}
        {!failed && (
          <button
            type="button"
            onClick={toggle}
            // aria-pressed 描述的是「这个开关有没有开着」。原来的 `!playing` 是反的：
            // 显示暂停图标（说明正在播）时却报 pressed=false。
            aria-pressed={playing}
            aria-label={playing ? t.pause : t.play}
            className="film-toggle absolute bottom-3 right-3 grid size-10 place-items-center rounded-full bg-[var(--ink)]/72 text-white backdrop-blur-[2px] transition-colors hover:bg-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
        )}
      </div>

      <figcaption className="border-t border-[var(--line)] px-5 py-3 text-xs leading-5 text-[var(--muted)]">
        <span className="font-semibold text-[var(--ink)]">{t.captionLead}</span>
        {format(t.caption, { first: FILM_SCORES.first, final: FILM_SCORES.final })}
      </figcaption>
    </figure>
  );
}
