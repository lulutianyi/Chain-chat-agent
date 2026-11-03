"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Check, KeyRound, Loader2, Mail, Smartphone, Store, User, X } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { merchantRegister, setMerchantAuth } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const DRAFT_KEY = "liantan_register_draft";

type Draft = {
  account: string;
  storeName: string;
  phone: string;
  email: string;
  agree: boolean;
};

// 草稿里**刻意不存密码**：sessionStorage 同源可读，任何一段第三方脚本都能拿到，
// 而且浏览器会话恢复会把明文密码留得更久。用户多打一次密码，好过把密码写进存储。
function emptyDraft(): Draft {
  return { account: "", storeName: "", phone: "", email: "", agree: false };
}

function loadDraft(): Draft {
  if (typeof window === "undefined") return emptyDraft();
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (raw) return { ...emptyDraft(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return emptyDraft();
}

function saveDraft(draft: Draft) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

function passwordChecks(pw: string, labels: { length: string; letter: string; digit: string }) {
  return [
    { ok: pw.length > 8, label: labels.length },
    { ok: /[a-zA-Z]/.test(pw), label: labels.letter },
    { ok: /[0-9]/.test(pw), label: labels.digit },
  ];
}

export default function RegisterPage() {
  const router = useRouter();
  const { d } = useI18n();
  const t = d.auth.register;
  const shared = d.auth.shared;
  const [initial] = useState<Draft>(loadDraft);
  const [account, setAccount] = useState(initial.account);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [storeName, setStoreName] = useState(initial.storeName);
  const [phone, setPhone] = useState(initial.phone);
  const [email, setEmail] = useState(initial.email);
  const [agree, setAgree] = useState(initial.agree);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    saveDraft({ account, storeName, phone, email, agree });
  }, [account, storeName, phone, email, agree]);

  const checks = passwordChecks(password, t.checks);
  const doneCount = checks.filter((c) => c.ok).length;
  const passwordOk = doneCount === 3;

  function validate(): string | null {
    if (!/^[A-Za-z0-9_]{3,80}$/.test(account.trim())) return t.validation.account;
    if (password.length <= 8) return t.validation.passwordLength;
    if (!/[a-zA-Z]/.test(password)) return t.validation.passwordLetter;
    if (!/[0-9]/.test(password)) return t.validation.passwordDigit;
    if (password !== confirm) return t.validation.passwordMismatch;
    if (!storeName.trim()) return t.validation.storeName;
    if (!/^\d{11}$/.test(phone.trim())) return t.validation.phone;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return t.validation.email;
    if (!agree) return t.validation.agree;
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSubmitting(true); setError("");
    try {
      const res = await merchantRegister({
        account: account.trim(),
        password,
        store_name: storeName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        agree_terms: true,
      });
      setMerchantAuth(res.access_token);
      clearDraft();
      router.replace("/dashboard");
    } catch (err) { setError(err instanceof Error ? err.message : t.failed); }
    finally { setSubmitting(false); }
  }

  const errorId = error ? "register-error" : undefined;

  return (
    <AuthLayout
      asideTitle={t.asideTitle}
      asideBody={t.asideBody}
    >
      <div className="p-7 sm:p-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">{t.title}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t.subtitle}</p>

        {error && (
          <div
            id="register-error"
            role="alert"
            className="mt-5 rounded-[var(--radius-control)] border border-[var(--danger)]/25 bg-[var(--danger-faint)] px-3 py-2.5 text-xs text-[var(--danger)]"
          >
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold">{t.accountLabel}</span>
            <div className="relative mt-2">
              <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
              <Input
                className="pl-9"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder={t.accountPlaceholder}
                autoComplete="username"
                autoFocus
                // 与登录页一致：手机键盘的自动大写会把 admin 变成 Admin，
                // 注册与登录的大小写口径必须统一，否则用户注册完就登不进去。
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby={errorId}
              />
            </div>
          </label>

          <div>
            <label className="block">
              <span className="text-xs font-semibold">{t.passwordLabel}</span>
              <div className="mt-2">
                <PasswordInput
                  leadingIcon={<KeyRound className="size-4" />}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.passwordPlaceholder}
                  autoComplete="new-password"
                  aria-describedby="register-password-rules"
                />
              </div>
            </label>
            {/* 三列一行 + 固定行高：原来竖排三行插在「密码」和「确认密码」之间，
                一输入首字符下面所有字段就整体下移 70px——边填边跳是最容易被记住的廉价感。 */}
            <div id="register-password-rules" className="mt-2 min-h-[18px]">
              <span className="block h-1 w-full overflow-hidden rounded-full bg-[var(--line)]">
                <span
                  className={cn("block h-full rounded-full transition-[width,background-color]", passwordOk ? "bg-[var(--success)]" : "bg-[var(--accent)]")}
                  style={{ width: `${(doneCount / 3) * 100}%` }}
                />
              </span>
              <ul className="mt-2 grid grid-cols-3 gap-1">
                {checks.map((c) => (
                  <li
                    key={c.label}
                    className={cn("flex items-center gap-1 text-[11px] leading-4", c.ok ? "text-[var(--success)]" : "text-[var(--muted)]")}
                  >
                    {c.ok ? <Check className="size-3 shrink-0" /> : <X className="size-3 shrink-0" />}
                    <span className="truncate">{c.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold">{t.confirmLabel}</span>
            <div className="mt-2">
              <PasswordInput
                leadingIcon={<KeyRound className="size-4" />}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t.confirmPlaceholder}
                autoComplete="new-password"
                aria-describedby={errorId}
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold">{t.storeNameLabel}</span>
            <div className="relative mt-2">
              <Store className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
              <Input className="pl-9" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder={t.storeNamePlaceholder} aria-describedby={errorId} />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold">{t.phoneLabel}</span>
            <div className="relative mt-2">
              <Smartphone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
              <Input className="pl-9" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.phonePlaceholder} inputMode="numeric" maxLength={11} autoComplete="tel" aria-describedby={errorId} />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold">{t.emailLabel}</span>
            <div className="relative mt-2">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
              <Input className="pl-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPlaceholder} type="email" autoComplete="email" aria-describedby={errorId} />
            </div>
          </label>

          {/* checkbox 与链接必须分开：把 <Link> 包在 <label> 里，点链接时部分浏览器
              会顺手把勾选框也切一下。 */}
          <div className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--paper)] p-3">
            <input
              id="agree-terms"
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
            />
            <div className="text-xs leading-5 text-[var(--muted)]">
              <label htmlFor="agree-terms" className="cursor-pointer">{t.agreeLead}</label>
              <Link href="/terms" className="mx-1 font-semibold text-[var(--accent-strong)] underline underline-offset-2">{shared.termsLink}</Link>
              {t.agreeTail}
            </div>
          </div>

          <Button type="submit" variant="accent" size="lg" className="w-full" disabled={submitting} aria-busy={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitting ? t.submitting : t.submit}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-[var(--muted)]">
          {t.haveAccount}{" "}
          <Link href="/login" className="font-semibold text-[var(--accent-strong)] underline underline-offset-2 hover:text-[var(--accent)]">
            {t.loginLink}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
