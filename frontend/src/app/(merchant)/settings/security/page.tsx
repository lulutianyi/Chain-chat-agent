"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { changeMerchantPassword } from "@/lib/api";

// 与后端一致：长度 > 8 位，须同时包含英文、数字。
function validatePassword(pw: string): string | null {
  if (pw.length <= 8) return "新密码长度需大于 8 位";
  if (!/[a-zA-Z]/.test(pw)) return "新密码需包含英文字母";
  if (!/[0-9]/.test(pw)) return "新密码需包含数字";
  return null;
}

export default function SecurityPage() {
  const [current, setCurrent] = useState("");
  const [nextPw, setNextPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!current) { setError("请输入原密码"); return; }
    const ruleError = validatePassword(nextPw);
    if (ruleError) { setError(ruleError); return; }
    if (nextPw !== confirm) { setError("两次输入的新密码不一致"); return; }
    setSubmitting(true);
    try {
      await changeMerchantPassword(current, nextPw);
      setDone(true);
      setCurrent(""); setNextPw(""); setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-rise mx-auto max-w-xl py-4 sm:py-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--accent-strong)]"><span className="h-px w-5 bg-[var(--accent)]" />账号安全</div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">修改登录密码</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">新密码需大于 8 位，并同时包含英文字母和数字。修改后用于网页登录。</p>
      </div>

      <Card className="overflow-hidden">
        <div className="h-2 bg-[var(--accent)]" />
        <CardContent className="p-6 sm:p-8">
          {done ? (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-[var(--success-faint)] text-[var(--success)]"><CheckCircle2 className="size-7" /></div>
              <h2 className="mt-5 text-lg font-bold">密码已更新</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">下次登录请使用新密码。</p>
              <Link href="/dashboard" className="mt-6"><Button variant="accent"><ArrowLeft className="size-4" />返回采购工作台</Button></Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <label className="block"><span className="text-xs font-semibold">原密码</span><div className="relative mt-2"><KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /><Input type="password" className="pl-9" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="请输入当前密码" autoComplete="current-password" /></div></label>
              <label className="block"><span className="text-xs font-semibold">新密码</span><div className="relative mt-2"><ShieldCheck className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /><Input type="password" className="pl-9" value={nextPw} onChange={(e) => setNextPw(e.target.value)} placeholder="大于 8 位，含英文 + 数字" autoComplete="new-password" /></div></label>
              <label className="block"><span className="text-xs font-semibold">确认新密码</span><div className="relative mt-2"><ShieldCheck className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /><Input type="password" className="pl-9" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="再次输入新密码" autoComplete="new-password" /></div></label>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3 text-xs leading-5 text-[var(--muted)]">密码规则：长度大于 8 位 · 至少 1 个英文字母 · 至少 1 个数字。</div>
              {error && <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-faint)] p-3 text-xs text-[var(--danger)]">{error}</div>}
              <div className="flex gap-3 pt-1">
                <Link href="/dashboard" className="flex-1"><Button type="button" variant="outline" className="w-full">取消</Button></Link>
                <Button type="submit" variant="accent" className="flex-1" disabled={submitting}>{submitting ? <Loader2 className="size-4 animate-spin" /> : "确认修改"}</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
