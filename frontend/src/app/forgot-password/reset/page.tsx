"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError, clearMerchantAuth, resetMerchantPassword } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { clearResetToken, passwordChecks, readResetToken } from "@/lib/password-reset";

export default function ResetPasswordPage() {
  const { d } = useI18n();
  const t = d.auth.forgot;
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // 令牌只从 sessionStorage 取，不放在 URL 上；直接打开 /forgot-password/reset
  // 而没走验证流程时，明确告诉用户需要重新开始，而不是给一个永远提交失败的表格。
  useEffect(() => {
    const stored = readResetToken();
    setToken(stored);
    setInvalid(!stored);
    setReady(true);
  }, []);

  const checks = passwordChecks(password, t.reset.checks);
  const doneCount = checks.filter((item) => item.ok).length;
  const passwordOk = doneCount === 3;

  function validate(): string | null {
    if (password.length <= 8) return t.errors.passwordLength;
    if (!/[a-zA-Z]/.test(password)) return t.errors.passwordLetter;
    if (!/[0-9]/.test(password)) return t.errors.passwordDigit;
    if (password !== confirm) return t.errors.passwordMismatch;
    return null;
  }

  function expire() {
    clearResetToken();
    setToken(null);
    setInvalid(true);
    setError(t.reset.invalidBody);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) { expire(); return; }
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSubmitting(true);
    setError("");
    try {
      await resetMerchantPassword(token, password);
      // 后端已经把 access_token 清空；前端同步清掉本地令牌，确保下一页一定要求重新登录。
      clearResetToken();
      clearMerchantAuth();
      setDone(true);
      setPassword("");
      setConfirm("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        expire();
      } else {
        setError(t.errors.resetFailed);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout asideTitle={t.asideTitle} asideBody={t.asideBody}>
      <div className="p-7 sm:p-8">
        {!ready ? (
          <div className="grid min-h-40 place-items-center text-sm text-[var(--muted)]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : done ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-[var(--success-faint)] text-[var(--success)]">
              <CheckCircle2 className="size-7" />
            </div>
            <h1 className="mt-5 text-[24px] font-bold tracking-tight">{t.reset.successTitle}</h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">{t.reset.successBody}</p>
            <Link href="/login" className="mt-6">
              <Button variant="accent" size="lg">
                <ArrowLeft className="size-4" />
                {t.reset.backToLogin}
              </Button>
            </Link>
          </div>
        ) : invalid ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-[var(--warning-faint)] text-[var(--warning)]">
              <AlertTriangle className="size-7" />
            </div>
            <h1 className="mt-5 text-[22px] font-bold tracking-tight">{t.reset.invalidToken}</h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">{error || t.reset.invalidBody}</p>
            <Link href="/forgot-password" className="mt-6">
              <Button variant="accent" size="lg">
                <KeyRound className="size-4" />
                {t.reset.restart}
              </Button>
            </Link>
            <Link href="/login" className="mt-3 text-xs font-semibold text-[var(--muted)] underline underline-offset-2 hover:text-[var(--ink)]">
              {t.backToLogin}
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-[28px] font-bold leading-tight tracking-tight">{t.reset.title}</h1>
              <span className="shrink-0 rounded-full bg-[var(--paper)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                {t.reset.step}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t.reset.subtitle}</p>

            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="block">
                  <span className="text-xs font-semibold">{t.reset.passwordLabel}</span>
                  <div className="mt-2">
                    <PasswordInput
                      leadingIcon={<KeyRound className="size-4" />}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t.reset.passwordPlaceholder}
                      autoComplete="new-password"
                      autoFocus
                      aria-describedby="reset-password-rules"
                    />
                  </div>
                </label>
                <div id="reset-password-rules" className="mt-2 min-h-[18px]">
                  <span className="block h-1 w-full overflow-hidden rounded-full bg-[var(--line)]">
                    <span
                      className={cn("block h-full rounded-full transition-[width,background-color]", passwordOk ? "bg-[var(--success)]" : "bg-[var(--accent)]")}
                      style={{ width: `${(doneCount / 3) * 100}%` }}
                    />
                  </span>
                  <ul className="mt-2 grid grid-cols-3 gap-1">
                    {checks.map((item) => (
                      <li
                        key={item.label}
                        className={cn("flex items-center gap-1 text-[11px] leading-4", item.ok ? "text-[var(--success)]" : "text-[var(--muted)]")}
                      >
                        {item.ok ? <Check className="size-3 shrink-0" /> : <X className="size-3 shrink-0" />}
                        <span className="truncate">{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-semibold">{t.reset.confirmLabel}</span>
                <div className="mt-2">
                  <PasswordInput
                    leadingIcon={<ShieldCheck className="size-4" />}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder={t.reset.confirmPlaceholder}
                    autoComplete="new-password"
                    aria-describedby={error ? "reset-error" : undefined}
                  />
                </div>
              </label>

              <div className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--paper)] p-3 text-xs leading-5 text-[var(--muted)]">
                {t.reset.rules}
              </div>

              {error && (
                <div id="reset-error" role="alert" className="rounded-[var(--radius-control)] border border-[var(--danger)]/25 bg-[var(--danger-faint)] px-3 py-2.5 text-xs text-[var(--danger)]">
                  {error}
                </div>
              )}

              <Button type="submit" variant="accent" size="lg" className="w-full" disabled={submitting} aria-busy={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                {submitting ? t.reset.submitting : t.reset.submit}
              </Button>
            </form>

            <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-4 text-xs">
              <Link href="/login" className="inline-flex items-center gap-1.5 font-semibold text-[var(--muted)] transition-colors hover:text-[var(--ink)]">
                <ArrowLeft className="size-3.5" />
                {t.backToLogin}
              </Link>
              <span className="text-[var(--muted)]">{d.auth.login.identityBuyer}</span>
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
