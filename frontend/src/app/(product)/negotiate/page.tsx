"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUp, Bot, CheckCircle2, Hand, Inbox, Info, Pause, RefreshCw, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getNegotiation, getNegotiations, handoffNegotiation, resumeAiNegotiation, sendHumanMessage, sendSupplierMessage, type Negotiation } from "@/lib/api";
import { cn } from "@/lib/utils";

const statusText: Record<string, string> = { ai_active: "AI 自动谈判中", manual_required: "等待人工接管", human_active: "人工沟通中", closed: "已结束" };

export default function NegotiatePage() {
  const [sessions, setSessions] = useState<Negotiation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<"buyer" | "supplier-test">("buyer");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const active = useMemo(() => sessions.find(item => item.id === selectedId) ?? null, [sessions, selectedId]);

  const load = useCallback(async (preferredId?: number | null) => {
    try {
      const items = await getNegotiations();
      setSessions(items);
      const params = new URLSearchParams(window.location.search);
      const queryId = preferredId ?? Number(params.get("id") || 0);
      if (params.get("view") === "supplier-test") setView("supplier-test");
      setSelectedId(current => items.some(item => item.id === (queryId || current)) ? (queryId || current) : items[0]?.id ?? null);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "无法读取谈判会话"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function replaceSession(updated: Negotiation) {
    setSessions(current => current.map(item => item.id === updated.id ? updated : item));
  }
  async function takeOver() {
    if (!active) return;
    try { replaceSession(await handoffNegotiation(active.id) as Negotiation); } catch (e) { setError(e instanceof Error ? e.message : "接管失败"); }
  }
  async function resumeAi() {
    if (!active) return;
    try { replaceSession(await resumeAiNegotiation(active.id)); } catch (e) { setError(e instanceof Error ? e.message : "无法恢复 AI"); }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!active || !draft.trim()) return;
    const canSupplierSend = view === "supplier-test" && !["closed"].includes(active.status) && active.classification !== "eliminated";
    const canBuyerSend = view === "buyer" && active.status === "human_active";
    if (!canSupplierSend && !canBuyerSend) return;
    setSending(true);
    try {
      if (view === "supplier-test") {
        await sendSupplierMessage(active.id, draft.trim());
        replaceSession(await getNegotiation(active.id));
      } else {
        replaceSession(await sendHumanMessage(active.id, draft.trim()));
      }
      setDraft(""); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "发送失败"); }
    finally { setSending(false); }
  }
  function selectSession(id: number) {
    setSelectedId(id);
    window.history.replaceState(null, "", `/negotiate?id=${id}&view=${view}`);
  }
  function changeView(next: "buyer" | "supplier-test") {
    setView(next); setDraft("");
    if (selectedId) window.history.replaceState(null, "", `/negotiate?id=${selectedId}&view=${next}`);
  }

  if (loading) return <div className="py-20 text-center text-sm text-[var(--muted)]">正在读取谈判会话…</div>;
  if (!active) return <Card className="mx-auto max-w-xl"><CardContent className="p-10 text-center"><Inbox className="mx-auto size-10 text-[var(--muted)]" /><h1 className="mt-4 text-xl font-bold">还没有谈判会话</h1><p className="mt-2 text-sm text-[var(--muted)]">供应商提交资料后，会自动在这里生成独立会话。</p></CardContent></Card>;

  const humanMode = active.status === "human_active";
  const supplierCanSend = active.status !== "closed" && active.classification !== "eliminated";
  const canTakeOver = !["closed", "human_active"].includes(active.status) && active.classification !== "eliminated";
  return <div className="animate-rise">
    <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--accent-strong)]"><span className="h-px w-5 bg-[var(--accent)]" />多会话谈判工作台</div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{active.supplier.company_name}</h1><p className="mt-2 text-sm text-[var(--muted)]">{active.product.name} · {active.supplier.region} · 会话 #{active.id}</p></div><div className="flex flex-wrap items-center gap-2"><div className="flex rounded-xl border border-[var(--line)] bg-white p-1"><button onClick={() => changeView("buyer")} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", view === "buyer" && "bg-[var(--ink)] text-white")}>采购方视角</button><button onClick={() => changeView("supplier-test")} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", view === "supplier-test" && "bg-[var(--accent)] text-white")}>模拟供应商</button></div><Badge className={cn("border-0 px-3 py-1.5", active.status === "ai_active" ? "bg-[var(--success-faint)] text-[var(--success)]" : "bg-[var(--accent-faint)] text-[var(--accent-strong)]")}>{statusText[active.status] ?? active.status}</Badge><Button variant="outline" size="sm" onClick={() => void load(selectedId)}><RefreshCw className="size-3.5" />刷新</Button></div></div>
    {view === "supplier-test" && <div className="mb-5 rounded-xl border border-[var(--warning)]/20 bg-[var(--warning-faint)] px-4 py-3 text-xs leading-5 text-[var(--warning)]"><strong>本地测试模式：</strong>你发送的内容会被记录为当前供应商的真实发言，并触发采购 AI 回复。达到优质候选阈值后，AI 仍会按规则停止自动回复。</div>}
    {error && <div className="mb-5 flex items-center gap-2 rounded-xl border border-[var(--warning)]/20 bg-[var(--warning-faint)] p-3 text-sm text-[var(--warning)]"><AlertTriangle className="size-4" />{error}</div>}
    {active.status === "manual_required" && <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent-faint)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-bold">该供应商已达到转人工条件</div><p className="mt-1 text-xs text-[var(--muted)]">AI 自动回复已经停止，接管后可继续发送消息。</p></div><Button variant="accent" onClick={() => void takeOver()}><Hand className="size-4" />现在接管</Button></div>}

    <div className="grid min-h-[680px] gap-5 lg:grid-cols-[260px_1fr] xl:grid-cols-[270px_1fr_300px]">
      <Card className="overflow-hidden"><CardContent className="p-0"><div className="border-b border-[var(--line)] p-4"><div className="text-sm font-bold">洽谈会话</div><div className="mt-1 text-xs text-[var(--muted)]">{sessions.length} 个供应商 · 点击切换</div></div><div className="max-h-[620px] divide-y divide-[var(--line)] overflow-y-auto">{sessions.map(item => <button key={item.id} onClick={() => selectSession(item.id)} className={cn("w-full p-4 text-left transition hover:bg-[var(--paper)]", item.id === active.id && "border-l-2 border-[var(--accent)] bg-[var(--accent-faint)]/45")}><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{item.supplier.company_name}</span><span className="text-xs font-bold text-[var(--accent-strong)]">{item.score}</span></div><div className="mt-1.5 truncate text-[11px] text-[var(--muted)]">{item.product.name}</div><div className="mt-2 text-[10px] text-[var(--muted)]">{statusText[item.status] ?? item.status}</div></button>)}</div></CardContent></Card>

      <Card className="flex min-h-[680px] flex-col overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3"><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldCheck className="size-4 text-[var(--success)]" />每个会话单独保存消息和状态</div><span className="text-xs text-[var(--muted)]">{active.messages.length} 条消息</span></div><div className="thin-scrollbar flex-1 space-y-5 overflow-y-auto bg-[#faf9f6] p-4 sm:p-6">{active.messages.length ? active.messages.map(message => <div key={message.id} className={cn("flex gap-2.5", message.sender !== "supplier" && "justify-end", message.sender === "system" && "justify-center")} >{message.sender === "supplier" && <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--paper-deep)] text-xs font-bold">{active.supplier.company_name.slice(0, 1)}</div>}{message.sender === "system" ? <div className="rounded-full bg-[var(--paper-deep)] px-3 py-1 text-[10px] text-[var(--muted)]">{message.content}</div> : <div className={cn("max-w-[82%]", message.sender !== "supplier" && "text-right")}><div className={cn("inline-block rounded-2xl px-4 py-3 text-left text-sm leading-6", message.sender === "supplier" ? "rounded-tl-sm border border-[var(--line)] bg-white" : message.sender === "ai" ? "rounded-tr-sm bg-[var(--ink)] text-white" : "rounded-tr-sm bg-[var(--accent)] text-white")}>{message.sender === "ai" && <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-[#f4a483]"><Bot className="size-3" />AI 采购助手</div>}{message.sender === "human" && <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-white/75"><UserRound className="size-3" />店长本人</div>}{message.content}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{new Date(message.created_at).toLocaleString("zh-CN")}</div></div>}</div>) : <div className="grid h-full place-items-center text-center text-sm text-[var(--muted)]"><div><Inbox className="mx-auto mb-3 size-8" />会话已创建，尚无沟通消息</div></div>}</div><form onSubmit={send} className="border-t border-[var(--line)] bg-white p-4"><div className="mb-2 text-xs font-semibold">{view === "supplier-test" ? `以“${active.supplier.company_name}”身份发言` : "采购方人工回复"}</div><div className="relative"><Textarea value={draft} onChange={e => setDraft(e.target.value)} disabled={view === "supplier-test" ? !supplierCanSend : !humanMode} placeholder={view === "supplier-test" ? supplierCanSend ? "输入供应商的报价、让步或问题，发送后等待采购 AI 回复…" : "该会话已经结束，不能继续发送" : humanMode ? "输入给供应商的消息…" : "AI 正在自动接待，接管后可手动回复"} className="min-h-20 pr-14" /><Button type="submit" variant="accent" size="icon" disabled={sending || !draft.trim() || (view === "supplier-test" ? !supplierCanSend : !humanMode)} className="absolute bottom-2 right-2 size-9"><ArrowUp className="size-4" /></Button></div><div className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--muted)]"><Info className="size-3" />{view === "supplier-test" ? "测试发言与 AI 回复都会写入当前供应商会话" : "人工消息会写入当前供应商的谈判记录"}</div></form></Card>

      <div className="space-y-5 lg:col-span-2 xl:col-span-1"><Card><CardContent className="p-5"><div className="text-xs font-semibold text-[var(--muted)]">供应商综合评分</div><div className="mt-1 text-4xl font-bold">{active.score}<span className="text-sm font-normal text-[var(--muted)]"> / 100</span></div><div className="mt-5 grid grid-cols-2 gap-2 text-xs"><Stat label="报价" value={`¥${active.quoted_price}`} /><Stat label="起订量" value={`${active.moq} 件`} /><Stat label="交期" value={`${active.lead_days} 天`} /><Stat label="联系人" value={active.supplier.contact_name} /></div></CardContent></Card><Card><CardContent className="p-5"><div className="text-sm font-bold">规则结果</div><div className="mt-3 text-xs text-[var(--muted)]">{active.hard_fail_reasons.length ? active.hard_fail_reasons.map(reason => <div key={reason} className="mt-2 flex gap-2"><AlertTriangle className="size-4 text-[var(--warning)]" />{reason}</div>) : <div className="flex gap-2 text-[var(--success)]"><CheckCircle2 className="size-4" />已通过采购底线</div>}</div></CardContent></Card>{canTakeOver && <Button variant="accent" size="lg" className="w-full" onClick={() => void takeOver()}><Pause className="size-4" />停止 AI 并接管</Button>}{humanMode && active.classification === "negotiating" && <Button variant="outline" size="lg" className="w-full" onClick={() => void resumeAi()}><RotateCcw className="size-4" />恢复 AI 自动谈判</Button>}</div>
    </div>
  </div>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[var(--paper)] p-3"><div className="text-[var(--muted)]">{label}</div><div className="mt-1.5 truncate font-bold">{value}</div></div>; }
