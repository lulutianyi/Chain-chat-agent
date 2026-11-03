import type { NextConfig } from "next";

// 基础安全响应头。前端是纯静态导出到 Vercel，没有服务端渲染的动态 HTML，
// 因此 CSP 可以先收紧到「不允许被 iframe 嵌入 + 禁止 MIME 嗅探」这一档，
// 待接入真实域名与第三方资源清单后再补完整的 script-src / img-src 白名单。
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // 构建产物目录。默认 .next；渲染首页影片的脚本（scripts/build-demo-video.mjs）
  // 需要起一个自己的 next dev / next start，如果和本地正在跑的 `npm run dev`
  // 共用 .next，两边会互相覆盖对方的 chunk（表现为页面 500、JS 全部加载失败）。
  // 因此给它一个独立目录，互不打扰；Vercel 构建不受影响，仍是 .next。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
