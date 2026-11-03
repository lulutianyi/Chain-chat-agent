import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/toast";
import { LanguageProvider } from "@/lib/i18n/client";
import { htmlLang } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dict";
import { getI18n } from "@/lib/i18n/server";
import { BRAND_COLORS } from "@/lib/theme";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/**
 * 元信息跟着语言走：搜索引擎与社交卡片抓到的标题/描述必须是访客看得懂的那一份。
 * 语言来自 cookie，所以这里是 generateMetadata 而不是静态 metadata。
 */
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  const t = getDictionary(locale).common.meta;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t.defaultTitle, template: t.titleTemplate },
    description: t.description,
    applicationName: t.applicationName,
    keywords: [...t.keywords],
    authors: [{ name: t.applicationName }],
    openGraph: {
      title: t.ogTitle,
      description: t.ogDescription,
      url: "/",
      siteName: t.applicationName,
      images: [{ url: "/og.jpg", width: 1200, height: 630, alt: t.ogImageAlt }],
      locale: t.ogLocale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t.ogTitle,
      description: t.ogDescription,
      images: ["/og.jpg"],
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: BRAND_COLORS.accent,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // 语言在服务端就定下来：<html lang> 与首屏文案必须一次渲染就是对的，
  // 否则会出现「先中文再跳成英文」的闪烁。
  const { locale } = await getI18n();

  return (
    // suppressHydrationWarning 是必须的：上面那段内联脚本会在水合之前给 <html>
    // 加上 .motion，React 比对服务端标记与客户端属性时必然发现差异，
    // 于是每个页面都往控制台打一条 hydration 报错，Next 开发浮层也常驻一个 Issue。
    // 这里只压制 <html> 自身属性的差异，不会掩盖子树的真实水合问题。
    <html lang={htmlLang(locale)} suppressHydrationWarning>
      <head>
        {/* 动效开关。为什么必须是首屏同步内联脚本：
            滚动入场元素的隐藏态写在 `.motion .reveal{opacity:0}` 里，
            如果等 React 水合后再加类，内容会先完整显示一次再突然消失——
            那比不做动画更糟。放在这里可以在首次绘制前决定，不闪。
            它同时也是无障碍兜底：系统开了「减少动态效果」时根本不加这个类，
            于是所有入场隐藏态都不会落地，页面直接呈现最终状态。 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&'IntersectionObserver' in window){document.documentElement.classList.add('motion')}}catch(e){}",
          }}
        />
      </head>
      <body>
        {/* Provider 拿服务端读到的语言做初值：客户端组件因此不会先渲染中文再切英文。 */}
        <LanguageProvider initialLocale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
