"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bot, Building2, ChevronDown, FlaskConical, LayoutDashboard, MessagesSquare } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "采购工作台", short: "工作台", icon: LayoutDashboard },
  { href: "/negotiate", label: "实时谈判", short: "谈判", icon: MessagesSquare },
  { href: "/supplier", label: "供应商入口", short: "供应商", icon: Building2 },
  { href: "/evaluation", label: "测评实验室", short: "测评", icon: FlaskConical },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-white/10 bg-[var(--ink)] text-white lg:flex lg:min-h-screen lg:flex-col lg:p-5">
        <div className="flex items-center gap-3 px-2 py-2">
          <BrandMark className="bg-white text-[var(--ink)] [&>span:first-child]:border-[var(--accent)] [&>span:nth-child(2)]:border-[var(--ink)]" />
          <div><div className="text-lg font-bold tracking-tight">链谈 <span className="text-[var(--accent)]">Agent</span></div><div className="text-[10px] tracking-[.22em] text-white/45">SUPPLY NEGOTIATOR</div></div>
        </div>
        <nav className="mt-9 space-y-1.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition", active ? "bg-white text-[var(--ink)] shadow-lg" : "text-white/62 hover:bg-white/8 hover:text-white")}><Icon className={cn("size-[18px]", active && "text-[var(--accent)]")} />{label}</Link>;
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.055] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/75"><Bot className="size-4 text-[var(--accent)]" />AI 守门狗正在工作</div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-white/45"><span>本月已筛选</span><span className="text-white">126 家</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[68%] rounded-full bg-[var(--accent)]" /></div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[rgba(245,243,238,.88)] px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden"><BrandMark /><span className="font-bold">链谈 Agent</span></div>
          <div className="hidden items-center gap-2 text-xs text-[var(--muted)] lg:flex"><span className="size-2 rounded-full bg-[var(--success)]" />系统运行正常·AI 防火墙已开启</div>
          <div className="ml-auto flex items-center gap-3">
            <button aria-label="通知" className="relative grid size-9 place-items-center rounded-xl border border-[var(--line)] bg-white text-[var(--muted)]"><Bell className="size-4" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-[var(--accent)]" /></button>
            <button className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-2 py-1.5 text-sm"><span className="grid size-7 place-items-center rounded-lg bg-[var(--accent-faint)] text-xs font-bold text-[var(--accent-strong)]">鹿</span><span className="hidden sm:block">小鹿生活馆</span><ChevronDown className="size-3.5 text-[var(--muted)]" /></button>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">{children}</main>
      </div>
      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-2xl border border-white/10 bg-[rgba(24,35,31,.94)] p-1.5 text-white shadow-2xl backdrop-blur-lg lg:hidden">
        {nav.map(({ href, short, icon: Icon }) => {
          const active = pathname === href;
          return <Link key={href} href={href} className={cn("flex flex-col items-center gap-1 rounded-xl py-2 text-[10px]", active ? "bg-white text-[var(--ink)]" : "text-white/55")}><Icon className={cn("size-4", active && "text-[var(--accent)]")} />{short}</Link>;
        })}
      </nav>
    </div>
  );
}
