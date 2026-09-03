import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "链谈 Agent | 供应商智能筛选与谈判",
  description: "为中小商家自动接待、筛选和分层供应商的采购谈判工作台。",
  openGraph: {
    title: "链谈 Agent",
    description: "把时间留给真正值得谈的供应商",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "链谈 Agent 供应商智能谈判工作台" }],
    locale: "zh_CN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "链谈 Agent",
    description: "把时间留给真正值得谈的供应商",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
