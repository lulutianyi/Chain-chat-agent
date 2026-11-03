"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Check, PackagePlus, Pencil, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createProduct, disableProduct, getManagedProducts, updateProduct, type ManagedProduct } from "@/lib/api";
import { DEFAULT_SCORE_WEIGHTS, QUALIFICATION_OPTIONS, SCORE_DIMENSIONS, SCORING_MODEL_OPTIONS } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/client";
import { qualificationLabel, scoreDimensionLabel, scoringModelLabel } from "@/lib/i18n/enums";
import { format } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

const blankWeights = Object.fromEntries(SCORE_DIMENSIONS.map((item) => [item.key, String(item.default)]));

const blankProduct = {
  name: "", category: "", description: "",
  target_price: "", hard_max_price: "", max_moq: "",
  max_lead_days: "14", max_payment_days: "30", handoff_score: "82",
  required_qualifications: ["营业执照", "质检报告"] as string[],
  preferred_regions: "", scoring_model: "custom_rule", score_weights: { ...blankWeights },
  ml_model: "decision_tree", ml_qualify_threshold: "0.5", ml_eliminate_threshold: "0.5",
};

/**
 * 商品库管理抽屉：商品列表 + 商品表单。
 * 从 dashboard 页面里抽出来，页面负责统计，这里负责配置。
 */
