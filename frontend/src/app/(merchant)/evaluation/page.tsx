"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, Cpu, Database, FileJson2, FlaskConical, Play, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getEvaluationDatasets, runDialogueEvaluation, runMLEvaluation, runRuleEvaluation, type DialogueEvaluationResult, type EvaluationDataset, type MLEvaluationResult, type RuleEvaluationCase, type RuleEvaluationResult, type RuleReasonCode } from "@/lib/api";
import { localeTag } from "@/lib/i18n/config";
import { qualificationLabel } from "@/lib/i18n/enums";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

type DialogueTypeKey = "all" | "price" | "moq" | "payment" | "qualification" | "pressure" | "vague";

/** 「全部类型」这个字面量同时是「不做类型过滤」的哨兵值，必须原样提交给后端。 */
const ALL_TYPES = "全部类型";

/** 话术类型选项：value 提交给后端、不能翻译，显示名从词典按 key 取。 */
const DIALOGUE_TYPES: { value: string; key: DialogueTypeKey }[] = [
  { value: ALL_TYPES, key: "all" },
  { value: "价格类", key: "price" },
  { value: "起订量类", key: "moq" },
  { value: "账期类", key: "payment" },
  { value: "资质类", key: "qualification" },
  { value: "催单施压类", key: "pressure" },
  { value: "模糊回应类", key: "vague" },
];

/** 后端话术结果是中文枚举值；用它换回词典 key，英文界面才不会把「价格类」直接画出来。 */
const DIALOGUE_TYPE_KEY = new Map(DIALOGUE_TYPES.map((item) => [item.value, item.key]));

