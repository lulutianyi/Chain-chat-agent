"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { KeyRound, Loader2, Smartphone } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { consumeSessionExpired, requestSupplierCode, setSupplierAuth, supplierLogin } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/types";

export default function SupplierLoginPage() {
  const router = useRouter();
  const { d } = useI18n();
  const t = d.auth.supplierLogin;
  const shared = d.auth.shared;
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [countdown, setCountdown] = useState(0);
  // 供应商令牌失效后会被跳回这里；说明原因，否则看着像是被无故踢出。
  // 只在挂载后读，避免服务端/客户端首帧不一致造成水合报错。
  const [expiredNotice, setExpiredNotice] = useState(false);

  useEffect(() => { setExpiredNotice(consumeSessionExpired() === "supplier"); }, []);

  // 后端对同一手机号的取码限制是 60 秒 1 次，前端用倒计时对齐，
  // 避免用户连点后撞上 429 只看到一句报错。
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function sendCode() {
    const trimmed = phone.trim();
    if (!/^\d{11}$/.test(trimmed)) { setError(shared.invalidPhone); return; }
    setRequesting(true); setError(""); setNotice("");
    try {
      const res = await requestSupplierCode(trimmed);
      setDemoCode(res.code ?? "");
      setCode(res.code ?? ""); // 演示模式：自动填入验证码
      setNotice(res.code ? format(shared.demoCodeNotice, { code: res.code }) : shared.codeSent);
      setCountdown(60);
    } catch (e) { setError(e instanceof Error ? e.message : shared.sendCodeFailed); }
    finally { setRequesting(false); }
  }

  async function login(e: FormEvent) {
    e.preventDefault();
    // 不在「没填完」时禁用按钮：灰掉的按钮不会告诉用户为什么不能点，
    // 提交一次、给一句明确的报错，比让按钮沉默要好。
    if (!/^\d{11}$/.test(phone.trim())) { setError(shared.invalidPhone); return; }
    if (!code.trim()) { setError(t.codeRequired); return; }
    setLoggingIn(true); setError("");
    try {
      const res = await supplierLogin(phone.trim(), code.trim());
      setSupplierAuth(res.access_token, res.phone);
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/supplier") ? next : "/supplier");
    } catch (err) { setError(err instanceof Error ? err.message : shared.loginFailed); }
    finally { setLoggingIn(false); }
  }

  const errorId = error ? "supplier-login-error" : undefined;

  return (
    <AuthLayout
      asideTitle={t.asideTitle}
      asideBody={t.asideBody}
    >
      <div className="p-7 sm:p-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">{t.title}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t.subtitle}</p>

        <div className="mt-6 flex items-center gap-2 text-xs">
          <span className="text-[var(--muted)]">{shared.identityLabel}</span>
          <span className="rounded-full bg-[var(--paper)] px-2.5 py-1 font-semibold text-[var(--ink)]">{t.identitySupplier}</span>
          <Link
            href="/login"
            className="ml-auto font-semibold text-[var(--accent-strong)] underline underline-offset-2 transition-colors hover:text-[var(--accent)]"
          >
            {t.switchToBuyer}
          </Link>
        </div>

        {/* 这只是一条中性说明，不是「已通过 / 识别一致」——不占用 success 的语义色 */}
        <p className="mt-4 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-xs leading-5 text-[var(--muted)]">
          {t.demoNote}
        </p>

        {expiredNotice && (
          <p
            role="status"
            className="mt-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-xs leading-5 text-[var(--muted)]"
          >
            {t.expiredNotice}
          </p>
        )}

        {error && (
          <div
            id="supplier-login-error"
            role="alert"
            className="mt-4 rounded-[var(--radius-control)] border border-[var(--danger)]/25 bg-[var(--danger-faint)] px-3 py-2.5 text-xs text-[var(--danger)]"
          >
            {error}
          </div>
        )}

        <form onSubmit={login} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold">{shared.phoneLabel}</span>
            <div className="relative mt-2">
              <Smartphone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
              <Input
                className="pl-9"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={shared.phonePlaceholder}
                inputMode="numeric"
                maxLength={11}
                autoComplete="tel"
                aria-describedby={errorId}
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold">{shared.codeLabel}</span>
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                <Input
                  className="pl-9"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={shared.codePlaceholder}
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  aria-describedby={errorId}
                />
              </div>
              <Button type="button" variant="outline" onClick={() => void sendCode()} disabled={requesting || countdown > 0}>
                {requesting ? <Loader2 className="size-4 animate-spin" /> : countdown > 0 ? format(shared.countdown, { seconds: countdown }) : shared.sendCode}
              </Button>
            </div>
          </label>

          {demoCode && (
            <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--accent)]/40 bg-[var(--accent-faint)] p-3">
              <div className="text-xs font-semibold text-[var(--accent-strong)]">{shared.demoCodeTitle}</div>
              <div className="tnum mt-1 font-mono text-lg font-bold tracking-[.3em] text-[var(--ink)]">{demoCode}</div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">{notice}</p>
            </div>
          )}

          <Button type="submit" variant="accent" size="lg" className="w-full" disabled={loggingIn} aria-busy={loggingIn}>
            {loggingIn ? <Loader2 className="size-4 animate-spin" /> : null}
            {loggingIn ? t.submitting : t.submit}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs leading-5 text-[var(--muted)]">
          {t.termsLead}
          <Link href="/terms" className="font-semibold text-[var(--accent-strong)] underline underline-offset-2 hover:text-[var(--accent)]">
            {shared.termsLink}
          </Link>
          {t.termsTail}
        </p>
      </div>
    </AuthLayout>
  );
}
