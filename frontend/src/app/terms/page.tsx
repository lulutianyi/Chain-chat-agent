import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getI18n } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/types";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return {
    title: d.legal.meta.title,
    description: d.legal.meta.description,
  };
}

export default async function TermsPage() {
  const { d } = await getI18n();
  const t = d.legal;
  // 品牌名两种语言写法不同（链谈 Agent / LianTan Agent），正文里的品牌沿用同一份词典。
  const brand = `${d.common.brand.name} ${d.common.brand.suffix}`;

  return (
    <div className="animate-rise mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col justify-center py-8">
      {/* 平台须知是首页页脚能直达的公开页面，语言切换在这里同样要够得着，
          否则英文用户看完条款只能退回首页才能切回中文。 */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/register" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]"><ArrowLeft className="size-3.5" />{t.backToRegister}</Link>
        <LanguageSwitcher />
      </div>

      <Card className="overflow-hidden">
        <div className="h-2 bg-[var(--accent)]" />
        <CardContent className="p-7 sm:p-8">
          <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
          <div className="mt-5 space-y-4 text-sm leading-7 text-[var(--muted)]">
            {t.paragraphs.map((paragraph) => (
              <p key={paragraph}>{format(paragraph, { brand })}</p>
            ))}
          </div>
          <div className="mt-6">
            <Link href="/register"><Button variant="accent" className="w-full">{t.confirm}</Button></Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
