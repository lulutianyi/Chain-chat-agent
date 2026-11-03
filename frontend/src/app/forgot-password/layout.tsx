import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";

// 找回密码是公开认证页，但不应被搜索引擎收录：验证码与重置令牌都只对当前会话有效。
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return {
    title: d.auth.meta.forgotTitle,
    description: d.auth.meta.forgotDescription,
    alternates: { canonical: "/forgot-password" },
    robots: { index: false, follow: false },
  };
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
