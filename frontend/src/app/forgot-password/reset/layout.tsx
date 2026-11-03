import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return {
    title: d.auth.meta.resetTitle,
    description: d.auth.meta.resetDescription,
    alternates: { canonical: "/forgot-password/reset" },
    robots: { index: false, follow: false },
  };
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