export default function EvaluationPage() {
  const { locale, d } = useI18n();
  const t = d.merchant.evaluation;
  const [datasets, setDatasets] = useState<EvaluationDataset[]>([]);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [runningRule, setRunningRule] = useState(false);
  const [runningDialogue, setRunningDialogue] = useState(false);
  const [runningML, setRunningML] = useState(false);
  const [ruleResult, setRuleResult] = useState<RuleEvaluationResult | null>(null);
  const [dialogueResult, setDialogueResult] = useState<DialogueEvaluationResult | null>(null);
  const [mlResult, setMlResult] = useState<MLEvaluationResult | null>(null);
  const [sampleSize, setSampleSize] = useState("10");
  const [dialogueType, setDialogueType] = useState(ALL_TYPES);
  const [error, setError] = useState("");

  // 数据集接口的报错文案先取出成字符串：它要在 useEffect 里用，
  // 直接闭包引用词典对象会让每次渲染的依赖都变。
  const datasetErrorText = t.errors.datasets;
  useEffect(() => {
    getEvaluationDatasets().then(result => { setDatasets(result.datasets); setLlmConfigured(result.llm_configured); }).catch(err => setError(err instanceof Error ? err.message : datasetErrorText)).finally(() => setLoadingData(false));
  }, [datasetErrorText]);

  async function evaluateRules() {
    setRunningRule(true); setError("");
    try { setRuleResult(await runRuleEvaluation()); } catch (err) { setError(err instanceof Error ? err.message : t.errors.rule); }
    finally { setRunningRule(false); }
  }
  async function evaluateDialogues() {
    setRunningDialogue(true); setError("");
    try { setDialogueResult(await runDialogueEvaluation(Math.max(1, Math.min(20, Number(sampleSize) || 10)), dialogueType === ALL_TYPES ? undefined : dialogueType)); }
    catch (err) { setError(err instanceof Error ? err.message : t.errors.dialogue); }
    finally { setRunningDialogue(false); }
  }
  async function evaluateML() {
    setRunningML(true); setError("");
    try { setMlResult(await runMLEvaluation()); }
    catch (err) { setError(err instanceof Error ? err.message : t.errors.ml); }
    finally { setRunningML(false); }
  }

  const label: Record<string, string> = { eliminated: t.classes.eliminated, negotiating: t.classes.negotiating, qualified: t.classes.qualified };

  // 后端返回的是「可展示的中文」+「结构化 code」两套值。中文界面直接看原文；
  // 英文界面必须走 code 重新组装，不能把中文 reasons / notes / dataset.label 直接画出来。
  function reasonText(item: RuleReasonCode): string {
    switch (item.code) {
      case "price_above_ceiling":
        return format(t.rule.reasons.price_above_ceiling, { quoted: item.quoted_price ?? 0, max: item.hard_max_price ?? 0 });
      case "moq_above_max":
        return format(t.rule.reasons.moq_above_max, { moq: item.moq ?? 0, max: item.max_moq ?? 0 });
      case "lead_time_above_max":
        return format(t.rule.reasons.lead_time_above_max, { days: item.lead_days ?? 0, max: item.max_lead_days ?? 0 });
      case "payment_below_min":
        return format(t.rule.reasons.payment_below_min, { days: item.payment_days ?? 0, min: item.min_payment_days ?? 0 });
      case "missing_qualifications":
        return format(t.rule.reasons.missing_qualifications, {
          names: (item.qualifications ?? []).map((value) => qualificationLabel(value, locale)).join(locale === "en" ? ", " : "、"),
        });
    }
  }

  function caseReason(item: RuleEvaluationCase): string {
    if (item.reason_codes?.length) return item.reason_codes.map(reasonText).join(t.mismatches.separator);
    // 旧后端没有 reason_codes 时保留原文，至少不丢信息。
    return item.reasons.join(t.mismatches.separator) || t.mismatches.scoreThreshold;
  }

  function datasetLabel(dataset: EvaluationDataset): string {
    return t.dataset.labels[dataset.key as keyof typeof t.dataset.labels] ?? dataset.label;
  }

  function ruleNote(key: string): string {
    return t.rule.notes[key as keyof typeof t.rule.notes] ?? key;
  }

  function dialogueTypeLabel(value: string): string {
    const key = DIALOGUE_TYPE_KEY.get(value);
    return key ? t.dialogue.types[key] : value;
  }

  return <div className="animate-rise space-y-6">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]"><FlaskConical className="size-4" />{t.eyebrow}</div><h1 className="text-[28px] font-bold tracking-tight">{t.title}</h1><p className="mt-2 text-base text-[var(--muted)]">{t.body}</p></div><Badge className={cn("w-fit px-3 py-1.5", llmConfigured ? "border-[var(--success)]/20 bg-[var(--success-faint)] text-[var(--success)]" : "border-[var(--warning)]/20 bg-[var(--warning-faint)] text-[var(--warning)]")}>{llmConfigured ? t.llm.configured : t.llm.missing}</Badge></section>
    {error && <div className="flex items-center gap-2 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-faint)] px-4 py-3 text-sm text-[var(--danger)]"><AlertTriangle className="size-4" />{error}</div>}

    <section className="grid gap-3 md:grid-cols-3">{loadingData ? [1,2,3].map(item => <Card key={item}><CardContent className="h-36 animate-pulse bg-[var(--paper)]" /></Card>) : datasets.map(dataset => <Card key={dataset.key}><CardContent className="p-5"><div className="flex items-start justify-between"><div className="grid size-10 place-items-center rounded-xl bg-[var(--accent-faint)] text-[var(--accent)]"><FileJson2 className="size-5" /></div>{dataset.exists ? <Badge className="border-[var(--success)]/20 bg-[var(--success-faint)] text-[var(--success)]">{t.dataset.available}</Badge> : <Badge>{t.dataset.missing}</Badge>}</div><div className="mt-4 font-bold">{datasetLabel(dataset)}</div><div className="mt-1 text-sm text-[var(--muted)]">{format(t.dataset.meta, { count: dataset.count.toLocaleString(localeTag(locale)), size: (dataset.size_bytes / 1024).toFixed(1) })}</div><div className="mt-3 truncate text-xs text-[var(--muted)]" title={locale === "zh" ? dataset.filename : t.dataset.fileLabel}>{locale === "zh" ? dataset.filename : t.dataset.fileLabel}</div></CardContent></Card>)}</section>

    <section className="grid gap-5 xl:grid-cols-2">
      <Card><CardHeader><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[var(--success-faint)] text-[var(--success)]"><ShieldCheck className="size-5" /></div><div><h2 className="font-bold">{t.rule.title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t.rule.body}</p></div></div></CardHeader><CardContent><Button variant="accent" className="w-full" disabled={runningRule || !datasets.every(item => item.exists)} onClick={() => void evaluateRules()}><Play className="size-4" />{runningRule ? t.rule.running : t.rule.run}</Button>{ruleResult && <div className="mt-5 grid grid-cols-3 gap-3"><Metric value={`${ruleResult.accuracy}%`} name={t.rule.accuracy} /><Metric value={String(ruleResult.matched)} name={t.rule.matched} /><Metric value={String(ruleResult.total - ruleResult.matched)} name={t.rule.review} warning /></div>}</CardContent></Card>

      <Card><CardHeader><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[var(--accent-faint)] text-[var(--accent)]"><BrainCircuit className="size-5" /></div><div><h2 className="font-bold">{t.dialogue.title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t.dialogue.body}</p>{locale === "en" && <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{t.dialogue.corpusNote}</p>}</div></div></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-[1fr_110px]"><label><span className="text-sm font-semibold">{t.dialogue.typeLabel}</span><select value={dialogueType} onChange={event => setDialogueType(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm">{DIALOGUE_TYPES.map(item => <option key={item.value} value={item.value}>{t.dialogue.types[item.key]}</option>)}</select></label><label><span className="text-sm font-semibold">{t.dialogue.sizeLabel}</span><Input className="mt-2" type="number" min="1" max="20" value={sampleSize} onChange={event => setSampleSize(event.target.value)} /></label></div><Button variant="accent" className="mt-4 w-full" disabled={runningDialogue || !datasets.every(item => item.exists)} onClick={() => void evaluateDialogues()}><Play className="size-4" />{runningDialogue ? t.dialogue.running : t.dialogue.run}</Button>{dialogueResult && <div className="mt-5 grid grid-cols-3 gap-3"><Metric value={`${dialogueResult.pass_rate}%`} name={t.dialogue.passRate} /><Metric value={String(dialogueResult.passed)} name={t.dialogue.passed} /><Metric value={String(dialogueResult.total - dialogueResult.passed)} name={t.dialogue.review} warning /></div>}</CardContent></Card>

      <Card><CardHeader><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[var(--accent-faint)] text-[var(--accent)]"><Cpu className="size-5" /></div><div><h2 className="font-bold">{t.ml.title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t.ml.body}</p></div></div></CardHeader><CardContent><Button variant="accent" className="w-full" disabled={runningML || !datasets.every(item => item.exists)} onClick={() => void evaluateML()}><Play className="size-4" />{runningML ? t.ml.running : t.ml.run}</Button>{mlResult && <div className="mt-5 space-y-4"><div className="grid grid-cols-3 gap-3"><Metric value={`${mlResult.accuracy}%`} name={t.ml.accuracy} /><Metric value={`${mlResult.rule_engine_baseline_accuracy}%`} name={t.ml.baseline} warning /><Metric value={mlResult.model === "decision_tree" ? t.ml.decisionTree : t.ml.logistic} name={t.ml.model} /></div><div className="rounded-xl bg-[var(--paper)] p-3 text-sm"><div className="mb-2 font-semibold">{t.ml.recall}</div>{Object.entries(mlResult.per_class_recall).map(([key, value]) => <div key={key} className="flex items-center justify-between py-1 text-[var(--muted)]"><span>{label[key] ?? key}</span><span className="font-semibold text-[var(--ink)]">{value}%</span></div>)}</div></div>}</CardContent></Card>
    </section>

    {ruleResult && <section className="grid gap-5 xl:grid-cols-[.75fr_1.25fr]"><Card><CardHeader><h2 className="font-bold">{t.rule.groupsTitle}</h2></CardHeader><CardContent className="space-y-4">{ruleResult.groups.map(group => <div key={group.group}><div className="flex items-center justify-between text-sm"><span className="font-semibold">{format(t.rule.group, { group: group.group })}</span><span>{group.accuracy}% · {group.matched}/{group.total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--paper-deep)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{width:`${group.accuracy}%`}} /></div></div>)}</CardContent></Card><Card><CardHeader><h2 className="font-bold">{t.rule.notesTitle}</h2></CardHeader><CardContent><div className="space-y-3">{(ruleResult.note_keys?.length ? ruleResult.note_keys.map(ruleNote) : ruleResult.notes).map(note => <div key={note} className="flex gap-2 text-sm leading-6 text-[var(--muted)]"><Database className="mt-1 size-4 shrink-0 text-[var(--accent)]" />{note}</div>)}</div></CardContent></Card></section>}

    {ruleResult && <Card><CardHeader className="flex flex-row items-center justify-between"><div><h2 className="font-bold">{t.mismatches.title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t.mismatches.note}</p>{locale === "en" && <p className="mt-1 text-xs text-[var(--muted)]">{t.mismatches.corpusNote}</p>}</div><Badge>{format(t.mismatches.count, { count: ruleResult.mismatches.length })}</Badge></CardHeader><CardContent className="overflow-x-auto pt-2"><table className="w-full min-w-[800px] text-left text-sm"><thead className="border-b border-[var(--line)] text-[var(--muted)]"><tr><th className="px-2 py-3">{t.mismatches.columns.case}</th><th className="px-2 py-3">{t.mismatches.columns.supplier}</th><th className="px-2 py-3">{t.mismatches.columns.expected}</th><th className="px-2 py-3">{t.mismatches.columns.actual}</th><th className="px-2 py-3">{t.mismatches.columns.score}</th><th className="px-2 py-3">{t.mismatches.columns.reason}</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{ruleResult.mismatches.map(item => <tr key={item.case_id}><td className="px-2 py-3 font-semibold">{item.case_id}</td><td className="px-2 py-3"><div>{item.supplier}</div><div className="mt-1 text-xs text-[var(--muted)]">{item.product}</div></td><td className="px-2 py-3">{label[item.expected]}</td><td className="px-2 py-3"><Badge>{label[item.actual]}</Badge></td><td className="px-2 py-3 font-bold">{item.score}</td><td className="max-w-sm px-2 py-3 text-xs leading-5 text-[var(--muted)]">{caseReason(item)}</td></tr>)}</tbody></table></CardContent></Card>}

    {dialogueResult && <Card><CardHeader><h2 className="font-bold">{t.replies.title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{dialogueResult.note_key ? t.dialogue.note[dialogueResult.note_key as keyof typeof t.dialogue.note] ?? dialogueResult.note : dialogueResult.note}</p></CardHeader><CardContent className="space-y-4">{dialogueResult.results.map(item => <div key={item.case_id} className="rounded-2xl border border-[var(--line)] bg-white p-5"><div className="flex flex-wrap items-center gap-2"><Badge>{item.case_id} · {dialogueTypeLabel(item.type)}</Badge>{item.passed ? <span className="flex items-center gap-1 text-sm font-semibold text-[var(--success)]"><CheckCircle2 className="size-4" />{t.replies.passed}</span> : <span className="flex items-center gap-1 text-sm font-semibold text-[var(--warning)]"><XCircle className="size-4" />{t.replies.review}</span>}</div><div className="mt-4 grid gap-4 lg:grid-cols-2"><TextBlock title={t.replies.supplierMessage} text={item.message} /><TextBlock title={t.replies.buyerReply} text={item.reply} /></div><details className="mt-4 rounded-xl bg-[var(--paper)] p-4"><summary className="cursor-pointer text-sm font-semibold">{t.replies.details}</summary><div className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]"><p><strong className="text-[var(--ink)]">{t.replies.intent}</strong>{item.intent}</p><p><strong className="text-[var(--ink)]">{t.replies.strategy}</strong>{item.expected_strategy}</p></div></details></div>)}</CardContent></Card>}
    {dialogueResult && dialogueResult.fallback_count > 0 && <div className="rounded-xl border border-[var(--warning)]/20 bg-[var(--warning-faint)] px-4 py-3 text-sm text-[var(--warning)]">{format(t.dialogue.fallback, { count: dialogueResult.fallback_count })}</div>}
  </div>;
}

function Metric({value,name,warning=false}:{value:string;name:string;warning?:boolean}) { return <div className="rounded-xl bg-[var(--paper)] p-3"><div className={cn("tnum text-2xl font-bold",warning&&"text-[var(--warning)]")}>{value}</div><div className="mt-1 text-xs text-[var(--muted)]">{name}</div></div>; }
function TextBlock({title,text}:{title:string;text:string}) { return <div><div className="text-sm font-semibold">{title}</div><div className="mt-2 rounded-xl bg-[var(--paper)] p-4 text-sm leading-6">{text}</div></div>; }
