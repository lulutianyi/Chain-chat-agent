"use client";

import { useEffect, useState } from "react";
import { NegotiationDemo } from "@/components/negotiation-demo";
import { resolveLocale, type Locale } from "@/lib/i18n/config";

declare global {
  interface Window {
    /** 录制脚本用它把舞台定格到任意时刻；返回的 Promise 在两帧 rAF 后兑现，即「已画到屏幕上」。 */
    __demoSeek?: (time: number) => Promise<void>;
  }
}

export default function DemoStagePage() {
  const [time, setTime] = useState(0);
  /**
   * 初值固定中文：这一页是给录制脚本用的画布，首帧必须确定，不能等 cookie / URL
   * 才有画面。`?lang=en` 在挂载后按 URL 覆盖一次，之后不再变——录制脚本按
   * 「定格 → 截图」逐帧取，语言只在开录前定一次，因此每一帧仍然是 (time, locale)
   * 的纯函数。
   *
   * 为什么不用 useSearchParams：它是客户端组件的 Suspense 依赖，静态预渲染时必须
   * 用 <Suspense> 包住整页，否则构建直接失败；而这里读一次 query 就够，
   * useEffect + window.location.search 没有任何代价。
   */
  const [locale, setLocale] = useState<Locale>("zh");

  useEffect(() => {
    // 录制模式把「同一个 t ⇒ 同一帧」变成硬保证：任何 CSS 动画/过渡都会让同一时刻
    // 因截图时机不同而画出不同的像素，最终表现为视频里的抖动。
    document.documentElement.classList.add("capture");

    // 只认 zh / en，其余（含缺省）一律回退中文：脚本写错参数时录出来的是中文片，
    // 而不是一页空白或半英半中的画面。
    setLocale(resolveLocale(new URLSearchParams(window.location.search).get("lang")));

    window.__demoSeek = (next: number) =>
      new Promise<void>((resolve) => {
        setTime(next);
        // 第一帧 rAF 让 React 提交这次 setState，第二帧才是浏览器真正把它画出来
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
  }, []);

  return (
    <div className="h-[960px] w-[1280px] overflow-hidden">
      <NegotiationDemo time={time} locale={locale} />
    </div>
  );
}
