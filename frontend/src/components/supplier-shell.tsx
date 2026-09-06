"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Inbox, Loader2, LogOut, MessageSquare, UserRound } from "lucide-react";
import { clearSupplierAuth, getSupplierNegotiations, getSupplierToken, type Negotiation } from "@/lib/api";
import { cn } from "@/lib/utils";

const statusText: Record<string, string> = { ai_active: "AI 洽谈中", manual_required: "等待人工沟通", human_active: "人工沟通中", closed: "已结束" };

export function SupplierShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<Negotiation[] | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);

  const token = getSupplierToken();
  const loggedIn = Boolean(token);

  // 路由变化时收起所有浮层。
  useEffect(() => { setMenuOpen(false); setSessionsOpen(false); setLogoutOpen(false); }, [pathname]);

  // 登录身份（token）变化时清空缓存的会话，避免退出换号后仍显示上一手机号的洽谈。
  useEffect(() => { setSessions(null); setSessionsError(""); }, [token]);

  // 登录页不渲染顶栏。
  if (pathname === "/supplier/login") return <>{children}</>;

  async function toggleSessions() {
    setSessionsOpen((open) => !open);
    if (sessions === null && !sessionsLoading) {
      setSessionsLoading(true);
      setSessionsError("");
      try {
        setSessions(await getSupplierNegotiations());
      } catch (e) {
        setSessionsError(e instanceof Error ? e.message : "无法读取洽谈会话");
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
    clearSupplierAuth();
    router.replace("/supplier/login");
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-end border-b border-[var(--line)] bg-[rgba(245,243,238,.88)] px-4 backdrop-blur-xl sm:px-6">
        {loggedIn && (
          <div className="relative">
            <button
              onClick={() => { setMenuOpen((open) => !open); setSessionsOpen(false); }}
              className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] hover:border-[var(--ink)]"
            >
              <UserRound className="size-4 text-[var(--muted)]" />
              <span>个人中心</span>
              <ChevronDown className={cn("size-3.5 text-[var(--muted)] transition-transform", menuOpen && "rotate-180")} />
            </button>

            {menuOpen && <div className="fixed inset-0 z-30" onClick={() => { setMenuOpen(false); setSessionsOpen(false); }} />}

            {menuOpen && (
              <div className="absolute right-0 top-11 z-40 w-72 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
                <div className="relative">
                  <button onClick={() => void toggleSessions()} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] hover:bg-[var(--paper)]">
                    <span className="flex items-center gap-2"><MessageSquare className="size-4 text-[var(--muted)]" />我的洽谈</span>
                    <ChevronRight className={cn("size-4 text-[var(--muted)] transition-transform", sessionsOpen && "rotate-90")} />
                  </button>

                  {sessionsOpen && (
                    <div className="border-t border-[var(--line)]">
                      {sessionsLoading ? (
                        <div className="flex items-center gap-2 px-4 py-5 text-xs text-[var(--muted)]"><Loader2 className="size-3.5 animate-spin" />正在读取洽谈会话…</div>
                      ) : sessionsError ? (
                        <div className="px-4 py-5 text-xs text-[var(--warning)]">{sessionsError}</div>
                      ) : sessions?.length ? (
                        <div className="max-h-72 divide-y divide-[var(--line)] overflow-y-auto">
                          {sessions.map((item) => (
                            <button key={item.id} onClick={() => openChat(item.id)} className="block w-full px-4 py-3 text-left transition hover:bg-[var(--paper)]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-semibold text-[var(--ink)]">{item.product.name}</span>
                                <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", item.status === "ai_active" ? "border-[var(--success)]/20 bg-[var(--success-faint)] text-[var(--success)]" : "border-[var(--accent)]/20 bg-[var(--accent-faint)] text-[var(--accent-strong)]")}>{statusText[item.status] ?? item.status}</span>
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--muted)]"><span className="font-bold text-[var(--accent-strong)]">{item.score} 分</span><span>·</span><span>{item.messages.length} 条消息</span></div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="px-4 py-5 text-center text-xs text-[var(--muted)]"><Inbox className="mx-auto mb-2 size-6" />暂无洽谈会话</div>
                      )}
                    </div>
                  )}
                </div>

                <button onClick={() => { setLogoutOpen(true); setMenuOpen(false); setSessionsOpen(false); }} className="flex w-full items-center gap-2 border-t border-[var(--line)] px-4 py-3 text-left text-sm font-medium text-[var(--warning)] hover:bg-[var(--paper)]">
                  <LogOut className="size-4" />退出登录
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {logoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setLogoutOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-[var(--line)] bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold">确定要退出登录吗？</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">退出后需重新验证手机号，才能再次进入供应商入口和继续洽谈。</p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setLogoutOpen(false)} className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--ink)] hover:border-[var(--ink)]">取消</button>
              <button onClick={confirmLogout} className="rounded-xl bg-[var(--warning)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">确定退出</button>
            </div>
          </div>
        </div>
      )}

      {children}
    </>
  );
}
