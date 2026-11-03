import type { Metadata } from "next";

// 这是首页影片的「摄影棚」，不是给用户看的页面：它只渲染定尺 1280×960 的演示舞台，
// 由 scripts/build-demo-video.mjs 通过 CDP 逐帧驱动、截图、再编码成 public/demo 下的视频。
// 因此这里显式 noindex — 它不该出现在任何搜索结果里。
export const metadata: Metadata = {
  title: "演示摄影棚",
  robots: { index: false, follow: false },
};

export default function DemoStageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
