import Link from "next/link";
import { Compass } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getI18n } from "@/lib/i18n/server";

// 404 页是服务端组件（APP Router 的 not-found 默认就是服务端组件）：
// 语言只能从 cookie 里读，因此用 getI18n，而不是客户端 hook。
export default async function NotFound() {
  const { d } = await getI18n();
  const t = d.system.notFound;

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center sm:p-10">
          <div className="mx-auto grid size-14 place-items-center rounded-[var(--radius-card)] bg-[var(--accent-faint)] text-[var(--accent)]">
            <Compass className="size-7" />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            {t.body}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/" className="flex-1">
              <Button variant="accent" size="lg" className="w-full">{d.common.actions.backHome}</Button>
            </Link>
            <Link href="/login" className="flex-1">
              <Button variant="outline" size="lg" className="w-full">{t.goLogin}</Button>
            </Link>
          </div>
          {/* 迷路的人最需要的是「换一种看得懂的语言」：这里也给一个入口。 */}
          <div className="mt-5 flex justify-center">
            <LanguageSwitcher />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
