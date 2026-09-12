"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, Check, CheckCircle2, FileBadge2, PackageOpen, ShieldCheck, Sparkles, UploadCloud, X, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { evaluateSupplierOffer, getProductCatalog, getSupplierPhone, getSupplierToken, uploadQualificationFile, type ManagedProduct, type QualificationFile } from "@/lib/api";
import { QUALIFICATION_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type BottomLine = { label: string; spec: string; current: string; ok: boolean; hard: boolean };

export default function SupplierPage() {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [serverResult, setServerResult] = useState<{ hardPass: boolean; score: number; level: string; negotiationId: number | null; classification?: string; hardFailReasons?: string[] } | null>(null);
  const [apiStatus, setApiStatus] = useState<"idle" | "saved" | "local">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [productId, setProductId] = useState<number | null>(null);
  const [form, setForm] = useState({ company: "", contact: "", phone: "", price: "", moq: "", region: "", leadTime: "", payment: "", cooperation: "" });
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [qualFiles, setQualFiles] = useState<QualificationFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qualsNeedFiles = qualifications.length > 0 && qualFiles.length === 0;
  const product = products.find((p) => p.id === productId);
  const isReady = Boolean(product && form.company.trim() && form.contact.trim() && form.phone.trim() && form.price && form.moq && form.region.trim() && form.leadTime && form.payment && !qualsNeedFiles);
  const router = useRouter();

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError("");
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadQualificationFile(file, form.company);
        setQualFiles((current) => [...current, uploaded]);
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "上传失败，请重试");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    if (!getSupplierToken()) {
      const next = window.location.pathname + window.location.search;
      router.replace(`/supplier/login?next=${encodeURIComponent(next)}`);
      return;
    }
    const phone = getSupplierPhone();
    if (phone) setForm((f) => ({ ...f, phone }));
  }, [router]);

  useEffect(() => {
    getProductCatalog().then(items => { setProducts(items); setProductId(items[0]?.id ?? null); }).catch(() => setProducts([])).finally(() => setProductsLoading(false));
  }, []);

  // 提交前「底线对照」：只校验采购方设定的硬性底线（与后端 enforce_hard_rules 同口径），
  // 不再在前端复刻评分公式；最终评分与分类以提交后系统返回为准。
  const result = useMemo(() => {
    const checks: BottomLine[] = [];
    if (product) {
      const price = form.price === "" ? null : Number(form.price);
      const moq = form.moq === "" ? null : Number(form.moq);
      const leadDays = form.leadTime === "" ? null : Number(form.leadTime);
      const payment = form.payment === "" ? null : Number(form.payment);
      const hasRequired = product.required_qualifications.every((q) => qualifications.includes(q));
      const inPreferredRegion = !product.preferred_regions.length || product.preferred_regions.some((r) => form.region.includes(r));
      checks.push(
        { label: "报价上限", spec: `≤ ¥${product.hard_max_price}`, current: price === null ? "未填" : `¥${price}`, ok: price !== null && price <= product.hard_max_price, hard: true },
        { label: "起订量上限", spec: `≤ ${product.max_moq} 件`, current: moq === null ? "未填" : `${moq} 件`, ok: moq !== null && moq <= product.max_moq, hard: true },
        { label: "备货周期", spec: `≤ ${product.max_lead_days} 天`, current: leadDays === null ? "未填" : `${leadDays} 天`, ok: leadDays !== null && leadDays <= product.max_lead_days, hard: true },
        { label: "账期", spec: `≤ ${product.max_payment_days} 天`, current: payment === null ? "未填" : `${payment} 天`, ok: payment !== null && payment <= product.max_payment_days, hard: true },
        { label: "必备资质", spec: product.required_qualifications.length ? product.required_qualifications.join("、") : "无要求", current: product.required_qualifications.length ? `${product.required_qualifications.filter((q) => qualifications.includes(q)).length}/${product.required_qualifications.length}` : "—", ok: hasRequired, hard: true },
        { label: "目标采购价", spec: `≤ ¥${product.target_price}`, current: price === null ? "未填" : `¥${price}`, ok: price !== null && price <= product.target_price, hard: false },
        { label: "产地偏好", spec: product.preferred_regions.length ? product.preferred_regions.join("、") : "不限地区", current: form.region ? (product.preferred_regions.length ? (inPreferredRegion ? "优先区域" : "普通区域") : "不限") : "未填", ok: inPreferredRegion, hard: false },
      );
    }
    const hardPass = product ? checks.filter((c) => c.hard).every((c) => c.ok) : false;
    return { hardPass, checks };
  }, [form.price, form.moq, form.leadTime, form.payment, form.region, product, qualifications]);

  function toggleQualification(value: string) {
    setQualifications((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  const evaluateAndSubmit = useCallback(async () => {
    if (!product) return null;
    setSubmitting(true);
    try {
      const response = await evaluateSupplierOffer({
        product_id: product.id,
        company_name: form.company,
        contact_name: form.contact,
        phone: form.phone,
        region: form.region,
        quoted_price: Number(form.price),
        moq: Number(form.moq),
        lead_days: Number(form.leadTime),
        payment_days: Number(form.payment),
        qualifications,
        qualification_file_ids: qualFiles.map((file) => file.id),
        cooperation_note: form.cooperation,
        cooperation_rating: form.cooperation.length > 24 ? 90 : 60,
      });
      setServerResult({
        hardPass: response.hard_pass,
        score: response.score,
        level: response.classification === "qualified" ? "优质候选" : response.classification === "negotiating" ? "可进入议价" : "不匹配",
        negotiationId: response.negotiation_id,
        classification: response.classification,
        hardFailReasons: response.hard_fail_reasons,
      });
      setApiStatus("saved");
      return response;
    } catch {
      setServerResult({
        hardPass: result.hardPass,
        score: 0,
        level: result.hardPass ? "已通过底线" : "未通过底线",
        negotiationId: null,
        classification: result.hardPass ? "negotiating" : "eliminated",
        hardFailReasons: result.checks.filter((c) => c.hard && !c.ok).map((c) => `${c.label} ${c.spec}（当前：${c.current}）`),
      });
      setApiStatus("local");
      return null;
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }, [form, product, qualifications, qualFiles, result]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    await evaluateAndSubmit();
  }

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "evaluate_current_supplier_offer",
        title: "评估当前供货方案",
        description: "校验供应商页面当前已填写的报价、起订量、资质、地区和配合方案，并在页面中展示分类结果。",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute() {
          if (!isReady || Number(form.price) <= 0 || Number(form.moq) <= 0) {
            throw new Error("请先完整填写供应商、联系方式、报价、起订量、地区和备货周期。");
          }
          const saved = await evaluateAndSubmit();
          return { status: saved ? "saved" : "local_demo", product: product?.name ?? "", score: saved?.score ?? null, classification: saved?.classification ?? (result.hardPass ? "negotiating" : "eliminated") };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch {
      return;
    }
    return () => lifecycle.abort();
  }, [evaluateAndSubmit, form.company, form.moq, form.price, isReady, product?.name, result.hardPass]);

  if (submitted && serverResult) {
    const displayResult = serverResult;
    return <div className="animate-rise mx-auto max-w-3xl py-8 sm:py-16"><Card className="overflow-hidden"><div className="h-2 bg-[var(--accent)]" /><CardContent className="p-7 sm:p-10"><div className={cn("grid size-14 place-items-center rounded-2xl", displayResult.hardPass ? "bg-[var(--success-faint)] text-[var(--success)]" : "bg-[var(--danger-faint)] text-[var(--danger)]")}>{displayResult.hardPass ? <CheckCircle2 className="size-7" /> : <XCircle className="size-7" />}</div><Badge className={cn("mt-6", displayResult.score >= 82 ? "border-[var(--success)]/20 bg-[var(--success-faint)] text-[var(--success)]" : displayResult.hardPass ? "border-[var(--warning)]/20 bg-[var(--warning-faint)] text-[var(--warning)]" : "border-[var(--danger)]/20 bg-[var(--danger-faint)] text-[var(--danger)]")}>{displayResult.level}·{displayResult.score} 分</Badge><h1 className="mt-4 text-3xl font-bold tracking-tight">{displayResult.hardPass ? "资料已通过底线校验" : "当前条件与采购需求不匹配"}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">{displayResult.score >= 82 ? "你的报价、起订量、资质和配合方案综合表现良好。系统已停止自动承诺，并提醒店长进入深度沟通。" : displayResult.hardPass ? "资料已入库，AI 将围绕价格、起订量与交付条款继续洽谈。在评分达到人工阈值前，不会打扰店长。" : "系统根据采购方的硬性规则停止了本次洽谈。你可调整起订量、补齐资质或优化报价后重新提交。"}</p>
        {!!displayResult.hardFailReasons?.length && !displayResult.hardPass && <div className="mt-5 rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger-faint)] p-4"><div className="text-sm font-bold text-[var(--danger)]">未通过项（硬性底线一票否决）</div><div className="mt-2 space-y-1.5 text-sm leading-6 text-[var(--danger)]">{displayResult.hardFailReasons.map(reason => <div key={reason}>· {reason}</div>)}</div></div>}
        <div className={cn("mt-5 rounded-xl px-3 py-2 text-xs", apiStatus === "saved" ? "bg-[var(--success-faint)] text-[var(--success)]" : "bg-[var(--warning-faint)] text-[var(--warning)]")}>{apiStatus === "saved" ? "已写入供应商与谈判记录库" : "当前为前端演示结果；启动后端后将自动写入数据库"}</div>
        <div className="mt-7 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-[var(--paper)] p-4"><div className="text-xs text-[var(--muted)]">报价</div><div className="mt-1 font-bold">¥{form.price} / 件</div></div><div className="rounded-xl bg-[var(--paper)] p-4"><div className="text-xs text-[var(--muted)]">起订量</div><div className="mt-1 font-bold">{form.moq} 件</div></div><div className="rounded-xl bg-[var(--paper)] p-4"><div className="text-xs text-[var(--muted)]">资质完整度</div><div className="mt-1 font-bold">{qualifications.length} / 3</div></div></div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">{displayResult.hardPass && serverResult?.classification === "negotiating" && serverResult.negotiationId && <Link href={`/supplier/chat?id=${serverResult.negotiationId}`} className="flex-1"><Button variant="accent" size="lg" className="w-full"><Sparkles className="size-4" />进入 AI 洽谈 <ArrowRight className="size-4" /></Button></Link>}{displayResult.hardPass && serverResult?.classification === "qualified" && <div className="flex-1 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent-faint)] p-4 text-sm text-[var(--muted)]">已判定为优质候选，AI 已停止自动回复，商家将与你进一步沟通。</div>}{displayResult.hardPass && serverResult?.negotiationId && <Link href={`/negotiate?id=${serverResult.negotiationId}&view=supplier-test`} className="flex-1"><Button variant="outline" size="lg" className="w-full"><Sparkles className="size-4" />扮演该供应商开始洽谈 <ArrowRight className="size-4" /></Button></Link>}<Button variant="outline" size="lg" className="flex-1" onClick={() => { setSubmitted(false); setServerResult(null); }}>返回修改资料</Button></div>
      </CardContent></Card></div>;
  }

  return (
    <div className="animate-rise mx-auto max-w-6xl">
      <div className="mb-6 grid gap-5 lg:grid-cols-[1fr_320px] lg:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--accent-strong)]"><span className="h-px w-5 bg-[var(--accent)]" />供应商自助入口</div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">提交供货方案</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">如实填写报价、起订量、资质与配合方案。系统将自动匹配当前采购需求，合适的方案可直接进入 AI 洽谈。</p></div><div className="rounded-2xl border border-[var(--success)]/20 bg-[var(--success-faint)] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[var(--success)]"><ShieldCheck className="size-4" />底线规则由程序校验</div><p className="mt-1.5 text-[11px] leading-5 text-[var(--muted)]">AI 只负责理解与表达，不会绕过采购方设置的硬性条件。</p></div></div>

      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card><CardContent className="p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[var(--ink)] text-sm font-bold text-white">01</span><div><h2 className="font-bold">选择供货商品</h2><p className="mt-0.5 text-xs text-[var(--muted)]">来自采购方在工作台启用的商品库</p></div></div>{productsLoading ? <div className="mt-5 text-sm text-[var(--muted)]">正在读取商品库…</div> : products.length ? <div className="mt-5 grid gap-3 sm:grid-cols-3">{products.map((p) => <button type="button" key={p.id} onClick={() => setProductId(p.id)} className={cn("rounded-xl border p-4 text-left transition", p.id === productId ? "border-[var(--accent)] bg-[var(--accent-faint)]/50 ring-2 ring-[var(--accent-faint)]" : "border-[var(--line)] bg-white hover:border-[var(--ink)]")}><div className="flex items-start justify-between gap-2"><PackageOpen className={cn("size-5", p.id === productId ? "text-[var(--accent)]" : "text-[var(--muted)]")} />{p.id === productId && <Check className="size-4 text-[var(--accent)]" />}</div><div className="mt-4 text-sm font-bold">{p.name}</div><div className="mt-1 text-[11px] text-[var(--muted)]">{p.category}</div></button>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-[var(--line)] p-5 text-sm text-[var(--muted)]">采购方尚未启用商品，请先在工作台的“商品库管理”中添加。</div>}</CardContent></Card>

          <Card><CardContent className="p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[var(--ink)] text-sm font-bold text-white">02</span><div><h2 className="font-bold">供应商基本信息</h2><p className="mt-0.5 text-xs text-[var(--muted)]">请手动填写，用于资质校验与后续联系</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="text-xs font-semibold">企业名称</span><Input className="mt-2" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="请输入供应商或企业名称" required /></label><label><span className="text-xs font-semibold">联系人</span><Input className="mt-2" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="请输入联系人" required /></label><label><span className="text-xs font-semibold">联系电话</span><Input className="mt-2" value={form.phone} readOnly placeholder="已绑定登录手机号" /></label><label><span className="text-xs font-semibold">所在地区</span><Input className="mt-2" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="例如：福建泉州" required /></label><label><span className="text-xs font-semibold">备货周期</span><div className="relative mt-2"><Input type="number" min="1" value={form.leadTime} onChange={(e) => setForm({ ...form, leadTime: e.target.value })} className="pr-12" placeholder="请输入天数" required /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">天</span></div></label></div></CardContent></Card>

          <Card><CardContent className="p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[var(--ink)] text-sm font-bold text-white">03</span><div><h2 className="font-bold">报价、起订量与配合方案</h2><p className="mt-0.5 text-xs text-[var(--muted)]">请手动填写你可以真正履约的条件</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className="text-xs font-semibold">含税单价</span><div className="relative mt-2"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">¥</span><Input type="number" min="0.01" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="pl-7 pr-16" placeholder="请输入报价" required /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">元/件</span></div></label><label><span className="text-xs font-semibold">最低起订量</span><div className="relative mt-2"><Input type="number" min="1" value={form.moq} onChange={(e) => setForm({ ...form, moq: e.target.value })} className="pr-12" placeholder="请输入数量" required /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">件</span></div></label><label><span className="text-xs font-semibold">账期</span><div className="relative mt-2"><Input type="number" min="0" value={form.payment} onChange={(e) => setForm({ ...form, payment: e.target.value })} className="pr-12" placeholder="请输入天数" required /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">天</span></div></label><label className="sm:col-span-2"><span className="text-xs font-semibold">合作与售后方案</span><Textarea className="mt-2" value={form.cooperation} onChange={(e) => setForm({ ...form, cooperation: e.target.value })} placeholder="可选填：是否支持小批测款、退换政策、二单排产等" /></label></div></CardContent></Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Card><CardContent className="p-5"><div className="flex items-center gap-2 text-sm font-bold"><FileBadge2 className="size-4 text-[var(--accent)]" />资质与能力</div><div className="mt-4 space-y-2">{QUALIFICATION_OPTIONS.map((q) => <button type="button" key={q} onClick={() => toggleQualification(q)} className={cn("flex w-full items-center justify-between rounded-xl border p-3 text-sm font-medium", qualifications.includes(q) ? "border-[var(--success)]/20 bg-[var(--success-faint)] text-[var(--success)]" : "border-[var(--line)] bg-white text-[var(--muted)]")}><span>{q}</span><span className={cn("grid size-5 place-items-center rounded-md border", qualifications.includes(q) ? "border-[var(--success)] bg-[var(--success)] text-white" : "border-[var(--line)]")} >{qualifications.includes(q) && <Check className="size-3" />}</span></button>)}</div><input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
<button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line)] p-3 text-xs font-semibold text-[var(--muted)] hover:border-[var(--ink)] disabled:opacity-60"><UploadCloud className="size-4" />{uploading ? "正在上传…" : "上传资质文件（图片或 PDF，供商家人工核验）"}</button>
{uploadError && <div className="mt-2 text-[11px] font-semibold text-[var(--warning)]">{uploadError}</div>}
{qualsNeedFiles && <div className="mt-2 text-[11px] font-semibold text-[var(--warning)]">已勾选资质，请至少上传一份资质文件后提交</div>}
{!!qualFiles.length && <div className="mt-3 space-y-2">{qualFiles.map((file) => <div key={file.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs"><div className="min-w-0 flex-1"><div className="truncate font-medium">{file.original_name}</div><div className="mt-0.5 flex items-center gap-1.5 text-[10px]">{file.ocr_status === "passed" && <span className="shrink-0 rounded-md bg-[var(--success-faint)] px-1.5 py-0.5 font-bold text-[var(--success)]">识别一致</span>}{file.ocr_status === "mismatch" && <span className="shrink-0 rounded-md bg-[var(--danger-faint)] px-1.5 py-0.5 font-bold text-[var(--danger)]">识别不一致</span>}{(file.ocr_status === "not_applicable" || file.ocr_status === "unavailable" || file.ocr_status === "not_checked") && <span className="shrink-0 rounded-md bg-[var(--warning-faint)] px-1.5 py-0.5 font-bold text-[var(--warning)]">转人工核验</span>}<span className="truncate text-[var(--muted)]">{file.ocr_detail}</span></div></div><span className="flex shrink-0 items-center gap-2 text-[var(--muted)]"><span>{Math.max(1, Math.round(file.size_bytes / 1024))} KB</span><button type="button" aria-label="移除文件" onClick={() => setQualFiles((current) => current.filter((f) => f.id !== file.id))} className="grid size-5 place-items-center rounded-md border border-[var(--line)] hover:border-[var(--ink)]"><X className="size-3" /></button></span></div>)}</div>}</CardContent></Card>
          <Card className="overflow-hidden bg-[var(--ink)] text-white"><CardContent className="p-5"><div className="flex items-center justify-between"><div className="text-xs font-semibold text-white/55">提交前底线对照</div><ShieldCheck className="size-4 text-[var(--accent)]" /></div><p className="mt-1.5 text-[11px] leading-4 text-white/40">只校验采购方设定的硬性底线，不再预估分数；最终分类以提交后系统判定为准。</p>{product ? <><div className="mt-4 flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs"><span className="text-white/55">硬性底线</span><span className={cn("font-bold", result.hardPass ? "text-[#6fd3a8]" : "text-[#f0b09b]")}>{result.hardPass ? "全部满足" : `${result.checks.filter((c) => c.hard && !c.ok).length} 项未达标`}</span></div><div className="mt-3 space-y-2.5 border-t border-white/10 pt-3 text-xs">{result.checks.filter((c) => c.hard).map((c) => <div key={c.label} className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-semibold">{c.label}</div><div className="text-[10px] text-white/45">{c.spec}</div></div><div className="flex shrink-0 items-center gap-1.5"><span className={cn(!c.ok && "text-[#f0b09b]")}>{c.current}</span>{c.ok ? <Check className="size-3.5 text-[#6fd3a8]" /> : <X className="size-3.5 text-[#f0b09b]" />}</div></div>)}</div><div className="mt-4 border-t border-white/10 pt-3"><div className="text-[10px] font-semibold text-white/40">参考目标（不构成一票否决）</div><div className="mt-2 space-y-2.5">{result.checks.filter((c) => !c.hard).map((c) => <div key={c.label} className="flex items-center justify-between gap-3 text-xs"><div className="min-w-0"><div className="font-semibold text-white/80">{c.label}</div><div className="text-[10px] text-white/45">{c.spec}</div></div><div className="flex shrink-0 items-center gap-1.5"><span className={cn(!c.ok && "text-[#f0b09b]")}>{c.current}</span>{c.ok ? <Check className="size-3.5 text-[#6fd3a8]" /> : <X className="size-3.5 text-[#f0b09b]" />}</div></div>)}</div></div></> : <div className="mt-4 text-xs text-white/45">请先选择供货商品。</div>}</CardContent></Card>
          <Button type="submit" variant="accent" size="lg" className="w-full" disabled={submitting || !isReady}><Building2 className="size-4" />{submitting ? "正在校验…" : isReady ? "校验并提交方案" : "请先完整填写必填项"}</Button>
          <p className="text-center text-[10px] leading-4 text-[var(--muted)]">提交即表示你确认信息真实。系统会将报价和谈判记录用于本次供应商评估。</p>
        </div>
      </form>
    </div>
  );
}
