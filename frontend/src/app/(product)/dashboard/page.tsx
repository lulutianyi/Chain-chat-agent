"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Bot, ChevronRight, Clock3, PackageCheck, PackagePlus, Pencil, RefreshCw, Save, UsersRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createProduct, disableProduct, getDashboardSummary, getManagedProducts, updateProduct, type DashboardSummary, type ManagedProduct } from "@/lib/api";
import { cn } from "@/lib/utils";

type MetricKey = "today" | "ai" | "qualified" | "saved";
const emptySummary: DashboardSummary = { today_received: 0, ai_active: 0, qualified: 0, minutes_saved: 0, items: [] };
const blankProduct = { name: "", category: "", description: "", target_price: "", hard_max_price: "", max_moq: "", max_lead_days: "14", max_payment_days: "30", handoff_score: "82", required_qualifications: "营业执照,质检报告", preferred_regions: "" };

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [online, setOnline] = useState(true);
  const [metric, setMetric] = useState<MetricKey>("today");
  const [productsOpen, setProductsOpen] = useState(false);
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(blankProduct);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => { try { setSummary(await getDashboardSummary()); setOnline(true); } catch { setOnline(false); } }, []);
  const loadProducts = useCallback(async () => { try { setProducts(await getManagedProducts()); setOnline(true); } catch { setOnline(false); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const metrics = [
    { key: "today" as const, label: "今日接待", value: summary.today_received, note: "今日新提交的供应商", icon: UsersRound },
    { key: "ai" as const, label: "AI 自动谈判中", value: summary.ai_active, note: "当前由 AI 继续沟通", icon: Bot },
    { key: "qualified" as const, label: "优质候选", value: summary.qualified, note: "已停止自动回复，待接管", icon: PackageCheck },
    { key: "saved" as const, label: "为您节省", value: `${Math.floor(summary.minutes_saved / 60)}h ${summary.minutes_saved % 60}m`, note: "按接待与 AI 回复估算", icon: Clock3 },
  ];
  const visibleItems = useMemo(() => summary.items.filter(item => metric === "saved" || (metric === "today" ? item.is_today : metric === "ai" ? item.status === "ai_active" : item.classification === "qualified")), [metric, summary.items]);
  const selectedMetric = metrics.find(item => item.key === metric)!;

  function editProduct(product?: ManagedProduct) {
    if (!product) { setEditingId(null); setForm(blankProduct); return; }
    setEditingId(product.id);
    setForm({ name: product.name, category: product.category, description: product.description, target_price: String(product.target_price), hard_max_price: String(product.hard_max_price), max_moq: String(product.max_moq), max_lead_days: String(product.max_lead_days), max_payment_days: String(product.max_payment_days), handoff_score: String(product.handoff_score), required_qualifications: product.required_qualifications.join(","), preferred_regions: product.preferred_regions.join(",") });
  }
  async function saveProduct() {
    setSaving(true); setNotice("");
    const base = { name: form.name.trim(), category: form.category.trim(), description: form.description.trim(), target_price: Number(form.target_price), hard_max_price: Number(form.hard_max_price), max_moq: Number(form.max_moq), max_lead_days: Number(form.max_lead_days), max_payment_days: Number(form.max_payment_days), handoff_score: Number(form.handoff_score), required_qualifications: form.required_qualifications.split(/[,，]/).map(v => v.trim()).filter(Boolean), preferred_regions: form.preferred_regions.split(/[,，]/).map(v => v.trim()).filter(Boolean) };
    try {
      const wasEditing = editingId !== null;
      if (editingId) { const old = products.find(p => p.id === editingId)!; await updateProduct(editingId, { ...base, active: old.active }); } else await createProduct(base);
      await loadProducts(); editProduct(); setNotice(wasEditing ? "商品已更新" : "商品已添加");
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); } finally { setSaving(false); }
  }
  async function toggleProduct(product: ManagedProduct) {
    try {
      if (product.active) await disableProduct(product.id); else await updateProduct(product.id, { ...product, active: true });
      await loadProducts(); setNotice(product.active ? "商品已停用，历史记录保留" : "商品已重新启用");
    } catch (error) { setNotice(error instanceof Error ? error.message : "操作失败"); }
  }

  return <div className="animate-rise space-y-6">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--accent-strong)]"><span className="h-px w-5 bg-[var(--accent)]" />商家管理后台</div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">采购工作台</h1><p className="mt-2 text-sm text-[var(--muted)]">统计由真实接待和谈判记录自动生成，点击卡片可查看对应明细。</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => void refresh()}><RefreshCw className="size-4" />刷新</Button><Button variant="accent" onClick={() => { setProductsOpen(true); void loadProducts(); editProduct(); }}><PackagePlus className="size-4" />商品库管理</Button></div></section>
    {!online && <div className="rounded-xl border border-[var(--warning)]/20 bg-[var(--warning-faint)] px-4 py-3 text-sm text-[var(--warning)]">后端暂未连接，当前不展示虚构数据。请启动后端后刷新。</div>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((s, i) => <button key={s.key} onClick={() => setMetric(s.key)} className="text-left"><Card className={cn("h-full transition hover:-translate-y-0.5 hover:shadow-md", metric === s.key && "border-[var(--accent)] ring-2 ring-[var(--accent-faint)]")}><CardContent className="p-5"><s.icon className={cn("size-5", i === 2 ? "text-[var(--success)]" : "text-[var(--accent)]")} /><div className="mt-5 text-3xl font-bold">{s.value}</div><div className="mt-1 text-sm font-semibold">{s.label}</div><div className="mt-3 flex items-center justify-between text-xs text-[var(--muted)]"><span>{s.note}</span><ChevronRight className="size-4" /></div></CardContent></Card></button>)}</section>
    <Card><CardHeader className="flex flex-row items-start justify-between"><div><h2 className="font-bold">{selectedMetric.label}明细</h2><p className="mt-1 text-xs text-[var(--muted)]">数据来自供应商提交与谈判状态，统计值本身无需手工修改。</p></div><Badge>{visibleItems.length} 条</Badge></CardHeader><CardContent className="pt-2">{metric === "saved" && <div className="mb-4 rounded-xl bg-[var(--paper)] p-4 text-xs leading-5 text-[var(--muted)]">节省时间采用透明估算：每次自动接待计 5 分钟，每条 AI 回复计 3 分钟。下方列出参与估算的记录。</div>}{visibleItems.length ? <div className="divide-y divide-[var(--line)]">{visibleItems.map(item => <div key={item.id} className="grid gap-3 py-4 sm:grid-cols-[1.2fr_1fr_.5fr_.7fr_auto] sm:items-center"><div><div className="text-sm font-semibold">{item.supplier}</div><div className="text-xs text-[var(--muted)]">{item.product}</div></div><div className="text-sm">¥{item.price} · {item.moq} 件</div><div className="font-bold">{item.score} 分</div><Badge className="w-fit">{item.status === "ai_active" ? "AI 谈判中" : item.classification === "qualified" ? "待人工接管" : "已结束"}</Badge><Link href={`/negotiate?id=${item.id}`} className="grid size-8 place-items-center rounded-lg border border-[var(--line)]"><ChevronRight className="size-4" /></Link></div>)}</div> : <div className="py-10 text-center text-sm text-[var(--muted)]">当前没有符合该栏目的真实记录</div>}</CardContent></Card>
    {productsOpen && <div className="fixed inset-0 z-50 flex justify-end bg-[var(--ink)]/35 backdrop-blur-sm" onMouseDown={() => setProductsOpen(false)}><div className="h-full w-full max-w-3xl overflow-y-auto bg-[var(--paper)] p-6 shadow-2xl" onMouseDown={e => e.stopPropagation()}><div className="flex items-start justify-between"><div><div className="text-xs font-semibold text-[var(--accent-strong)]">采购需求库</div><h2 className="mt-1 text-2xl font-bold">商品库管理</h2><p className="mt-2 text-sm text-[var(--muted)]">启用的商品会立即出现在供应商入口；停用只隐藏商品，不删除历史记录。</p></div><button onClick={() => setProductsOpen(false)} className="grid size-9 place-items-center rounded-xl border bg-white"><X className="size-4" /></button></div>
      {notice && <div className="mt-4 rounded-xl bg-[var(--accent-faint)] px-4 py-3 text-sm">{notice}</div>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.15fr]"><div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-bold">已有商品</h3><Button size="sm" variant="outline" onClick={() => editProduct()}><PackagePlus className="size-4" />新增</Button></div>{products.map(product => <Card key={product.id} className={cn(!product.active && "opacity-55")}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{product.name}</div><div className="mt-1 text-xs text-[var(--muted)]">{product.category} · 目标 ¥{product.target_price} · 起订上限 {product.max_moq}</div></div><Badge>{product.active ? "启用" : "停用"}</Badge></div><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => editProduct(product)}><Pencil className="size-3.5" />编辑</Button><Button size="sm" variant="outline" onClick={() => void toggleProduct(product)}><Archive className="size-3.5" />{product.active ? "停用" : "启用"}</Button></div></CardContent></Card>)}</div>
      <div><h3 className="font-bold">{editingId ? "修改商品" : "添加商品"}</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="商品名称" value={form.name} set={v => setForm({...form,name:v})}/><Field label="商品分类" value={form.category} set={v => setForm({...form,category:v})}/><Field label="目标采购价" value={form.target_price} set={v => setForm({...form,target_price:v})} number/><Field label="硬性价格上限" value={form.hard_max_price} set={v => setForm({...form,hard_max_price:v})} number/><Field label="最高起订量" value={form.max_moq} set={v => setForm({...form,max_moq:v})} number/><Field label="最长交期（天）" value={form.max_lead_days} set={v => setForm({...form,max_lead_days:v})} number/><Field label="转人工分数" value={form.handoff_score} set={v => setForm({...form,handoff_score:v})} number/><Field label="最长账期（天）" value={form.max_payment_days} set={v => setForm({...form,max_payment_days:v})} number/><div className="sm:col-span-2"><Field label="必备资质（逗号分隔）" value={form.required_qualifications} set={v => setForm({...form,required_qualifications:v})}/></div><div className="sm:col-span-2"><Field label="优先地区（逗号分隔）" value={form.preferred_regions} set={v => setForm({...form,preferred_regions:v})}/></div><label className="sm:col-span-2"><span className="text-xs font-semibold">商品说明</span><Textarea className="mt-2" value={form.description} onChange={e => setForm({...form,description:e.target.value})} /></label></div><Button variant="accent" className="mt-5 w-full" disabled={saving || !form.name || !form.category || !form.target_price || !form.hard_max_price || !form.max_moq} onClick={() => void saveProduct()}><Save className="size-4" />{saving ? "保存中…" : editingId ? "保存修改" : "添加并启用"}</Button></div></div>
    </div></div>}
  </div>;
}

function Field({ label, value, set, number = false }: { label: string; value: string; set: (value: string) => void; number?: boolean }) {
  return <label><span className="text-xs font-semibold">{label}</span><Input className="mt-2" type={number ? "number" : "text"} value={value} onChange={e => set(e.target.value)} /></label>;
}
