"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  Inbox,
  Loader2,
  Lock,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  getNegotiation,
  getSupplierNegotiations,
  getSupplierToken,
  sendSupplierMessage,
  type Negotiation,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const statusText: Record<string, string> = {
  ai_active: "AI 洽谈中",
  manual_required: "等待人工沟通",
  human_active: "人工沟通中",
  closed: "已结束",
};
const MESSAGE_PAGE_SIZE = 10;

export default function SupplierChatPage() {
  const [negotiation, setNegotiation] = useState<Negotiation | null>(null);
  const [sessions, setSessions] = useState<Negotiation[] | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [visibleMessageCount, setVisibleMessageCount] = useState(MESSAGE_PAGE_SIZE);
  const messageViewportRef = useRef<HTMLDivElement>(null);
  const previousScrollHeightRef = useRef<number | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const visibleMessages = negotiation?.messages.slice(-visibleMessageCount) ?? [];
  const hasOlderMessages = Boolean(
    negotiation && visibleMessageCount < negotiation.messages.length,
  );

  useEffect(() => {
    setVisibleMessageCount(MESSAGE_PAGE_SIZE);
    requestAnimationFrame(() => {
      const viewport = messageViewportRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
  }, [negotiation?.id]);

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (previousScrollHeightRef.current !== null && viewport) {
      viewport.scrollTop += viewport.scrollHeight - previousScrollHeightRef.current;
      previousScrollHeightRef.current = null;
    }
  }, [visibleMessageCount]);

  useEffect(() => {
    requestAnimationFrame(() => {
      const viewport = messageViewportRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
  }, [negotiation?.messages.length]);

  function loadOlderMessages() {
    if (!negotiation || !hasOlderMessages) return;
    const viewport = messageViewportRef.current;
    previousScrollHeightRef.current = viewport?.scrollHeight ?? null;
    setVisibleMessageCount((current) =>
      Math.min(current + MESSAGE_PAGE_SIZE, negotiation.messages.length),
    );
  }

  function handleMessageScroll() {
    const viewport = messageViewportRef.current;
    if (viewport && viewport.scrollTop < 48) loadOlderMessages();
  }

  useEffect(() => {
    if (!getSupplierToken()) {
      const next = window.location.pathname + window.location.search;
      router.replace(`/supplier/login?next=${encodeURIComponent(next)}`);
    }
  }, [router]);

  const load = useCallback(
    async (id?: number) => {
      const target = id ?? Number(idParam || 0);
      if (!target) {
        // URL 上没有会话编号时，列出登录手机号名下的全部会话，供供应商找回历史洽谈。
        try {
          setSessions(await getSupplierNegotiations());
        } catch (e) {
          setError(e instanceof Error ? e.message : "无法读取洽谈会话");
        } finally {
          setLoading(false);
        }
        return;
      }
      try {
        setNegotiation(await getNegotiation(target));
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "无法读取谈判会话");
      } finally {
        setLoading(false);
      }
    },
    [idParam],
  );

  // 首次挂载、以及 URL 中 id 变化时（例如在「我的洽谈」下拉里切换会话）重新加载。
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  function open(id: number) {
    setLoading(true);
    setSessions(null);
    router.replace(`/supplier/chat?id=${id}`);
  }

  const canSend = Boolean(
    negotiation &&
      ["ai_active", "manual_required"].includes(negotiation.status),
  );

  async function submit() {
    if (!negotiation || !draft.trim() || !canSend || sending) return;
    setSending(true);
    try {
      await sendSupplierMessage(negotiation.id, draft.trim());
      setDraft("");
      await load(negotiation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  if (loading)
    return (
      <div className="py-20 text-center text-sm text-[var(--muted)]">
        正在读取洽谈会话…
      </div>
    );
  if (!negotiation) {
    if (error && !sessions)
      return (
        <Card className="mx-auto max-w-xl">
          <CardContent className="p-10 text-center">
            <Inbox className="mx-auto size-10 text-[var(--muted)]" />
            <h1 className="mt-4 text-xl font-bold">无法读取洽谈会话</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
            <Link href="/supplier">
              <Button variant="outline" className="mt-6">
                返回提交资料
              </Button>
            </Link>
          </CardContent>
        </Card>
      );
    return (
      <div className="mx-auto flex max-w-3xl flex-col animate-rise">
        <div className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight">我的洽谈会话</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            登录手机号名下的全部供货洽谈，点击即可继续沟通，不再受页面跳转影响。
          </p>
        </div>
        {error && (
          <div className="mb-4 rounded-xl border border-[var(--warning)]/20 bg-[var(--warning-faint)] p-3 text-sm text-[var(--warning)]">
            {error}
          </div>
        )}
        {sessions?.length ? (
          <div className="space-y-3">
            {sessions.map((item) => (
              <Card
                key={item.id}
                className="transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      {item.product.name}
                      <Badge
                        className={cn(
                          "border-0 px-2 py-0.5 text-[10px]",
                          item.status === "ai_active"
                            ? "bg-[var(--success-faint)] text-[var(--success)]"
                            : "bg-[var(--accent-faint)] text-[var(--accent-strong)]",
                        )}
                      >
                        {statusText[item.status] ?? item.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      会话 #{item.id} · 评分 {item.score} ·{" "}
                      {item.messages.length} 条消息
                    </div>
                  </div>
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => open(item.id)}
                  >
                    继续洽谈
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-10 text-center">
              <Inbox className="mx-auto size-10 text-[var(--muted)]" />
              <h1 className="mt-4 text-xl font-bold">还没有洽谈会话</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                先提交供货方案，系统会为你创建与采购 AI 的洽谈会话。
              </p>
              <Link href="/supplier">
                <Button variant="accent" className="mt-6">
                  去提交资料
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col animate-rise sm:h-[calc(100dvh-8rem)] sm:min-h-0">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/supplier"
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <ArrowLeft className="size-3.5" />
            返回提交资料
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {negotiation.product.name} · AI 洽谈
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            供货方：{negotiation.supplier.company_name} · 会话 #{negotiation.id}
          </p>
        </div>
        <Badge
          className={cn(
            "border-0 px-3 py-1.5",
            negotiation.status === "ai_active"
              ? "bg-[var(--success-faint)] text-[var(--success)]"
              : "bg-[var(--accent-faint)] text-[var(--accent-strong)]",
          )}
        >
          {statusText[negotiation.status] ?? negotiation.status}
        </Badge>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-[var(--warning)]/20 bg-[var(--warning-faint)] p-3 text-sm text-[var(--warning)]">
          {error}
        </div>
      )}

      <Card className="flex min-h-[28rem] flex-col overflow-hidden sm:min-h-0 sm:flex-1">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3 text-xs text-[var(--muted)]">
          <span>与 AI 采购助手的洽谈记录</span>
          <span>{negotiation.messages.length} 条消息</span>
        </div>
        <div
          ref={messageViewportRef}
          onScroll={handleMessageScroll}
          className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-[#f8fafc] p-4 sm:p-6"
        >
          {hasOlderMessages && (
            <button
              type="button"
              onClick={loadOlderMessages}
              className="mx-auto block rounded-full bg-[var(--paper-deep)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--ink)]"
            >
              向上滚动加载更早消息
            </button>
          )}
          {negotiation.messages.length ? (
            visibleMessages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-2.5",
                  message.sender !== "supplier" && "justify-end",
                  message.sender === "system" && "justify-center",
                )}
              >
                {message.sender === "supplier" && (
                  <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--paper-deep)] text-xs font-bold">
                    {negotiation.supplier.company_name.slice(0, 1)}
                  </div>
                )}
                {message.sender === "system" ? (
                  <div className="rounded-full bg-[var(--paper-deep)] px-3 py-1 text-[10px] text-[var(--muted)]">
                    {message.content}
                  </div>
                ) : (
                  <div
                    className={cn(
                      "max-w-[82%]",
                      message.sender !== "supplier" && "text-right",
                    )}
                  >
                    <div
                      className={cn(
                        "inline-block rounded-2xl px-4 py-3 text-left text-sm leading-6",
                        message.sender === "supplier"
                          ? "rounded-tl-sm border border-[var(--line)] bg-white"
                          : message.sender === "ai"
                            ? "rounded-tr-sm bg-[var(--ink)] text-white"
                            : "rounded-tr-sm bg-[var(--accent)] text-white",
                      )}
                    >
                      {message.sender === "ai" && (
                        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-[#93c5fd]">
                          <Bot className="size-3" />
                          AI 采购助手
                        </div>
                      )}
                      {message.sender === "human" && (
                        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-white/75">
                          <UserRound className="size-3" />
                          店长本人
                        </div>
                      )}
                      {message.content}
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--muted)]">
                      {new Date(message.created_at).toLocaleString("zh-CN")}
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="grid h-full place-items-center text-center text-sm text-[var(--muted)]">
              <div>
                <Inbox className="mx-auto mb-3 size-8" />
                会话已创建，等待供应商发言
              </div>
            </div>
          )}
        </div>

        {canSend ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="shrink-0 border-t border-[var(--line)] bg-white p-4"
          >
            <div className="relative">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                placeholder="输入你的报价或条款回复…（Enter 发送，Shift+Enter 换行）"
                className="min-h-20 pr-14"
              />
              <Button
                type="submit"
                variant="accent"
                size="icon"
                disabled={!draft.trim() || sending}
                className="absolute bottom-2 right-2 size-9"
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </Button>
            </div>
            <div className="mt-2 text-[10px] text-[var(--muted)]">
              AI 采购助手会自动回复；底线与评分由程序校验，AI
              不会擅自承诺下单或付款。
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-2 border-t border-[var(--line)] bg-white p-4 text-sm text-[var(--muted)]">
            <Lock className="size-4" />
            {negotiation.status === "human_active"
              ? "商家已接管本次洽谈，AI 自动回复已停止。"
              : negotiation.status === "closed"
                ? "本洽谈已结束，如需继续请重新提交供货方案。"
                : "当前不可发送消息。"}
          </div>
        )}
      </Card>
    </div>
  );
}