export function ProductLibraryDrawer({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { locale, d } = useI18n();
  const t = d.supplier.library;
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(blankProduct);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const loadProducts = useCallback(async () => {
    try {
      setProducts(await getManagedProducts());
    } catch (error) {
      toast.push("error", error instanceof Error ? error.message : t.toast.loadFailed);
    }
  }, [toast, t]);

  useEffect(() => { void loadProducts(); }, [loadProducts]);

  const weightTotal = SCORE_DIMENSIONS.reduce((sum, item) => sum + (Number(form.score_weights[item.key]) || 0), 0);
  const weightValid = weightTotal === 100;
  const canSave = Boolean(
    !saving && form.name && form.category && form.target_price && form.hard_max_price && form.max_moq
    && (form.scoring_model !== "custom_rule" || weightValid),
  );

  function editProduct(product?: ManagedProduct) {
    if (!product) {
      setEditingId(null);
      setForm(blankProduct);
      return;
    }
    setEditingId(product.id);
    const weightStrings = Object.fromEntries(
      SCORE_DIMENSIONS.map((item) => [item.key, String(product.score_weights?.[item.key] ?? item.default)]),
    );
    setForm({
      name: product.name, category: product.category, description: product.description,
      target_price: String(product.target_price), hard_max_price: String(product.hard_max_price),
      max_moq: String(product.max_moq), max_lead_days: String(product.max_lead_days),
      max_payment_days: String(product.max_payment_days), handoff_score: String(product.handoff_score),
      required_qualifications: product.required_qualifications,
      preferred_regions: product.preferred_regions.join(","),
      scoring_model: product.scoring_model, score_weights: { ...weightStrings },
      ml_model: product.ml_model,
      ml_qualify_threshold: String(product.ml_qualify_threshold),
      ml_eliminate_threshold: String(product.ml_eliminate_threshold),
    });
  }

  async function saveProduct() {
    setSaving(true);
    const weightNumbers = Object.fromEntries(
      SCORE_DIMENSIONS.map((item) => [item.key, Number(form.score_weights[item.key]) || 0]),
    );
    const base = {
      name: form.name.trim(), category: form.category.trim(), description: form.description.trim(),
      target_price: Number(form.target_price), hard_max_price: Number(form.hard_max_price),
      max_moq: Number(form.max_moq), max_lead_days: Number(form.max_lead_days),
      max_payment_days: Number(form.max_payment_days), handoff_score: Number(form.handoff_score),
      required_qualifications: form.required_qualifications,
      preferred_regions: form.preferred_regions.split(/[,，]/).map((v) => v.trim()).filter(Boolean),
      scoring_model: form.scoring_model as "custom_rule" | "ml",
      score_weights: form.scoring_model === "ml" ? { ...DEFAULT_SCORE_WEIGHTS } : weightNumbers,
      ml_model: form.ml_model,
      ml_qualify_threshold: Number(form.ml_qualify_threshold),
      ml_eliminate_threshold: Number(form.ml_eliminate_threshold),
    };
    try {
      const wasEditing = editingId !== null;
      if (editingId) {
        const old = products.find((p) => p.id === editingId)!;
        await updateProduct(editingId, { ...base, active: old.active });
      } else {
        await createProduct(base);
      }
      await loadProducts();
      editProduct();
      toast.push("success", wasEditing ? t.toast.updated : t.toast.added);
      onChanged();
    } catch (error) {
      toast.push("error", error instanceof Error ? error.message : t.toast.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function toggleProduct(product: ManagedProduct) {
    try {
      if (product.active) await disableProduct(product.id);
      else await updateProduct(product.id, { ...product, active: true });
      await loadProducts();
      toast.push("success", product.active ? t.toast.disabled : t.toast.enabled);
      onChanged();
    } catch (error) {
      toast.push("error", error instanceof Error ? error.message : t.toast.actionFailed);
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, number = false) => (
    <label>
      <span className="text-xs font-semibold">{label}</span>
      <Input className="mt-2" type={number ? "number" : "text"} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[var(--ink)]/35 backdrop-blur-sm"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.dialogLabel}
    >
      <div
        className="h-full w-full max-w-3xl overflow-y-auto bg-[var(--paper)] p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold text-[var(--accent-strong)]">{t.eyebrow}</div>
            <h2 className="mt-1 text-2xl font-bold">{t.title}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {t.body}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t.close}
            className="grid size-9 place-items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] transition hover:border-[var(--ink)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          {/* 已有商品 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{t.existing}</h3>
              <Button size="sm" variant="outline" onClick={() => editProduct()}>
                <PackagePlus className="size-4" />
                {t.add}
              </Button>
            </div>
            {products.length ? products.map((product) => (
              <Card key={product.id} className={cn(!product.active && "opacity-55")}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{product.name}</div>
                      <div className="tnum mt-1 text-xs text-[var(--muted)]">
                        {format(t.itemMeta, { category: product.category, price: product.target_price, moq: product.max_moq })}
                      </div>
                    </div>
                    <Badge>{product.active ? t.badgeActive : t.badgeInactive}</Badge>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => editProduct(product)}>
                      <Pencil className="size-3.5" />
                      {t.edit}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void toggleProduct(product)}>
                      <Archive className="size-3.5" />
                      {product.active ? t.actionDisable : t.actionEnable}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )) : (
              <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--muted)]">
                {t.empty}
              </div>
            )}
          </div>

          {/* 商品表单 */}
          <div>
            <h3 className="font-bold">{editingId ? t.editTitle : t.createTitle}</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {field(t.fields.name, form.name, (v) => setForm({ ...form, name: v }))}
              {field(t.fields.category, form.category, (v) => setForm({ ...form, category: v }))}
              {field(t.fields.targetPrice, form.target_price, (v) => setForm({ ...form, target_price: v }), true)}
              {field(t.fields.hardMaxPrice, form.hard_max_price, (v) => setForm({ ...form, hard_max_price: v }), true)}
              {field(t.fields.maxMoq, form.max_moq, (v) => setForm({ ...form, max_moq: v }), true)}
              {field(t.fields.maxLeadDays, form.max_lead_days, (v) => setForm({ ...form, max_lead_days: v }), true)}
              {field(t.fields.maxPaymentDays, form.max_payment_days, (v) => setForm({ ...form, max_payment_days: v }), true)}

              <div className="sm:col-span-2">
                <label>
                  <span className="text-xs font-semibold">{t.scoringModel}</span>
                  <select
                    value={form.scoring_model}
                    onChange={(e) => setForm({ ...form, scoring_model: e.target.value })}
                    className="mt-2 h-10 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-faint)]"
                  >
                    {SCORING_MODEL_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{scoringModelLabel(opt.value, locale)}</option>)}
                  </select>
                </label>
              </div>

              {form.scoring_model === "custom_rule" ? (
                <>
                  <div className="sm:col-span-2">
                    {field(t.fields.handoffScore, form.handoff_score, (v) => setForm({ ...form, handoff_score: v }), true)}
                  </div>
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{t.weightsLabel}</span>
                      <span className={cn("tnum text-xs font-bold", weightValid ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                        {format(t.weightsTotal, { total: weightTotal })}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {SCORE_DIMENSIONS.map((item) => (
                        <div key={item.key}>
                          {field(scoreDimensionLabel(item.key, locale), form.score_weights[item.key] ?? "", (v) => setForm({
                            ...form, score_weights: { ...form.score_weights, [item.key]: v },
                          }), true)}
                        </div>
                      ))}
                    </div>
                    {!weightValid && (
                      <p className="mt-2 text-xs text-[var(--danger)]">{format(t.weightsError, { total: weightTotal })}</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <div className="rounded-[var(--radius-control)] bg-[var(--paper)] p-3 text-xs leading-5 text-[var(--muted)]">
                    {t.mlNote}
                  </div>
                  <div className="mt-3 space-y-3">
                    <ThresholdSlider label={t.mlQualify} value={form.ml_qualify_threshold} set={(v) => setForm({ ...form, ml_qualify_threshold: v })} />
                    <ThresholdSlider label={t.mlEliminate} value={form.ml_eliminate_threshold} set={(v) => setForm({ ...form, ml_eliminate_threshold: v })} />
                  </div>
                </div>
              )}

              <div className="sm:col-span-2">
                <span className="text-xs font-semibold">{t.requiredQuals}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...QUALIFICATION_OPTIONS, ...form.required_qualifications.filter((q) => !QUALIFICATION_OPTIONS.includes(q))].map((q) => {
                    const active = form.required_qualifications.includes(q);
                    return (
                      <button
                        type="button"
                        key={q}
                        aria-pressed={active}
                        onClick={() => setForm({
                          ...form,
                          required_qualifications: active
                            ? form.required_qualifications.filter((v) => v !== q)
                            : [...form.required_qualifications, q],
                        })}
                        className={cn(
                          "flex items-center gap-1.5 rounded-[var(--radius-control)] border px-3 py-2 text-sm font-medium transition",
                          active
                            ? "border-[var(--success)]/20 bg-[var(--success-faint)] text-[var(--success)]"
                            : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--ink)]",
                        )}
                      >
                        <span className={cn("grid size-4 place-items-center rounded border", active ? "border-[var(--success)] bg-[var(--success)] text-white" : "border-[var(--line)]")}>
                          {active && <Check className="size-3" />}
                        </span>
                        {qualificationLabel(q, locale)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-2">
                {field(t.fields.regions, form.preferred_regions, (v) => setForm({ ...form, preferred_regions: v }))}
              </div>
              <label className="sm:col-span-2">
                <span className="text-xs font-semibold">{t.fields.description}</span>
                <Textarea className="mt-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
            </div>
            <Button variant="accent" className="mt-5 w-full" disabled={!canSave} onClick={() => void saveProduct()}>
              <Save className="size-4" />
              {saving ? d.common.actions.saving : editingId ? t.saveEdit : t.saveCreate}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThresholdSlider({ label, value, set }: { label: string; value: string; set: (value: string) => void }) {
  const pct = Math.round(Number(value || 0) * 100);
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{label}</span>
        <span className="tnum text-xs font-semibold text-[var(--accent)]">{pct}%</span>
      </div>
      <input
        type="range" min={0} max={100} step={1} value={pct}
        onChange={(e) => set(String(Number(e.target.value) / 100))}
        className="mt-2 w-full accent-[var(--accent)]"
      />
    </label>
  );
}
