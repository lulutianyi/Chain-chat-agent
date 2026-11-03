"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type RevealProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 入场延迟（ms）。同组元素排队时按 0 / 60 / 120 / 180 递增，最长建议 480 */
  delay?: number;
  /** 默认只播一次；长页里需要「滚回去再滚回来重播」时传 false */
  once?: boolean;
};

/**
 * 滚动入场容器。
 *
 * 隐藏态由 globals.css 的 `.motion .reveal` 承担，而 `.motion` 只会在
 * 「支持 IntersectionObserver 且系统未要求减少动态」时由 layout 的内联脚本挂上——
 * 也就是说这里**不需要**再判断一遍 reduced-motion：没有 `.motion` 时元素
 * 本来就处于最终态，动画类也不会生效，直接可见。
 *
 * 之所以不在 JS 里写 `style.opacity`：那会污染 SSR 输出，脚本一旦异常整块内容
 * 就永久不可见。让「隐藏」完全由 CSS 类控制，是最不容易出事的分工。
 */
export function Reveal({ delay = 0, once = true, className, style, children, ...props }: RevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!document.documentElement.classList.contains("motion")) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            entry.target.classList.remove("is-in");
          }
        }
      },
      // 下边距收 12%：元素进入视口下缘之前就触发，滚动手感上「不等它」
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [once]);

  return (
    <div
      ref={ref}
      className={cn("reveal", className)}
      style={delay ? { ...style, animationDelay: `${delay}ms` } : style}
      {...props}
    >
      {children}
    </div>
  );
}
