"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Inbox,
  Loader2,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChatMessageList } from "@/components/chat-message";
import { Textarea } from "@/components/ui/textarea";
import {
  forceLoginRedirect,
  getNegotiation,
  getSupplierNegotiations,
  getSupplierToken,
  isAuthError,
  sendSupplierMessage,
  type Negotiation,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

const MESSAGE_PAGE_SIZE = 10;

export default function SupplierChatPage() {
  const { d } = useI18n();
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">{d.common.actions.loading}</div>}>
      <SupplierChatContent />
    </Suspense>
  );
}

function SupplierChatContent() {
  const { d } = useI18n();
  const t = d.supplier;
  /** 会话状态显示名。未登记的状态值（后端新增）原样显示，不显示成空白。 */
  const statusText: Record<string, string> = {
    ai_active: t.status.aiActive,
    manual_required: t.status.manualRequired,
    human_active: t.status.humanActive,
    closed: t.status.closed,
  };
  const [negotiation, setNegotiation] = useState<Negotiation | null>(null);
  const [sessions, setSessions] = useState<Negotiation[] | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [visibleMessageCount, setVisibleMessageCount] = useState(MESSAGE_PAGE_SIZE);
  const messageViewportRef = useRef<HTMLDivElement>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);
  const previousScrollHeightRef = useRef<number | null>(null);
  // 是否跟随最新消息。用户向上翻阅历史时置为 false，避免被自动滚动打断。
  const stickToBottomRef = useRef(true);
  // 标记「这次滚动是程序贴底造成的」，避免它被误判成用户向上翻阅。
  const programmaticScrollRef = useRef(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const visibleMessages = negotiation?.messages.slice(-visibleMessageCount) ?? [];
  const hasOlderMessages = Boolean(
    negotiation && visibleMessageCount < negotiation.messages.length,
  );

  const pinToBottom = useCallback(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    programmaticScrollRef.current = true;
    viewport.scrollTop = viewport.scrollHeight;
  }, []);

  // 切换会话：重置分页、恢复跟随状态，并连续若干帧贴底（内容高度要等字体与换行定型）。
  useLayoutEffect(() => {
    setVisibleMessageCount(MESSAGE_PAGE_SIZE);
    stickToBottomRef.current = true;
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    let frames = 0;
    let raf = 0;
    const tick = () => {
      pinToBottom();
      if (++frames < 12) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [negotiation?.id, pinToBottom]);

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (previousScrollHeightRef.current !== null && viewport) {
      viewport.scrollTop += viewport.scrollHeight - previousScrollHeightRef.current;
      previousScrollHeightRef.current = null;
    }
  }, [visibleMessageCount]);

  // 新增消息时跟随最新一条。
  useLayoutEffect(() => {
    if (stickToBottomRef.current) pinToBottom();
  }, [negotiation?.messages.length, pinToBottom]);

  // 内容高度可能继续变化（字体、图片、异步刷新），用 ResizeObserver 继续跟随。
  useEffect(() => {
    const content = messageContentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) pinToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [pinToBottom, negotiation?.id]);

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
    if (!viewport) return;
    if (programmaticScrollRef.current) {
      // 这次滚动是程序贴底造成的，不代表用户向上翻阅。
      programmaticScrollRef.current = false;
      return;
    }
    // 距底部 80px 以内视为「正在跟随最新消息」。
    stickToBottomRef.current =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80;
    if (viewport.scrollTop < 48) loadOlderMessages();
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
          // 令牌失效：清掉本地登录态并回登录页。此前只显示一句「登录已失效」，
          // 页面却留在原地，用户除了手动退出没有别的出路。
          if (isAuthError(e)) { forceLoginRedirect("supplier", window.location.pathname + window.location.search); return; }
          setError(e instanceof Error ? e.message : t.chat.loadErrorSessions);
        } finally {
          setLoading(false);
        }
        return;
      }
      try {
        setNegotiation(await getNegotiation(target));
        setError("");
      } catch (e) {
        if (isAuthError(e)) { forceLoginRedirect("supplier", window.location.pathname + window.location.search); return; }
        setError(e instanceof Error ? e.message : t.chat.loadErrorNegotiation);
      } finally {
        setLoading(false);
      }
    },
    [idParam, t],
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
      setError(err instanceof Error ? err.message : t.chat.sendError);
    } finally {
      setSending(false);
    }
  }

  if (loading)
    return (
      <div className="py-20 text-center text-sm text-[var(--muted)]">
        {t.chat.loading}
      </div>
    );
  if (!negotiation) {
    if (error && !sessions)
      return (
        <Card className="mx-auto max-w-xl">
          <CardContent className="p-10 text-center">
            <Inbox className="mx-auto size-10 text-[var(--muted)]" />
            <h1 className="mt-4 text-xl font-bold">{t.chat.loadErrorSessions}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
            <Link href="/supplier">
              <Button variant="outline" className="mt-6">
                {t.chat.backToOffer}
              </Button>
            </Link>
          </CardContent>
        </Card>
      );
    return (
      <div className="mx-auto flex max-w-3xl flex-col animate-rise">
        <div className="mb-5">
          <h1 className="text-[28px] font-bold tracking-tight">{t.chat.listTitle}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t.chat.listBody}
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
                          "border-0 px-2 py-0.5 text-[11px]",
                          item.status === "ai_active"
                            ? "bg-[var(--success-faint)] text-[var(--success)]"
                            : "bg-[var(--accent-faint)] text-[var(--accent-strong)]",
                        )}
                      >
                        {statusText[item.status] ?? item.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {format(t.chat.listItemMeta, { id: item.id, score: item.score, count: item.messages.length })}
                    </div>
                  </div>
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => open(item.id)}
                  >
                    {t.chat.continueChat}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-10 text-center">
              <Inbox className="mx-auto size-10 text-[var(--muted)]" />
              <h1 className="mt-4 text-xl font-bold">{t.chat.emptyTitle}</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {t.chat.emptyBody}
              </p>
              <Link href="/supplier">
                <Button variant="accent" className="mt-6">
                  {t.chat.emptyCta}
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
            {t.chat.backToOffer}
          </Link>
          <h1 className="text-[28px] font-bold tracking-tight">
            {format(t.chat.productChatTitle, { product: negotiation.product.name })}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {format(t.chat.supplierLine, { company: negotiation.supplier.company_name, id: negotiation.id })}
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
          <span>{t.chat.recordTitle}</span>
          <span>{format(t.units.messages, { count: negotiation.messages.length })}</span>
        </div>
        <div
          ref={messageViewportRef}
          onScroll={handleMessageScroll}
          className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--chat-canvas)] p-4 sm:p-6"
        >
          <div ref={messageContentRef} className="flex min-h-full flex-col gap-5">
          {hasOlderMessages && (
            <button
              type="button"
              onClick={loadOlderMessages}
              className="mx-auto block rounded-full bg-[var(--paper-deep)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--ink)]"
            >
              {t.chat.loadOlder}
            </button>
          )}
          {negotiation.messages.length ? (
            <ChatMessageList
              messages={visibleMessages}
              supplierName={negotiation.supplier.company_name}
            />
          ) : (
            <div className="grid flex-1 place-items-center text-center text-sm text-[var(--muted)]">
              <div>
                <Inbox className="mx-auto mb-3 size-8" />
                {t.chat.waiting}
              </div>
            </div>
          )}
          </div>
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
                placeholder={t.chat.inputPlaceholder}
                className="min-h-20 pr-14"
              />
              <Button
                type="submit"
                variant="accent"
                size="icon"
                aria-label={t.chat.send}
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
            <div className="mt-2 text-xs text-[var(--muted)]">
              {t.chat.inputHint}
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-2 border-t border-[var(--line)] bg-white p-4 text-sm text-[var(--muted)]">
            <Lock className="size-4" />
            {negotiation.status === "human_active"
              ? t.chat.lockedHuman
              : negotiation.status === "closed"
                ? t.chat.lockedClosed
                : t.chat.lockedDefault}
          </div>
        )}
      </Card>
    </div>
  );
}
