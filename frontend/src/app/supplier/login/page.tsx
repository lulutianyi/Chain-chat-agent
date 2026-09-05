"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, Building2, KeyRound, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requestSupplierCode, setSupplierAuth, supplierLogin } from "@/lib/api";

export default function SupplierLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function sendCode() {
    const trimmed = phone.trim();
    if (!/^\d{6,40}$/.test(trimmed)) { setError("请输入正确的手机号"); return; }
    setRequesting(true); setError(""); setNotice("");
    try {
      const res = await requestSupplierCode(trimmed);
      setDemoCode(res.code);
      setCode(res.code); // 演示模式：自动填入验证码
      setNotice(`演示验证码已生成：${res.code}（5 分钟内有效）`);
    } catch (e) { setError(e instanceof Error ? e.message : "获取验证码失败"); }
    finally { setRequesting(false); }
  }

  async function login(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim() || !code.trim()) { setError("请先填写手机号并获取验证码"); return; }
    setLoggingIn(true); setError("");
    try {
      const res = await supplierLogin(phone.trim(), code.trim());
      setSupplierAuth(res.access_token, res.phone);
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/supplier") ? next : "/supplier");
    } catch (err) { setError(err instanceof Error ? err.message : "登录失败"); }
    finally { setLoggingIn(false); }
  }

  return (
    <div className="animate-rise mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center py-8">
      <Link href="/" className="mb-6 inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]"><ArrowLeft className="size-3.5" />返回首页</Link>

      <Card className="overflow-hidden">
        <div className="h-2 bg-[var(--accent)]" />
        <CardContent className="p-7 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[var(--ink)] text-white"><Building2 className="size-5" /></span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">供应商登录</h1>
              <p className="mt-0.5 text-xs text-[var(--muted)]">登录后可提交供货方案并进入 AI 洽谈</p>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 rounded-xl border border-[var(--success)]/20 bg-[var(--success-faint)] px-3 py-2 text-[11px] text-[var(--muted)]"><ShieldCheck className="size-4 text-[var(--success)]" />本演示使用假验证码，验证码会直接显示，不发送真实短信。</div>

          {error && <div className="mt-4 rounded-xl border border-[var(--warning)]/20 bg-[var(--warning-faint)] p-3 text-sm text-[var(--warning)]">{error}</div>}
          {notice && demoCode && <div className="mt-4 rounded-xl border border-dashed border-[var(--accent)]/30 bg-[var(--accent-faint)] p-3 text-sm"><div className="text-xs font-semibold text-[var(--accent-strong)]">演示验证码</div><div className="mt-1 font-mono text-lg font-bold tracking-[.3em] text-[var(--ink)]">{demoCode}</div><p className="mt-1 text-[11px] text-[var(--muted)]">{notice}</p></div>}

          <form onSubmit={login} className="mt-6 space-y-4">
            <label>
              <span className="text-xs font-semibold">手机号</span>
              <div className="relative mt-2">
                <Smartphone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                <Input className="pl-9" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="请输入手机号" inputMode="numeric" />
              </div>
            </label>

            <label>
              <span className="text-xs font-semibold">验证码</span>
              <div className="mt-2 flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                  <Input className="pl-9" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 位验证码" inputMode="numeric" maxLength={6} />
                </div>
                <Button type="button" variant="outline" onClick={() => void sendCode()} disabled={requesting || !phone.trim()}>{requesting ? <Loader2 className="size-4 animate-spin" /> : "获取验证码"}</Button>
              </div>
            </label>

            <Button type="submit" variant="accent" size="lg" className="w-full" disabled={loggingIn || !phone.trim() || !code.trim()}>{loggingIn ? <Loader2 className="size-4 animate-spin" /> : "登录并进入供应商入口"}</Button>
          </form>

          <p className="mt-5 text-center text-[10px] leading-4 text-[var(--muted)]">登录即表示你确认使用本手机号作为供应商身份标识，用于本次供货评估与洽谈。</p>
        </CardContent>
      </Card>
    </div>
  );
}
