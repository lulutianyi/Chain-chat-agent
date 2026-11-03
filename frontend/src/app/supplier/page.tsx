"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  FileBadge2,
  PackageOpen,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { evaluateSupplierOffer, forceLoginRedirect, getProductCatalog, getSupplierPhone, getSupplierToken, isAuthError, uploadQualificationFile, type ManagedProduct, type QualificationFile } from "@/lib/api";
import { DEBUG_TOOLS_ENABLED, QUALIFICATION_OPTIONS } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/client";
import { qualificationLabel } from "@/lib/i18n/enums";
import { format, unitWord } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

type BottomLine = { label: string; spec: string; current: string; ok: boolean; hard: boolean; hint?: string };

const EMPTY_FORM = { company: "", contact: "", phone: "", price: "", moq: "", region: "", leadTime: "", payment: "", cooperation: "" };

export default function SupplierPage() {
  const { locale, d } = useI18n();
  const t = d.supplier;
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [serverResult, setServerResult] = useState<{ hardPass: boolean; score: number; level: string; negotiationId: number | null; classification?: string; hardFailReasons?: string[] } | null>(null);
  const [apiStatus, setApiStatus] = useState<"idle" | "saved" | "local">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [productId, setProductId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [qualFiles, setQualFiles] = useState<QualificationFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showAllChecks, setShowAllChecks] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const product = products.find((p) => p.id === productId);
  const qualsNeedFiles = qualifications.length > 0 && qualFiles.length === 0;

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
    getProductCatalog()
      .then((items) => { setProducts(items); setProductId(items[0]?.id ?? null); })
      .catch((e) => {
        // 令牌失效（默认 30 天到期，或已在别处登出）必须回登录页：
        // 此前这里静默置空，页面会显示「采购方尚未启用商品」这种误导性的空态，
        // 用户根本看不出是自己需要重新登录。
        if (isAuthError(e)) {
          forceLoginRedirect("supplier", window.location.pathname + window.location.search);
          return;
        }
        setProducts([]);
      })
      .finally(() => setProductsLoading(false));
  }, []);

  // 必填项逐项判定，用于字段级提示与完成度进度，而不是只在提交时给一个总布尔值。
  const requiredFields = useMemo(() => ([
    { key: "product", label: t.offer.required.product, ok: Boolean(product) },
    { key: "company", label: t.offer.required.company, ok: Boolean(form.company.trim()) },
    { key: "contact", label: t.offer.required.contact, ok: Boolean(form.contact.trim()) },
    { key: "region", label: t.offer.required.region, ok: Boolean(form.region.trim()) },
    { key: "leadTime", label: t.offer.required.leadTime, ok: Boolean(form.leadTime) },
    { key: "price", label: t.offer.required.price, ok: Boolean(form.price) },
    { key: "moq", label: t.offer.required.moq, ok: Boolean(form.moq) },
    { key: "payment", label: t.offer.required.payment, ok: Boolean(form.payment) },
  ]), [product, form.company, form.contact, form.region, form.leadTime, form.price, form.moq, form.payment, t]);

  const missingFields = requiredFields.filter((item) => !item.ok);
  const doneCount = requiredFields.length - missingFields.length;
  const missingKey = (key: string) => missingFields.some((item) => item.key === key);
  const isReady = missingFields.length === 0 && !qualsNeedFiles;

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
      setUploadError(e instanceof Error ? e.message : t.offer.errors.upload);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleQualification(value: string) {
    setQualifications((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  // 提交前「底线对照」：只校验采购方设定的硬性底线（与后端 enforce_hard_rules 同口径），
  // 不再在前端复刻评分公式；最终评分与分类以提交后系统返回为准。
  const result = useMemo(() => {
    const checks: BottomLine[] = [];
    const c = t.offer.checks;
    const sep = t.listSeparator;
    const qualLabel = (q: string) => qualificationLabel(q, locale);
    if (product) {
      const price = form.price === "" ? null : Number(form.price);
      const moq = form.moq === "" ? null : Number(form.moq);
      const leadDays = form.leadTime === "" ? null : Number(form.leadTime);
      const payment = form.payment === "" ? null : Number(form.payment);
      const hasRequired = product.required_qualifications.every((q) => qualifications.includes(q));
      const missingQuals = product.required_qualifications.filter((q) => !qualifications.includes(q));
      const inPreferredRegion = !product.preferred_regions.length || product.preferred_regions.some((r) => form.region.includes(r));
      // 已经填了数字但未达标时，直接算出「还差多少」，比只显示红色叉号可操作得多。
      // 单位是以变量传进模板的，享受不到 format 的「{count:one|many}」语法，
      // 所以在这里按数量先把单位词选好（中文单位没有 `|`，unitWord 会原样返回）。
      const gap = (value: number | null, limit: number, unit: string, direction: "down" | "up") => {
        if (value === null) return format(c.gapNeedBelow, { limit, unit: unitWord(unit, limit) });
        const delta = direction === "down" ? value - limit : limit - value;
        if (delta <= 0) return undefined;
        const rounded = Math.round(delta * 100) / 100;
        const word = unitWord(unit, rounded);
        return direction === "down"
          ? format(c.gapLower, { delta: rounded, unit: word })
          : format(c.gapRaise, { delta: rounded, unit: word });
      };
      checks.push(
        { label: c.priceCap, spec: format(c.specMaxPrice, { value: product.hard_max_price }), current: price === null ? c.notFilled : `¥${price}`, ok: price !== null && price <= product.hard_max_price, hard: true, hint: price !== null && price > product.hard_max_price ? gap(price, product.hard_max_price, t.offer.units.yuan, "down") : undefined },
        { label: c.moqCap, spec: format(c.specMaxPieces, { value: product.max_moq }), current: moq === null ? c.notFilled : format(t.offer.units.pieces, { value: moq }), ok: moq !== null && moq <= product.max_moq, hard: true, hint: moq !== null && moq > product.max_moq ? gap(moq, product.max_moq, t.offer.units.piece, "down") : undefined },
        { label: c.leadTime, spec: format(c.specMaxDays, { value: product.max_lead_days }), current: leadDays === null ? c.notFilled : format(t.offer.units.days, { value: leadDays }), ok: leadDays !== null && leadDays <= product.max_lead_days, hard: true, hint: leadDays !== null && leadDays > product.max_lead_days ? gap(leadDays, product.max_lead_days, t.offer.units.day, "down") : undefined },
        { label: c.payment, spec: format(c.specMinDays, { value: product.max_payment_days }), current: payment === null ? c.notFilled : format(t.offer.units.days, { value: payment }), ok: payment !== null && payment >= product.max_payment_days, hard: true, hint: payment !== null && payment < product.max_payment_days ? gap(payment, product.max_payment_days, t.offer.units.day, "up") : undefined },
        { label: c.quals, spec: product.required_qualifications.length ? product.required_qualifications.map(qualLabel).join(sep) : c.specNone, current: product.required_qualifications.length ? `${product.required_qualifications.filter((q) => qualifications.includes(q)).length}/${product.required_qualifications.length}` : "—", ok: hasRequired, hard: true, hint: missingQuals.length ? format(c.missingQuals, { list: missingQuals.map(qualLabel).join(sep) }) : undefined },
        { label: c.targetPrice, spec: format(c.specMaxPrice, { value: product.target_price }), current: price === null ? c.notFilled : `¥${price}`, ok: price !== null && price <= product.target_price, hard: false, hint: c.softHint },
        { label: c.region, spec: product.preferred_regions.length ? product.preferred_regions.join(sep) : c.specAnyRegion, current: form.region ? (product.preferred_regions.length ? (inPreferredRegion ? c.regionPreferred : c.regionNormal) : c.regionAny) : c.notFilled, ok: inPreferredRegion, hard: false, hint: c.softHint },
      );
    }
    const hardPass = product ? checks.filter((check) => check.hard).every((check) => check.ok) : false;
    return { hardPass, checks };
  }, [form.price, form.moq, form.leadTime, form.payment, form.region, product, qualifications, t, locale]);

  const hardChecks = result.checks.filter((c) => c.hard);
  const softChecks = result.checks.filter((c) => !c.hard);
  const failedHard = hardChecks.filter((c) => !c.ok);

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
        level: response.classification === "qualified" ? t.offer.classification.topCandidate : response.classification === "negotiating" ? t.offer.classification.negotiating : t.offer.classification.notMatch,
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
        level: result.hardPass ? t.offer.classification.hardPassed : t.offer.classification.hardFailed,
        negotiationId: null,
        classification: result.hardPass ? "negotiating" : "eliminated",
        hardFailReasons: failedHard.map((check) => format(t.offer.result.reason, { label: check.label, spec: check.spec, current: check.current })),
      });
      setApiStatus("local");
      return null;
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }, [form, product, qualifications, qualFiles, result, failedHard, t]);

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
        title: t.offer.tool.title,
        description: t.offer.tool.description,
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute() {
          if (!isReady || Number(form.price) <= 0 || Number(form.moq) <= 0) {
            throw new Error(t.offer.tool.incomplete);
          }
          const saved = await evaluateAndSubmit();
          return { status: saved ? "saved" : "local_demo", product: product?.name ?? "", score: saved?.score ?? null, classification: saved?.classification ?? (result.hardPass ? "negotiating" : "eliminated") };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch {
      return;
    }
    return () => lifecycle.abort();
  }, [evaluateAndSubmit, form.company, form.moq, form.price, isReady, product?.name, result.hardPass, t]);

  /* ——— 提交结果页 ——— */
  if (submitted && serverResult) {
    const displayResult = serverResult;
    const passed = displayResult.hardPass;
    const isTop = passed && displayResult.score >= (product?.handoff_score ?? 82);
    return (
      <div className="animate-rise mx-auto max-w-3xl py-8 sm:py-16">
        <Card className="overflow-hidden">
          <div className="h-2 bg-[var(--accent)]" />
          <CardContent className="p-7 sm:p-10">
            <div className={cn("grid size-14 place-items-center rounded-[var(--radius-card)]", passed ? "bg-[var(--success-faint)] text-[var(--success)]" : "bg-[var(--danger-faint)] text-[var(--danger)]")}>
              {passed ? <CheckCircle2 className="size-7" /> : <XCircle className="size-7" />}
            </div>
            <Badge className={cn("mt-6", isTop ? "border-[var(--success)]/20 bg-[var(--success-faint)] text-[var(--success)]" : passed ? "border-[var(--warning)]/20 bg-[var(--warning-faint)] text-[var(--warning)]" : "border-[var(--danger)]/20 bg-[var(--danger-faint)] text-[var(--danger)]")}>
              {displayResult.level} · <span className="tnum">{displayResult.score}</span> {t.offer.result.scoreSuffix}
            </Badge>
            <h1 className="mt-4 text-[28px] font-bold tracking-tight">
              {passed ? t.offer.result.passTitle : t.offer.result.failTitle}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
              {isTop
                ? t.offer.result.topBody
                : passed
                  ? t.offer.result.passedBody
                  : t.offer.result.failedBody}
            </p>
            {!!displayResult.hardFailReasons?.length && !passed && (
              <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--danger)]/20 bg-[var(--danger-faint)] p-4">
                <div className="text-sm font-bold text-[var(--danger)]">{t.offer.result.adjustTitle}</div>
                <div className="mt-2 space-y-1.5 text-sm leading-6 text-[var(--danger)]">
                  {displayResult.hardFailReasons.map((reason) => <div key={reason}>· {reason}</div>)}
                </div>
              </div>
            )}
            <div className={cn("mt-5 rounded-[var(--radius-control)] px-3 py-2 text-xs", apiStatus === "saved" ? "bg-[var(--success-faint)] text-[var(--success)]" : "bg-[var(--warning-faint)] text-[var(--warning)]")}>
              {apiStatus === "saved" ? t.offer.result.savedNote : t.offer.result.localNote}
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[var(--radius-control)] bg-[var(--paper)] p-4">
                <div className="text-xs text-[var(--muted)]">{t.offer.result.summaryPrice}</div>
                <div className="tnum mt-1 font-bold">{format(t.offer.result.pricePerPiece, { price: form.price })}</div>
              </div>
              <div className="rounded-[var(--radius-control)] bg-[var(--paper)] p-4">
                <div className="text-xs text-[var(--muted)]">{t.offer.result.summaryMoq}</div>
                <div className="tnum mt-1 font-bold">{format(t.offer.result.pieceCount, { value: form.moq })}</div>
              </div>
              <div className="rounded-[var(--radius-control)] bg-[var(--paper)] p-4">
                <div className="text-xs text-[var(--muted)]">{t.offer.result.summaryQuals}</div>
                <div className="tnum mt-1 font-bold">{qualifications.length} / {QUALIFICATION_OPTIONS.length}</div>
              </div>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {serverResult.negotiationId && (
                <Link href={`/supplier/chat?id=${serverResult.negotiationId}`} className="flex-1">
                  <Button variant="accent" size="lg" className="w-full">
                    <Sparkles className="size-4" />{t.offer.result.enterChat} <ArrowRight className="size-4" />
                  </Button>
                </Link>
              )}
              {isTop && (
                <div className="flex-1 rounded-[var(--radius-control)] border border-[var(--accent)]/20 bg-[var(--accent-faint)] p-4 text-sm text-[var(--muted)]">
                  {t.offer.result.topNote}
                </div>
              )}
              {DEBUG_TOOLS_ENABLED && serverResult.negotiationId && (
                <Link href={`/negotiate?id=${serverResult.negotiationId}&view=supplier-test`} className="flex-1">
                  <Button variant="outline" size="lg" className="w-full">
                    <Sparkles className="size-4" />{t.offer.result.impersonate} <ArrowRight className="size-4" />
                  </Button>
                </Link>
              )}
              <Button variant="outline" size="lg" className="flex-1" onClick={() => { setSubmitted(false); setServerResult(null); }}>
                {t.offer.result.backToEdit}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ——— 表单 ——— */
  return (
    <div className="animate-rise mx-auto max-w-6xl">
      <div className="mb-6 grid gap-5 lg:grid-cols-[1fr_320px] lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--accent-strong)]">
            <span className="h-px w-5 bg-[var(--accent)]" />
            {t.offer.meta.eyebrow}
          </div>
          <h1 className="text-[28px] font-bold tracking-tight">{t.offer.meta.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            {t.offer.meta.body}
          </p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-[var(--success)]/20 bg-[var(--success-faint)] p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--success)]">
            <ShieldCheck className="size-4" />
            {t.offer.meta.ruleTitle}
          </div>
          <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">{t.offer.meta.ruleBody}</p>
        </div>
      </div>

      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {/* 01 选择商品 */}
          <Card>
            <CardContent className="p-5 sm:p-6">
              <SectionTitle index="01" title={t.offer.section.product.title} note={t.offer.section.product.note} />
              {productsLoading ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-[var(--radius-control)] bg-[var(--paper)]" />)}
                </div>
              ) : products.length ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {products.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      aria-pressed={item.id === productId}
                      onClick={() => setProductId(item.id)}
                      className={cn(
                        "rounded-[var(--radius-control)] border p-4 text-left transition",
                        item.id === productId
                          ? "border-[var(--accent)] bg-[var(--accent-faint)]/50 ring-2 ring-[var(--accent-faint)]"
                          : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--ink)]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <PackageOpen className={cn("size-5", item.id === productId ? "text-[var(--accent)]" : "text-[var(--muted)]")} />
                        {item.id === productId && <Check className="size-4 text-[var(--accent)]" />}
                      </div>
                      <div className="mt-4 text-sm font-bold">{item.name}</div>
                      <div className="mt-1 text-xs text-[var(--muted)]">{item.category}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-[var(--radius-control)] border border-dashed border-[var(--line)] p-5 text-sm text-[var(--muted)]">
                  {t.offer.emptyProducts}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 02 基本信息 */}
          <Card>
            <CardContent className="p-5 sm:p-6">
              <SectionTitle index="02" title={t.offer.section.basics.title} note={t.offer.section.basics.note} />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label={t.offer.fields.company.label} required missing={missingKey("company")} error={t.offer.errors.company} className="sm:col-span-2">
                  <Input
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder={t.offer.fields.company.placeholder}
                    aria-invalid={missingKey("company")}
                  />
                </Field>
                <Field label={t.offer.fields.contact.label} required missing={missingKey("contact")} error={t.offer.errors.contact}>
                  <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder={t.offer.fields.contact.placeholder} aria-invalid={missingKey("contact")} />
                </Field>
                <Field label={t.offer.fields.phone.label} note={t.offer.fields.phone.note}>
                  <Input value={form.phone} readOnly placeholder={t.offer.fields.phone.placeholder} />
                </Field>
                <Field label={t.offer.fields.region.label} required missing={missingKey("region")} error={t.offer.errors.region}>
                  <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder={t.offer.fields.region.placeholder} aria-invalid={missingKey("region")} />
                </Field>
                <Field label={t.offer.fields.leadTime.label} required missing={missingKey("leadTime")} error={t.offer.errors.leadTime}>
                  <WithSuffix suffix={t.offer.fields.leadTime.suffix}>
                    <Input type="number" min="1" value={form.leadTime} onChange={(e) => setForm({ ...form, leadTime: e.target.value })} className="pr-12" placeholder={t.offer.fields.leadTime.placeholder} aria-invalid={missingKey("leadTime")} />
                  </WithSuffix>
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* 03 报价与合作 */}
          <Card>
            <CardContent className="p-5 sm:p-6">
              <SectionTitle index="03" title={t.offer.section.quote.title} note={t.offer.section.quote.note} />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label={t.offer.fields.price.label} required missing={missingKey("price")} error={t.offer.errors.price}>
                  <WithSuffix prefix="¥" suffix={t.offer.fields.price.suffix}>
                    <Input type="number" min="0.01" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="pl-7 pr-16" placeholder={t.offer.fields.price.placeholder} aria-invalid={missingKey("price")} />
                  </WithSuffix>
                </Field>
                <Field label={t.offer.fields.moq.label} required missing={missingKey("moq")} error={t.offer.errors.moq}>
                  <WithSuffix suffix={t.offer.fields.moq.suffix}>
                    <Input type="number" min="1" value={form.moq} onChange={(e) => setForm({ ...form, moq: e.target.value })} className="pr-12" placeholder={t.offer.fields.moq.placeholder} aria-invalid={missingKey("moq")} />
                  </WithSuffix>
                </Field>
                <Field label={t.offer.fields.payment.label} required missing={missingKey("payment")} error={t.offer.errors.payment}>
                  <WithSuffix suffix={t.offer.fields.payment.suffix}>
                    <Input type="number" min="0" value={form.payment} onChange={(e) => setForm({ ...form, payment: e.target.value })} className="pr-12" placeholder={t.offer.fields.payment.placeholder} aria-invalid={missingKey("payment")} />
                  </WithSuffix>
                </Field>
                <Field label={t.offer.fields.cooperation.label} className="sm:col-span-2">
                  <Textarea value={form.cooperation} onChange={(e) => setForm({ ...form, cooperation: e.target.value })} placeholder={t.offer.fields.cooperation.placeholder} />
                </Field>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右侧：完成度 → 资质 → 底线对照 → 提交 */}
        <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold">{t.offer.progress.title}</div>
                <span className="tnum text-xs font-semibold text-[var(--muted)]">{doneCount} / {requiredFields.length}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--paper-deep)]">
                <div
                  className={cn("h-full rounded-full transition-all", isReady ? "bg-[var(--success)]" : "bg-[var(--accent)]")}
                  style={{ width: `${(doneCount / requiredFields.length) * 100}%` }}
                />
              </div>
              {missingFields.length ? (
                <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                  {format(t.offer.progress.remaining, {
                    count: missingFields.length,
                    list: missingFields.map((item) => item.label).join(t.listSeparator) + (qualsNeedFiles ? t.offer.progress.filesSuffix : ""),
                  })}
                </p>
              ) : (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--success)]">
                  <Check className="size-3.5" />{t.offer.progress.ready}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sm font-bold">
                <FileBadge2 className="size-4 text-[var(--accent)]" />
                {t.offer.quals.title}
              </div>
              <div className="mt-4 space-y-2">
                {QUALIFICATION_OPTIONS.map((q) => (
                  <button
                    type="button"
                    key={q}
                    aria-pressed={qualifications.includes(q)}
                    onClick={() => toggleQualification(q)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-[var(--radius-control)] border p-3 text-sm font-medium transition",
                      qualifications.includes(q)
                        ? "border-[var(--success)]/20 bg-[var(--success-faint)] text-[var(--success)]"
                        : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--ink)]",
                    )}
                  >
                    <span>{qualificationLabel(q, locale)}</span>
                    <span className={cn("grid size-5 place-items-center rounded border", qualifications.includes(q) ? "border-[var(--success)] bg-[var(--success)] text-white" : "border-[var(--line)]")}>
                      {qualifications.includes(q) && <Check className="size-3" />}
                    </span>
                  </button>
                ))}
              </div>

              {/* 勾选资质后立刻展开上传区，不用等提交时才被告知要传文件 */}
              {qualifications.length > 0 && (
                <div className="mt-3">
                  <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-[var(--accent)]/40 bg-[var(--accent-faint)]/40 p-3 text-xs font-semibold text-[var(--accent-strong)] transition hover:border-[var(--accent)] disabled:opacity-60"
                  >
                    <UploadCloud className="size-4" />
                    {uploading ? t.offer.quals.uploading : t.offer.quals.upload}
                  </button>
                  <p className="mt-1.5 text-[11px] leading-4 text-[var(--muted)]">{t.offer.quals.uploadHint}</p>
                  {uploadError && <div className="mt-2 text-[11px] font-semibold text-[var(--warning)]">{uploadError}</div>}
                  {qualsNeedFiles && <div className="mt-2 text-[11px] font-semibold text-[var(--warning)]">{t.offer.quals.needFile}</div>}
                </div>
              )}

              {!!qualFiles.length && (
                <div className="mt-3 space-y-2">
                  {qualFiles.map((file) => (
                    <div key={file.id} className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium" title={file.original_name}>{file.original_name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                            {file.ocr_status === "passed" && <span className="rounded bg-[var(--success-faint)] px-1.5 py-0.5 font-bold text-[var(--success)]">{t.offer.quals.ocrPassed}</span>}
                            {file.ocr_status === "mismatch" && <span className="rounded bg-[var(--danger-faint)] px-1.5 py-0.5 font-bold text-[var(--danger)]">{t.offer.quals.ocrMismatch}</span>}
                            {(file.ocr_status === "not_applicable" || file.ocr_status === "unavailable" || file.ocr_status === "not_checked") && <span className="rounded bg-[var(--warning-faint)] px-1.5 py-0.5 font-bold text-[var(--warning)]">{t.offer.quals.ocrManual}</span>}
                            <span className="tnum text-[var(--muted)]">{Math.max(1, Math.round(file.size_bytes / 1024))} KB</span>
                          </div>
                          {file.ocr_detail && <p className="mt-1 text-[11px] leading-4 text-[var(--muted)]">{file.ocr_detail}</p>}
                        </div>
                        <button
                          type="button"
                          aria-label={format(t.offer.quals.remove, { name: file.original_name })}
                          onClick={() => setQualFiles((current) => current.filter((f) => f.id !== file.id))}
                          className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-chip)] border border-[var(--line)] transition hover:border-[var(--ink)]"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <ShieldCheck className={cn("size-4", result.hardPass ? "text-[var(--success)]" : "text-[var(--muted)]")} />
                  {t.offer.bottomLine.title}
                </div>
                {product && (
                  <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", result.hardPass ? "bg-[var(--success-faint)] text-[var(--success)]" : failedHard.length ? "bg-[var(--warning-faint)] text-[var(--warning)]" : "bg-[var(--paper)] text-[var(--muted)]")}>
                    {!product ? "—" : result.hardPass ? t.offer.bottomLine.allMet : format(t.offer.bottomLine.shortBy, { count: failedHard.length })}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                {t.offer.bottomLine.note}
              </p>

              {product ? (
                <>
                  <div className="mt-4 space-y-2.5">
                    {hardChecks.map((c) => (
                      <div key={c.label} className="flex items-start justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="font-semibold">{c.label}</div>
                          <div className="tnum text-[11px] text-[var(--muted)]">{c.spec}</div>
                          {!c.ok && c.hint && (
                            <div className="mt-0.5 text-[11px] font-semibold text-[var(--warning)]">{c.hint}</div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className={cn("tnum", !c.ok && "text-[var(--warning)]")}>{c.current}</span>
                          {c.ok ? <Check className="size-3.5 text-[var(--success)]" /> : <X className="size-3.5 text-[var(--muted)]" />}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAllChecks((v) => !v)}
                    aria-expanded={showAllChecks}
                    className="mt-4 flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-strong)]"
                  >
                    <ChevronDown className={cn("size-3.5 transition-transform", showAllChecks && "rotate-180")} />
                    {showAllChecks ? t.offer.bottomLine.collapse : t.offer.bottomLine.expand}
                  </button>
                  {showAllChecks && (
                    <div className="mt-3 space-y-2.5 border-t border-[var(--line)] pt-3">
                      {softChecks.map((c) => (
                        <div key={c.label} className="flex items-start justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="font-semibold text-[var(--muted)]">{c.label}</div>
                            <div className="tnum text-[11px] text-[var(--muted)]">{c.spec}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="tnum text-[var(--muted)]">{c.current}</span>
                            {c.ok ? <Check className="size-3.5 text-[var(--success)]" /> : <X className="size-3.5 text-[var(--muted)]" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-4 text-xs text-[var(--muted)]">{t.offer.bottomLine.pickProduct}</div>
              )}
            </CardContent>
          </Card>

          <Button type="submit" variant="accent" size="lg" className="w-full" disabled={submitting || !isReady}>
            <Building2 className="size-4" />
            {submitting ? t.offer.submit.busy : isReady ? t.offer.submit.ready : format(t.offer.submit.missing, { count: missingFields.length + (qualsNeedFiles ? 1 : 0) })}
          </Button>
          <p className="text-center text-[11px] leading-4 text-[var(--muted)]">
            {t.offer.submit.note}
          </p>
        </div>
      </form>
    </div>
  );
}

function SectionTitle({ index, title, note }: { index: string; title: string; note: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="tnum grid size-9 place-items-center rounded-[var(--radius-control)] bg-[var(--ink)] text-sm font-bold text-white">{index}</span>
      <div>
        <h2 className="font-bold">{title}</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{note}</p>
      </div>
    </div>
  );
}

function Field({
  label, required, missing, error, note, className, children,
}: {
  label: string; required?: boolean; missing?: boolean; error?: string; note?: string;
  className?: string; children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        {label}
        {required && !missing && <Check className="size-3.5 text-[var(--success)]" />}
      </span>
      <div className="mt-2">{children}</div>
      {missing && error && <span className="mt-1 block text-[11px] font-semibold text-[var(--warning)]">{error}</span>}
      {note && <span className="mt-1 block text-[11px] text-[var(--muted)]">{note}</span>}
    </label>
  );
}

function WithSuffix({ prefix, suffix, children }: { prefix?: string; suffix: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">{prefix}</span>}
      {children}
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">{suffix}</span>
    </div>
  );
}
