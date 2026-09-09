"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Building2, Bug, KeyRound, Loader2, PackageOpen } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearMerchantAuth, merchantLogin, setMerchantAuth } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "buyer">("choose");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function close() {
    setOpen(false);
    setStep("choose");
    setPassword("");
    setError("");
  }

  function goSupplier() {
    router.push("/supplier");
  }

  function goDebug() {
    clearMerchantAuth();
    router.push("/dashboard");
  }

  async function loginBuyer() {
    if (!password) {
      setError("请输入登录密码");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await merchantLogin(password);
      setMerchantAuth(res.access_token);
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="animate-rise w-full max-w-md">
        <Card className="overflow-hidden">
          <div className="h-2 bg-[var(--accent)]" />
          <CardContent className="p-8 sm:p-10">
            <div className="flex flex-col items-center text-center">
              <div className="grid size-16 place-items-center rounded-2xl bg-[var(--ink)] shadow-lg">
                <BrandMark />
              </div>
              <h1 className="mt-6 text-3xl font-bold tracking-tight">
                链谈 <span className="text-[var(--accent)]">Agent</span>
              </h1>
              <p className="mt-1 text-[10px] tracking-[.22em] text-[var(--muted)]">SUPPLY NEGOTIATOR</p>
              <p className="mt-5 max-w-xs text-sm leading-6 text-[var(--muted)]">为中小商家自动接待、筛选和分层供应商的采购谈判工作台。</p>
            </div>
            <Button
              variant="accent"
              size="lg"
              className="mt-8 w-full"
              onClick={() => {
                setStep("choose");
                setError("");
                setOpen(true);
              }}
            >
              登录
            </Button>
            <p className="mt-4 text-center text-[10px] leading-4 text-[var(--muted)]">采购方需密码登录 · 供应商使用手机号验证码 · 调试入口免登录</p>
          </CardContent>
        </Card>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[var(--ink)]/30" onClick={close} />
          <div className="relative w-full max-w-sm rounded-2xl border border-[var(--line)] bg-white p-6 shadow-2xl">
            {step === "choose" ? (
              <>
                <h2 className="text-lg font-bold">选择进入身份</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">三种身份对应不同的进入方式</p>
                <div className="mt-5 space-y-3">
                  <button
                    onClick={() => setStep("buyer")}
                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-white p-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-faint)]/40"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--ink)] text-white"><Building2 className="size-5" /></span>
                    <span><span className="block text-sm font-bold">采购方</span><span className="block text-xs text-[var(--muted)]">密码登录，进入采购工作台与实时谈判</span></span>
                  </button>
                  <button
                    onClick={goSupplier}
                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-white p-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-faint)]/40"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--ink)] text-white"><PackageOpen className="size-5" /></span>
                    <span><span className="block text-sm font-bold">供应商</span><span className="block text-xs text-[var(--muted)]">手机号登录，进入供应商入口</span></span>
                  </button>
                  <button
                    onClick={goDebug}
                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-white p-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-faint)]/40"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--ink)] text-white"><Bug className="size-5" /></span>
                    <span><span className="block text-sm font-bold">网页调试</span><span className="block text-xs text-[var(--muted)]">免登录，直达现有四页工作台</span></span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setStep("choose"); setError(""); setPassword(""); }}
                  className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  <ArrowLeft className="size-3.5" />返回
                </button>
                <h2 className="text-lg font-bold">采购方登录</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">输入登录密码进入采购工作台</p>
                <div className="relative mt-4">
                  <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                  <Input
                    type="password"
                    className="pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="登录密码"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") void loginBuyer(); }}
                  />
                </div>
                {error && <div className="mt-3 rounded-xl border border-[var(--warning)]/20 bg-[var(--warning-faint)] p-2.5 text-xs text-[var(--warning)]">{error}</div>}
                <Button variant="accent" size="lg" className="mt-4 w-full" disabled={submitting} onClick={() => void loginBuyer()}>
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : "登录并进入"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
