"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Inbox, Loader2, LogOut, MessageSquare, UserRound } from "lucide-react";
import { clearSupplierAuth, getSupplierNegotiations, getSupplierToken, supplierLogout, type Negotiation } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

export function SupplierShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { d } = useI18n();
  const t = d.supplier;
  /** 会话状态显示名。未登记的状态值（后端新增）原样显示，不显示成空白。 */
  const statusText: Record<string, string> = {
    ai_active: t.status.aiActive,
    manual_required: t.status.manualRequired,
    human_active: t.status.humanActive,
    closed: t.status.closed,
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<Negotiation[] | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);

  // 登录态只能在挂载后读取：服务端渲染时没有 localStorage，若在 render 期间读取，
  // 服务端(false)/浏览器(true) 渲染出的结构不一致，React 会整棵树重新生成并报 hydration 错误。
  const [token, setToken] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // 路由变化时收起所有浮层，并同步重读登录态（登录与退出都伴随跳转，靠 pathname 触发即可）。
  useEffect(() => {
    setMenuOpen(false);
    setSessionsOpen(false);
    setLogoutOpen(false);
    const next = getSupplierToken();
    setToken(next);
    setLoggedIn(Boolean(next));
    setAuthChecked(true);
    // 未登录时不要把子页面渲染出来：/supplier 与 /supplier/chat 挂载即拉数据，
    // 先渲染就等于先打出一串注定 401 的请求（商家侧早已这样处理，供应商侧此前漏了）。
    if (!next && pathname !== "/supplier/login") {
      const here = window.location.pathname + window.location.search;
      router.replace(`/supplier/login?next=${encodeURIComponent(here)}`);
    }
  }, [pathname, router]);

  // 登录身份（token）变化时清空缓存的会话，避免退出换号后仍显示上一手机号的洽谈。
  useEffect(() => { setSessions(null); setSessionsError(""); }, [token]);

  // 登录页不渲染顶栏。
  if (pathname === "/supplier/login") return <>{children}</>;

  // 未登录时不渲染子页面，避免「先发请求再跳转」；与商家端 AppShell 保持同一套写法。
  if (!authChecked || !loggedIn) {
    return <div className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">{t.shell.authChecking}</div>;
  }

  async function toggleSessions() {
    setSessionsOpen((open) => !open);
    if (sessions === null && !sessionsLoading) {
      setSessionsLoading(true);
      setSessionsError("");
      try {
        setSessions(await getSupplierNegotiations());
      } catch (e) {
        setSessionsError(e instanceof Error ? e.message : t.shell.sessionsLoadError);
      } finally {
        setSessionsLoading(false);
      }
    }
  }

  function openChat(id: number) {
    setMenuOpen(false);
    setSessionsOpen(false);
    router.push(`/supplier/chat?id=${id}`);
  }

  function confirmLogout() {
    // 先让服务端吊销令牌，再清本地：只清本地的话那个令牌其实仍然有效。
    void supplierLogout().catch(() => { /* 服务端不可达也照常退出本地 */ });
    clearSupplierAuth();
    router.replace("/supplier/login");
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex h-[60px] items-center justify-end gap-2 bg-[var(--surface)] px-4 shadow-[var(--shadow-card)] sm:px-6">
        {/* 语言切换放在个人中心左侧：它是全局偏好，任何登录态下都应当可用。 */}
        <LanguageSwitcher />
        {loggedIn && (
          <div className="relative">
            <button
              onClick={() => { setMenuOpen((open) => !open); setSessionsOpen(false); }}
              className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] hover:border-[var(--ink)]"
            >
              <UserRound className="size-4 text-[var(--muted)]" />
              <span>{t.shell.profile}</span>
              <ChevronDown className={cn("size-3.5 text-[var(--muted)] transition-transform", menuOpen && "rotate-180")} />
            </button>

            {menuOpen && <div className="fixed inset-0 z-30" onClick={() => { setMenuOpen(false); setSessionsOpen(false); }} />}

            {menuOpen && (
              <div className="absolute right-0 top-11 z-40 w-72 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
                <div className="relative">
                  <button onClick={() => void toggleSessions()} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] hover:bg-[var(--paper)]">
                    <span className="flex items-center gap-2"><MessageSquare className="size-4 text-[var(--muted)]" />{t.shell.myNegotiations}</span>
                    <ChevronRight className={cn("size-4 text-[var(--muted)] transition-transform", sessionsOpen && "rotate-90")} />
                  </button>

                  {sessionsOpen && (
                    <div className="border-t border-[var(--line)]">
                      {sessionsLoading ? (
                        <div className="flex items-center gap-2 px-4 py-5 text-xs text-[var(--muted)]"><Loader2 className="size-3.5 animate-spin" />{t.shell.sessionsLoading}</div>
                      ) : sessionsError ? (
                        <div className="px-4 py-5 text-xs text-[var(--warning)]">{sessionsError}</div>
                      ) : sessions?.length ? (
                        <div className="max-h-72 divide-y divide-[var(--line)] overflow-y-auto">
                          {sessions.map((item) => (
                            <button key={item.id} onClick={() => openChat(item.id)} className="block w-full px-4 py-3 text-left transition hover:bg-[var(--paper)]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-semibold text-[var(--ink)]">{item.product.name}</span>
                                <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold", item.status === "ai_active" ? "border-[var(--success)]/20 bg-[var(--success-faint)] text-[var(--success)]" : "border-[var(--accent)]/20 bg-[var(--accent-faint)] text-[var(--accent-strong)]")}>{statusText[item.status] ?? item.status}</span>
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--muted)]"><span className="font-bold text-[var(--accent-strong)]">{format(t.units.score, { score: item.score })}</span><span>·</span><span>{format(t.units.messages, { count: item.messages.length })}</span></div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="px-4 py-5 text-center text-xs text-[var(--muted)]"><Inbox className="mx-auto mb-2 size-6" />{t.shell.sessionsEmpty}</div>
                      )}
                    </div>
                  )}
                </div>

                <button onClick={() => { setLogoutOpen(true); setMenuOpen(false); setSessionsOpen(false); }} className="flex w-full items-center gap-2 border-t border-[var(--line)] px-4 py-3 text-left text-sm font-medium text-[var(--warning)] hover:bg-[var(--paper)]">
                  <LogOut className="size-4" />{t.shell.logout}
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <Dialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title={t.shell.logoutTitle}
        description={t.shell.logoutBody}
        footer={
          <>
            <button onClick={() => setLogoutOpen(false)} className="flex-1 rounded-[var(--radius-control)] border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--ink)]">{d.common.actions.cancel}</button>
            <button onClick={confirmLogout} className="flex-1 rounded-[var(--radius-control)] bg-[var(--warning)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">{t.shell.logoutConfirm}</button>
          </>
        }
      />

      {children}
    </>
  );
}
