import type { MetadataRoute } from "next";

import { BRAND_COLORS } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "链谈 Agent",
    short_name: "链谈",
    description: "为中小采购商家自动接待、筛选并分层供应商的谈判系统。",
    start_url: "/",
    display: "standalone",
    background_color: BRAND_COLORS.paper,
    theme_color: BRAND_COLORS.accent,
    lang: "zh-CN",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
