"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowUp, Bot, Inbox, Loader2, Lock, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getNegotiation, sendSupplierMessage, type Negotiation } from "@/lib/api";
import { cn } from "@/lib/utils";

const statusText: Record<string, string> = { ai_active: "AI 洽谈中", manual_required: "等待人工沟通", human_active: "人工沟通中", closed: "已结束" };

export default function SupplierChatPage() {
  const [negotiation, setNegotiation] = useState<Negotiation | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const id = Number(new URLSearchParams(window.location.search).get("id") || 0);
    if (!id) { setError("缺少谈判会话编号"); setLoading(false); return; }
    try { setNegotiation(await getNegotiation(id)); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "无法读取谈判会话"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const canSend = Boolean(negotiation && negotiation.status === "ai_active" && negotiation.classification === "negotiating");

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!negotiation || !draft.trim() || !canSend) return;
    setSending(true);
    try { await sendSupplierMessage(negotiation.id, draft.trim()); setDraft(""); await load(); } catch (err) { setError(err instanceof Error ? err.message : "发送失败"); } finally { setSending(false); }
  }

  if (loading) return <div className="py-20 text-center text-sm text-[var(--muted)]">正在读取洽谈会话…</div>;
  if (!negotiation) return <Card className="mx-auto max-w-xl"><CardContent className="p-10 text-center"><Inbox className="mx-auto size-10 text-[var(--muted)]" /><h1 className="mt-4 text-xl font-bold">无法读取洽谈会话</h1><p className="mt-2 text-sm text-[var(--muted)]">{error || "会话不存在，请检查链接。"}</p><Link href="/supplier"><Button variant="outline" className="mt-6">返回提交资料</Button></Link></CardContent></Card>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col animate-rise">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <Link href="/supplier" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]"><ArrowLeft className="size-3.5" />返回提交资料</Link>
          <h1 className="text-2xl font-bold tracking-tight">{negotiation.product.name} · AI 洽谈</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">供货方：{negotiation.supplier.company_name} · 会话 #{negotiation.id}</p>
        </div>
        <Badge className={cn("border-0 px-3 py-1.5", negotiation.status === "ai_active" ? "bg-[var(--success-faint)] text-[var(--success)]" : "bg-[var(--accent-faint)] text-[var(--accent-strong)]")}>{statusText[negotiation.status] ?? negotiation.status}</Badge>
      </div>

      {error && <div className="mb-4 rounded-xl border border-[var(--warning)]/20 bg-[var(--warning-faint)] p-3 text-sm text-[var(--warning)]">{error}</div>}

      <Card className="flex min-h-[560px] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3 text-xs text-[var(--muted)]"><span>与 AI 采购助手的洽谈记录</span><span>{negotiation.messages.length} 条消息</span></div>
        <div className="thin-scrollbar flex-1 space-y-5 overflow-y-auto bg-[#faf9f6] p-4 sm:p-6">
          {negotiation.messages.length ? negotiation.messages.map(message => (
            <div key={message.id} className={cn("flex gap-2.5", message.sender !== "supplier" && "justify-end", message.sender === "system" && "justify-center")}>
              {message.sender === "supplier" && <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--paper-deep)] text-xs font-bold">{negotiation.supplier.company_name.slice(0, 1)}</div>}
              {message.sender === "system" ? <div className="rounded-full bg-[var(--paper-deep)] px-3 py-1 text-[10px] text-[var(--muted)]">{message.content}</div> : <div className={cn("max-w-[82%]", message.sender !== "supplier" && "text-right")}><div className={cn("inline-block rounded-2xl px-4 py-3 text-left text-sm leading-6", message.sender === "supplier" ? "rounded-tl-sm border border-[var(--line)] bg-white" : message.sender === "ai" ? "rounded-tr-sm bg-[var(--ink)] text-white" : "rounded-tr-sm bg-[var(--accent)] text-white")}>{message.sender === "ai" && <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-[#f4a483]"><Bot className="size-3" />AI 采购助手</div>}{message.sender === "human" && <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-white/75"><UserRound className="size-3" />店长本人</div>}{message.content}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{new Date(message.created_at).toLocaleString("zh-CN")}</div></div>}
            </div>
          )) : <div className="grid h-full place-items-center text-center text-sm text-[var(--muted)]"><div><Inbox className="mx-auto mb-3 size-8" />会话已创建，等待供应商发言</div></div>}
        </div>

        {canSend ? (
          <form onSubmit={send} className="border-t border-[var(--line)] bg-white p-4">
            <div className="relative">
              <Textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="输入你的报价或条款回复…" className="min-h-20 pr-14" />
              <Button type="submit" variant="accent" size="icon" disabled={!draft.trim() || sending} className="absolute bottom-2 right-2 size-9">{sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}</Button>
            </div>
            <div className="mt-2 text-[10px] text-[var(--muted)]">AI 采购助手会自动回复；底线与评分由程序校验，AI 不会擅自承诺下单或付款。</div>
          </form>
        ) : (
          <div className="flex items-center gap-2 border-t border-[var(--line)] bg-white p-4 text-sm text-[var(--muted)]"><Lock className="size-4" />{negotiation.classification === "qualified" || negotiation.status === "manual_required" ? "已触发人工接管，AI 自动回复已停止，请等待商家进一步沟通。" : negotiation.classification === "eliminated" || negotiation.status === "closed" ? "本洽谈已结束，如需继续请重新提交供货方案。" : "当前不可发送消息。"}</div>
        )}
      </Card>
    </div>
  );
}
