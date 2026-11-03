import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// 只收录公开可达的营销与登录页；工作台、洽谈页属于登录后区域，不进入索引。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/register", "/terms", "/supplier/login"],
        // /demo-stage 是首页影片的「摄影棚」，只给 scripts/build-demo-video.mjs 用：
        // 页面本身已经有 noindex，这里再显式拒一次，别让它被任何爬虫当成产品页面。
        disallow: ["/dashboard", "/negotiate", "/evaluation", "/settings", "/supplier", "/supplier/chat", "/demo-stage"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
