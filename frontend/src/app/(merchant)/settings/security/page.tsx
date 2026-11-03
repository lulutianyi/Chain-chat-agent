"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { changeMerchantPassword, setMerchantAuth } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";

export default function SecurityPage() {
  const { d } = useI18n();
  const t = d.merchant.security;
  const [current, setCurrent] = useState("");
  const [nextPw, setNextPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // 与后端一致：长度 > 8 位，须同时包含英文、数字。
  // 校验提示随语言变化，因此放在组件内、从词典取文案。
  function validatePassword(pw: string): string | null {
    if (pw.length <= 8) return t.errors.tooShort;
    if (!/[a-zA-Z]/.test(pw)) return t.errors.noLetter;
    if (!/[0-9]/.test(pw)) return t.errors.noDigit;
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!current) { setError(t.errors.currentRequired); return; }
    const ruleError = validatePassword(nextPw);
    if (ruleError) { setError(ruleError); return; }
    if (nextPw !== confirm) { setError(t.errors.mismatch); return; }
    setSubmitting(true);
    try {
      const result = await changeMerchantPassword(current, nextPw);
      // 改密会换发新令牌：不换本地这份的话，下一次请求就会 401 被踢回登录页。
      if (result.access_token) setMerchantAuth(result.access_token);
      setDone(true);
      setCurrent(""); setNextPw(""); setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.failed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-rise mx-auto max-w-xl py-4 sm:py-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--accent-strong)]"><span className="h-px w-5 bg-[var(--accent)]" />{t.eyebrow}</div>
        <h1 className="text-[28px] font-bold tracking-tight">{t.title}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t.body}</p>
      </div>

      <Card className="overflow-hidden">
        <div className="h-2 bg-[var(--accent)]" />
        <CardContent className="p-6 sm:p-8">
          {done ? (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-[var(--success-faint)] text-[var(--success)]"><CheckCircle2 className="size-7" /></div>
              <h2 className="mt-5 text-lg font-bold">{t.done.title}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{t.done.body}</p>
              <Link href="/dashboard" className="mt-6"><Button variant="accent"><ArrowLeft className="size-4" />{t.done.back}</Button></Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <label className="block"><span className="text-xs font-semibold">{t.current}</span><div className="relative mt-2"><PasswordInput leadingIcon={<KeyRound className="size-4" />} value={current} onChange={(e) => setCurrent(e.target.value)} placeholder={t.currentPlaceholder} autoComplete="current-password" /></div></label>
              <label className="block"><span className="text-xs font-semibold">{t.next}</span><div className="relative mt-2"><PasswordInput leadingIcon={<ShieldCheck className="size-4" />} value={nextPw} onChange={(e) => setNextPw(e.target.value)} placeholder={t.nextPlaceholder} autoComplete="new-password" /></div></label>
              <label className="block"><span className="text-xs font-semibold">{t.confirm}</span><div className="relative mt-2"><PasswordInput leadingIcon={<ShieldCheck className="size-4" />} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t.confirmPlaceholder} autoComplete="new-password" /></div></label>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3 text-xs leading-5 text-[var(--muted)]">{t.rules}</div>
              {error && <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-faint)] p-3 text-xs text-[var(--danger)]">{error}</div>}
              <div className="flex gap-3 pt-1">
                <Link href="/dashboard" className="flex-1"><Button type="button" variant="outline" className="w-full">{d.common.actions.cancel}</Button></Link>
                <Button type="submit" variant="accent" className="flex-1" disabled={submitting}>{submitting ? <Loader2 className="size-4 animate-spin" /> : t.submit}</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
