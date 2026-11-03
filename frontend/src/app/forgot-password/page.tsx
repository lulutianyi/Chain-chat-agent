"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Loader2, Mail } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, requestMerchantPasswordReset, verifyMerchantResetCode } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/types";
import { EMAIL_RE, saveResetToken } from "@/lib/password-reset";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { d } = useI18n();
  const t = d.auth.forgot;
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [expiresIn, setExpiresIn] = useState(600);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  // 邮件里的链接会带 ?email=，回到页面时自动回填；不读 useSearchParams，
  // 因为那会把整页拖进 Suspense 边界，而这里只需要挂载后读一次。
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("email");
    if (value) setEmail(value);
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  function errorText(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
      if (err.status === 429) return t.errors.tooMany;
      if (err.status === 503) return t.errors.serviceUnavailable;
      if (err.status === 400) return t.errors.verifyFailed;
      if (err.status === 422) return t.errors.emailInvalid;
    }
    return err instanceof Error ? err.message : fallback;
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    const value = email.trim();
    if (!value) { setError(t.errors.emailRequired); return; }
    if (!EMAIL_RE.test(value)) { setError(t.errors.emailInvalid); return; }
    setSending(true);
    setError("");
    try {
      const result = await requestMerchantPasswordReset(value);
      setEmail(value);
      setExpiresIn(result.expires_in);
      setCode("");
      setStep("code");
      setCountdown(60);
    } catch (err) {
      setError(errorText(err, t.errors.sendFailed));
    } finally {
      setSending(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) { setError(t.errors.codeRequired); return; }
    setVerifying(true);
    setError("");
    try {
      const result = await verifyMerchantResetCode(email.trim(), code.trim());
      if (!saveResetToken(result.reset_token)) {
        setError(t.errors.verifyFailed);
        return;
      }
      router.push("/forgot-password/reset");
    } catch (err) {
      setError(errorText(err, t.errors.verifyFailed));
    } finally {
      setVerifying(false);
    }
  }

  const minutes = Math.max(1, Math.round(expiresIn / 60));

  return (
    <AuthLayout asideTitle={t.asideTitle} asideBody={t.asideBody}>
      <div className="p-7 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">{t.title}</h1>
          <span className="shrink-0 rounded-full bg-[var(--paper)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
            {step === "email" ? t.email.step : t.code.step}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t.subtitle}</p>

        {step === "email" ? (
          <form onSubmit={sendCode} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold">{t.email.label}</span>
              <div className="relative mt-2">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                <Input
                  className="pl-9"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t.email.placeholder}
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  aria-describedby={error ? "forgot-error" : undefined}
                />
              </div>
            </label>
            {error && (
              <div id="forgot-error" role="alert" className="rounded-[var(--radius-control)] border border-[var(--danger)]/25 bg-[var(--danger-faint)] px-3 py-2.5 text-xs text-[var(--danger)]">
                {error}
              </div>
            )}
            <Button type="submit" variant="accent" size="lg" className="w-full" disabled={sending} aria-busy={sending}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : null}
              {sending ? t.email.submitting : t.email.submit}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-5 space-y-4">
            <div className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-xs leading-5 text-[var(--muted)]">
              <p>{format(t.code.body, { email: email.trim(), minutes })}</p>
              <p className="mt-1">{t.email.sentNotice}</p>
            </div>
            <label className="block">
              <span className="text-xs font-semibold">{t.code.label}</span>
              <div className="relative mt-2">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                <Input
                  className="pl-9 tracking-[.35em]"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  placeholder={t.code.placeholder}
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  aria-describedby={error ? "forgot-error" : undefined}
                />
              </div>
            </label>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => { setStep("email"); setCode(""); setError(""); }}
                className="text-xs font-semibold text-[var(--muted)] underline underline-offset-2 transition-colors hover:text-[var(--ink)]"
              >
                {t.code.changeEmail}
              </button>
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={sending || countdown > 0}
                className="text-xs font-semibold text-[var(--accent-strong)] underline underline-offset-2 transition-colors hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--muted)] disabled:no-underline"
              >
                {sending ? t.email.submitting : countdown > 0 ? format(t.code.resendIn, { seconds: countdown }) : t.code.resend}
              </button>
            </div>
            {error && (
              <div id="forgot-error" role="alert" className="rounded-[var(--radius-control)] border border-[var(--danger)]/25 bg-[var(--danger-faint)] px-3 py-2.5 text-xs text-[var(--danger)]">
                {error}
              </div>
            )}
            <p className="text-[11px] leading-5 text-[var(--muted)]">{t.code.hint}</p>
            <Button type="submit" variant="accent" size="lg" className="w-full" disabled={verifying} aria-busy={verifying}>
              {verifying ? <Loader2 className="size-4 animate-spin" /> : null}
              {verifying ? t.code.submitting : t.code.submit}
            </Button>
          </form>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-4 text-xs">
          <Link href="/login" className="inline-flex items-center gap-1.5 font-semibold text-[var(--muted)] transition-colors hover:text-[var(--ink)]">
            <ArrowLeft className="size-3.5" />
            {t.backToLogin}
          </Link>
          <span className="text-[var(--muted)]">{d.auth.login.identityBuyer}</span>
        </div>
      </div>
    </AuthLayout>
  );
}
