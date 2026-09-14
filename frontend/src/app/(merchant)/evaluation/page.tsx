"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, Cpu, Database, FileJson2, FlaskConical, Play, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getEvaluationDatasets, runDialogueEvaluation, runMLEvaluation, runRuleEvaluation, type DialogueEvaluationResult, type EvaluationDataset, type MLEvaluationResult, type RuleEvaluationResult } from "@/lib/api";
import { cn } from "@/lib/utils";

const label: Record<string, string> = { eliminated: "淘汰", negotiating: "AI拉锯", qualified: "转人工" };
const dialogueTypes = ["全部类型", "价格类", "起订量类", "账期类", "资质类", "催单施压类", "模糊回应类"];

export default function EvaluationPage() {
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
  const [dialogueType, setDialogueType] = useState("全部类型");
  const [error, setError] = useState("");

  useEffect(() => {
    getEvaluationDatasets().then(result => { setDatasets(result.datasets); setLlmConfigured(result.llm_configured); }).catch(err => setError(err instanceof Error ? err.message : "数据集读取失败")).finally(() => setLoadingData(false));
  }, []);

  async function evaluateRules() {
    setRunningRule(true); setError("");
    try { setRuleResult(await runRuleEvaluation()); } catch (err) { setError(err instanceof Error ? err.message : "规则测评失败"); }
    finally { setRunningRule(false); }
  }
  async function evaluateDialogues() {
    setRunningDialogue(true); setError("");
    try { setDialogueResult(await runDialogueEvaluation(Math.max(1, Math.min(20, Number(sampleSize) || 10)), dialogueType === "全部类型" ? undefined : dialogueType)); }
    catch (err) { setError(err instanceof Error ? err.message : "话术测评失败"); }
    finally { setRunningDialogue(false); }
  }
  async function evaluateML() {
    setRunningML(true); setError("");
    try { setMlResult(await runMLEvaluation()); }
    catch (err) { setError(err instanceof Error ? err.message : "ML 模型测评失败"); }
    finally { setRunningML(false); }
  }

  return <div className="animate-rise space-y-6">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]"><FlaskConical className="size-4" />测试与验收</div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">测评实验室</h1><p className="mt-2 text-base text-[var(--muted)]">在隔离环境中检验规则分类和AI谈判回复，不写入正式供应商与谈判记录。</p></div><Badge className={cn("w-fit px-3 py-1.5", llmConfigured ? "border-[var(--success)]/20 bg-[var(--success-faint)] text-[var(--success)]" : "border-[var(--warning)]/20 bg-[var(--warning-faint)] text-[var(--warning)]")}>{llmConfigured ? "大模型API密钥已配置" : "未配置API · 使用备用回复"}</Badge></section>
    {error && <div className="flex items-center gap-2 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-faint)] px-4 py-3 text-sm text-[var(--danger)]"><AlertTriangle className="size-4" />{error}</div>}

    <section className="grid gap-3 md:grid-cols-3">{loadingData ? [1,2,3].map(item => <Card key={item}><CardContent className="h-36 animate-pulse bg-[var(--paper)]" /></Card>) : datasets.map(dataset => <Card key={dataset.key}><CardContent className="p-5"><div className="flex items-start justify-between"><div className="grid size-10 place-items-center rounded-xl bg-[var(--accent-faint)] text-[var(--accent)]"><FileJson2 className="size-5" /></div>{dataset.exists ? <Badge className="border-[var(--success)]/20 bg-[var(--success-faint)] text-[var(--success)]">可用</Badge> : <Badge>缺失</Badge>}</div><div className="mt-4 font-bold">{dataset.label}</div><div className="mt-1 text-sm text-[var(--muted)]">{dataset.count.toLocaleString()} 条 · {(dataset.size_bytes / 1024).toFixed(1)} KB</div><div className="mt-3 truncate text-xs text-[var(--muted)]">{dataset.filename}</div></CardContent></Card>)}</section>

    <section className="grid gap-5 xl:grid-cols-2">
      <Card><CardHeader><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[var(--success-faint)] text-[var(--success)]"><ShieldCheck className="size-5" /></div><div><h2 className="font-bold">规则引擎测评</h2><p className="mt-1 text-sm text-[var(--muted)]">一次运行全部1,500条报价用例，不调用大模型。</p></div></div></CardHeader><CardContent><Button variant="accent" className="w-full" disabled={runningRule || !datasets.every(item => item.exists)} onClick={() => void evaluateRules()}><Play className="size-4" />{runningRule ? "正在测评…" : "运行完整规则测评"}</Button>{ruleResult && <div className="mt-5 grid grid-cols-3 gap-3"><Metric value={`${ruleResult.accuracy}%`} name="总体准确率" /><Metric value={String(ruleResult.matched)} name="匹配预期" /><Metric value={String(ruleResult.total - ruleResult.matched)} name="需要复核" warning /></div>}</CardContent></Card>

      <Card><CardHeader><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[var(--accent-faint)] text-[var(--accent)]"><BrainCircuit className="size-5" /></div><div><h2 className="font-bold">AI话术抽样测评</h2><p className="mt-1 text-sm text-[var(--muted)]">从200条话术中抽样，检查策略命中和越权风险。</p></div></div></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-[1fr_110px]"><label><span className="text-sm font-semibold">话术类型</span><select value={dialogueType} onChange={event => setDialogueType(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm">{dialogueTypes.map(item => <option key={item}>{item}</option>)}</select></label><label><span className="text-sm font-semibold">抽样数量</span><Input className="mt-2" type="number" min="1" max="20" value={sampleSize} onChange={event => setSampleSize(event.target.value)} /></label></div><Button variant="accent" className="mt-4 w-full" disabled={runningDialogue || !datasets.every(item => item.exists)} onClick={() => void evaluateDialogues()}><Play className="size-4" />{runningDialogue ? "正在生成并检查回复…" : "开始话术抽样测评"}</Button>{dialogueResult && <div className="mt-5 grid grid-cols-3 gap-3"><Metric value={`${dialogueResult.pass_rate}%`} name="初筛通过率" /><Metric value={String(dialogueResult.passed)} name="通过" /><Metric value={String(dialogueResult.total - dialogueResult.passed)} name="待复核" warning /></div>}</CardContent></Card>

      <Card><CardHeader><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[var(--accent-faint)] text-[var(--accent)]"><Cpu className="size-5" /></div><div><h2 className="font-bold">ML 模型测评</h2><p className="mt-1 text-sm text-[var(--muted)]">逻辑回归 / 决策树对 1,500 条用例分类，与规则引擎对比。</p></div></div></CardHeader><CardContent><Button variant="accent" className="w-full" disabled={runningML || !datasets.every(item => item.exists)} onClick={() => void evaluateML()}><Play className="size-4" />{runningML ? "正在测评…" : "运行 ML 模型测评"}</Button>{mlResult && <div className="mt-5 space-y-4"><div className="grid grid-cols-3 gap-3"><Metric value={`${mlResult.accuracy}%`} name="ML 准确率" /><Metric value={`${mlResult.rule_engine_baseline_accuracy}%`} name="规则引擎基线" warning /><Metric value={mlResult.model === "decision_tree" ? "决策树" : "逻辑回归"} name="主模型" /></div><div className="rounded-xl bg-[var(--paper)] p-3 text-sm"><div className="mb-2 font-semibold">逐类召回率</div>{Object.entries(mlResult.per_class_recall).map(([key, value]) => <div key={key} className="flex items-center justify-between py-1 text-[var(--muted)]"><span>{label[key] ?? key}</span><span className="font-semibold text-[var(--ink)]">{value}%</span></div>)}</div></div>}</CardContent></Card>
    </section>

    {ruleResult && <section className="grid gap-5 xl:grid-cols-[.75fr_1.25fr]"><Card><CardHeader><h2 className="font-bold">规则组准确率</h2></CardHeader><CardContent className="space-y-4">{ruleResult.groups.map(group => <div key={group.group}><div className="flex items-center justify-between text-sm"><span className="font-semibold">规则组 {group.group}</span><span>{group.accuracy}% · {group.matched}/{group.total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--paper-deep)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{width:`${group.accuracy}%`}} /></div></div>)}</CardContent></Card><Card><CardHeader><h2 className="font-bold">测评说明</h2></CardHeader><CardContent><div className="space-y-3">{ruleResult.notes.map(note => <div key={note} className="flex gap-2 text-sm leading-6 text-[var(--muted)]"><Database className="mt-1 size-4 shrink-0 text-[var(--accent)]" />{note}</div>)}</div></CardContent></Card></section>}

    {ruleResult && <Card><CardHeader className="flex flex-row items-center justify-between"><div><h2 className="font-bold">误判案例</h2><p className="mt-1 text-sm text-[var(--muted)]">最多展示前100条，用于定位规则语义和阈值问题。</p></div><Badge>{ruleResult.mismatches.length} 条</Badge></CardHeader><CardContent className="overflow-x-auto pt-2"><table className="w-full min-w-[800px] text-left text-sm"><thead className="border-b border-[var(--line)] text-[var(--muted)]"><tr><th className="px-2 py-3">用例</th><th className="px-2 py-3">供应商 / 商品</th><th className="px-2 py-3">预期</th><th className="px-2 py-3">实际</th><th className="px-2 py-3">评分</th><th className="px-2 py-3">原因</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{ruleResult.mismatches.map(item => <tr key={item.case_id}><td className="px-2 py-3 font-semibold">{item.case_id}</td><td className="px-2 py-3"><div>{item.supplier}</div><div className="mt-1 text-xs text-[var(--muted)]">{item.product}</div></td><td className="px-2 py-3">{label[item.expected]}</td><td className="px-2 py-3"><Badge>{label[item.actual]}</Badge></td><td className="px-2 py-3 font-bold">{item.score}</td><td className="max-w-sm px-2 py-3 text-xs leading-5 text-[var(--muted)]">{item.reasons.join("；") || "评分阈值导致分类差异"}</td></tr>)}</tbody></table></CardContent></Card>}

    {dialogueResult && <Card><CardHeader><h2 className="font-bold">话术回复明细</h2><p className="mt-1 text-sm text-[var(--muted)]">{dialogueResult.note}</p></CardHeader><CardContent className="space-y-4">{dialogueResult.results.map(item => <div key={item.case_id} className="rounded-2xl border border-[var(--line)] bg-white p-5"><div className="flex flex-wrap items-center gap-2"><Badge>{item.case_id} · {item.type}</Badge>{item.passed ? <span className="flex items-center gap-1 text-sm font-semibold text-[var(--success)]"><CheckCircle2 className="size-4" />初筛通过</span> : <span className="flex items-center gap-1 text-sm font-semibold text-[var(--warning)]"><XCircle className="size-4" />需要复核</span>}</div><div className="mt-4 grid gap-4 lg:grid-cols-2"><TextBlock title="供应商话术" text={item.message} /><TextBlock title="采购AI回复" text={item.reply} /></div><details className="mt-4 rounded-xl bg-[var(--paper)] p-4"><summary className="cursor-pointer text-sm font-semibold">查看预期意图与策略</summary><div className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]"><p><strong className="text-[var(--ink)]">可能意图：</strong>{item.intent}</p><p><strong className="text-[var(--ink)]">预期策略：</strong>{item.expected_strategy}</p></div></details></div>)}</CardContent></Card>}
    {dialogueResult && dialogueResult.fallback_count > 0 && <div className="rounded-xl border border-[var(--warning)]/20 bg-[var(--warning-faint)] px-4 py-3 text-sm text-[var(--warning)]">本轮有 {dialogueResult.fallback_count} 条使用备用回复，说明模型服务未成功返回；这些结果不能作为真实模型质量结论。</div>}
  </div>;
}

function Metric({value,name,warning=false}:{value:string;name:string;warning?:boolean}) { return <div className="rounded-xl bg-[var(--paper)] p-3"><div className={cn("text-2xl font-bold",warning&&"text-[var(--warning)]")}>{value}</div><div className="mt-1 text-xs text-[var(--muted)]">{name}</div></div>; }
function TextBlock({title,text}:{title:string;text:string}) { return <div><div className="text-sm font-semibold">{title}</div><div className="mt-2 rounded-xl bg-[var(--paper)] p-4 text-sm leading-6">{text}</div></div>; }
