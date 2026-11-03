import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";

// /login 是客户端组件，无法直接导出 metadata，用一层 layout 提供独立标题。
// 标题与描述跟着 cookie 里的语言走，所以这里是 generateMetadata 而不是静态 metadata。
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return {
    title: d.auth.meta.loginTitle,
    description: d.auth.meta.loginDescription,
    alternates: { canonical: "/login" },
  };
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
