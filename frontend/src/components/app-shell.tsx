"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell, Bot, Building2, ChevronDown, FlaskConical, Inbox, LayoutDashboard, MessagesSquare } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { getNegotiations, type Negotiation } from "@/lib/api";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "采购工作台", short: "工作台", icon: LayoutDashboard },
  { href: "/negotiate", label: "实时谈判", short: "谈判", icon: MessagesSquare },
  { href: "/supplier", label: "供应商入口", short: "供应商", icon: Building2 },
  { href: "/evaluation", label: "测评实验室", short: "测评", icon: FlaskConical },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState<Negotiation[]>([]);
  const [open, setOpen] = useState(false);

  // 铃铛 = 待接管提醒：轮询达到转人工条件、等待商家接管的会话。
  const loadPending = useCallback(async () => {
    try {
      const items = await getNegotiations();
      setPending(items.filter(item => item.status === "manual_required"));
    } catch { /* 后端未启动或令牌未配置时静默 */ }
  }, []);
  useEffect(() => {
    void loadPending();
    const timer = setInterval(() => void loadPending(), 30_000);
    return () => clearInterval(timer);
  }, [loadPending]);

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
            <div className="relative">
              <button aria-label="通知" onClick={() => setOpen(current => !current)} className="relative grid size-9 place-items-center rounded-xl border border-[var(--line)] bg-white text-[var(--muted)]">
                <Bell className="size-4" />
                {pending.length > 0 && <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-white">{pending.length}</span>}
              </button>
              {open && <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />}
              {open && (
                <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
                  <div className="border-b border-[var(--line)] px-4 py-3 text-sm font-bold">待接管的优质候选</div>
                  {pending.length ? <div className="max-h-80 divide-y divide-[var(--line)] overflow-y-auto">{pending.map(item => (
                    <Link key={item.id} href={`/negotiate?id=${item.id}`} onClick={() => setOpen(false)} className="block px-4 py-3 transition hover:bg-[var(--paper)]">
                      <div className="flex items-center justify-between gap-2 text-sm font-semibold"><span className="truncate">{item.supplier.company_name}</span><span className="shrink-0 text-xs font-bold text-[var(--accent-strong)]">{item.score} 分</span></div>
                      <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{item.product.name} · 报价 ¥{item.quoted_price} · {item.supplier.region}</div>
                    </Link>
                  ))}</div> : <div className="px-4 py-6 text-center text-xs text-[var(--muted)]"><Inbox className="mx-auto mb-2 size-6" />暂无待接管会话，AI 正常工作中</div>}
                </div>
              )}
            </div>
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
