"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Bot, Building2, Camera, ChevronDown, FlaskConical, Inbox, LayoutDashboard, Loader2, LogOut, MessagesSquare, ShieldCheck, User, type LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearMerchantAuth, forceLoginRedirect, getDashboardSummary, getMerchantProfile, getMerchantToken, getNegotiations, isAuthError, merchantLogout, updateMerchantProfile, type DashboardSummary, type MerchantProfile, type Negotiation } from "@/lib/api";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/types";
import { subscribeNegotiations } from "@/lib/stream";
import { cn } from "@/lib/utils";

type ShellNavKey = "dashboard" | "negotiate" | "supplier" | "evaluation";

/** 导航项只保留结构（路径 + 词典 key + 图标）；长短标签随语言从词典取，避免写死中文。 */
const nav: { href: string; key: ShellNavKey; icon: LucideIcon }[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/negotiate", key: "negotiate", icon: MessagesSquare },
  { href: "/supplier", key: "supplier", icon: Building2 },
  { href: "/evaluation", key: "evaluation", icon: FlaskConical },
];

const EMPTY_PROFILE: MerchantProfile = { store_name: "", logo_emoji: "", logo_image: "", contact: "", category: "" };

// 头像图片统一压缩到 256px 的 JPEG dataURL，避免超大 base64。
function resizeImage(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas unavailable")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("image load failed"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { d } = useI18n();
  const t = d.merchant.shell;
  const [pending, setPending] = useState<Negotiation[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [online, setOnline] = useState(true);
  const [open, setOpen] = useState(false);

  const [isBuyer, setIsBuyer] = useState(false);
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<MerchantProfile>(EMPTY_PROFILE);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  // 会话失效只处理一次：loadOverview 每 30 秒跑一次，重复跳转会打断登录页。
  const sessionEndedRef = useRef(false);
  const endExpiredSession = useCallback(() => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    forceLoginRedirect("admin");
  }, []);

  // 铃铛 = 待接管提醒：达到人工接管标准、AI 仍在线的会话（后端不再写入 manual_required 状态）。
  // 同时拉取工作台汇总，用于侧栏展示真实接待数据（不再使用写死的演示数字）。
  const loadOverview = useCallback(async () => {
    try {
      const items = await getNegotiations();
      setPending(items.filter(item => item.classification === "qualified" && item.status === "ai_active"));
      setOnline(true);
    } catch (e) {
      // 令牌过期（默认 30 天）时所有商家接口都会 401。此前这里只把「在线」标成 false，
      // 页面继续留在工作台上显示「服务暂时不可用 / 数据未能加载」，用户只会以为后端或数据库坏了。
      // 现在明确区分：登录态失效就清掉本地令牌并回登录页。
      if (isAuthError(e)) { endExpiredSession(); return; }
      setOnline(false);
    }
    try {
      setSummary(await getDashboardSummary());
    } catch (e) {
      if (isAuthError(e)) { endExpiredSession(); return; }
      /* 汇总接口不可达时保留上一次数据，不展示占位数字 */
    }
  }, [endExpiredSession]);
  useEffect(() => {
    // 未登录时不要发起请求：否则会在跳转回登录页之前打出一串 401。
    if (!isBuyer) return;
    void loadOverview();
    const timer = setInterval(() => void loadOverview(), 30_000);
    const unsubscribe = subscribeNegotiations(() => { void loadOverview(); });
    return () => { clearInterval(timer); unsubscribe(); };
  }, [loadOverview, isBuyer]);

  // 采购方登录态只在挂载后读取（localStorage 在服务端不存在，render 期间读会触发 hydration 报错）。
  // 未登录则直接回登录页，避免出现「有壳无数据」的空工作台。
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    if (!getMerchantToken()) {
      setIsBuyer(false);
      setAuthChecked(true);
      router.replace("/login");
      return;
    }
    setIsBuyer(true);
    setAuthChecked(true);
    getMerchantProfile()
      .then(profile => { setMerchant(profile); setProfileForm(profile); })
      .catch(e => {
        // 本地有令牌但服务端不认（过期 / 已改密吊销）：同样属于登录态失效，必须回登录页。
        if (isAuthError(e)) { endExpiredSession(); return; }
        /* 后端不可达时静默，保留默认显示 */
      });
  }, [router, endExpiredSession]);

  function openProfile() {
    setMenuOpen(false);
    setProfileForm(merchant ?? EMPTY_PROFILE);
    setProfileError("");
    setProfileOpen(true);
  }
  function goSecurity() { setMenuOpen(false); router.push("/settings/security"); }

  async function handleAvatarFile(file: File) {
    try {
      const dataUrl = await resizeImage(file);
      setProfileForm(current => ({ ...current, logo_image: dataUrl }));
      setProfileError("");
    } catch {
      setProfileError(t.profile.imageFailed);
    }
  }

  async function saveProfile() {
    if (!profileForm.store_name.trim()) { setProfileError(t.profile.storeNameRequired); return; }
    setSavingProfile(true);
    setProfileError("");
    try {
      const updated = await updateMerchantProfile({ ...profileForm, store_name: profileForm.store_name.trim() });
      setMerchant(updated);
      setProfileForm(updated);
      setProfileOpen(false);
      toast.push("success", t.profile.saved);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : t.profile.saveFailed);
    } finally {
      setSavingProfile(false);
    }
  }

  async function doLogout() {
    setLoggingOut(true);
    try { await merchantLogout(); } catch { /* 后端不可达也照常清本地并返回登录页 */ }
    clearMerchantAuth();
    setLoggingOut(false);
    setLogoutOpen(false);
    router.push("/login");
  }

  const avatar = merchant?.logo_image
    // 头像是前端压缩后的 data URL（最长边 256px），next/image 的优化器
    // 对 data URL 不生效，改成 Image 只会多一层包装，因此保留 <img>。
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={merchant.logo_image} alt="" width={28} height={28} className="size-7 rounded-lg object-cover" />
    : <span className="grid size-7 place-items-center rounded-lg bg-[var(--accent-faint)] text-xs font-bold text-[var(--accent-strong)]">{merchant?.logo_emoji || t.menu.defaultAvatar}</span>;

  // 采购方登录后只保留「采购工作台 / 实时谈判」；未登录时会被上面重定向回首页。
  const navItems = isBuyer
    ? nav.filter(item => item.href === "/dashboard" || item.href === "/negotiate")
    : nav;

  // 未登录时不渲染子页面：否则子页面的 useEffect 会先发出请求（401），再被重定向。
  if (!authChecked || !isBuyer) {
    return <div className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">{t.checkingAuth}</div>;
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="hidden border-r border-[var(--line)] bg-[var(--surface)] lg:flex lg:min-h-screen lg:flex-col lg:p-5">
        <div className="flex items-center gap-3 px-2 py-2">
          <BrandMark className="bg-[var(--accent)] text-white [&>span:first-child]:border-white [&>span:nth-child(2)]:border-white" />
          <div><div className="text-lg font-bold tracking-tight text-[var(--ink)]">{d.common.brand.name} <span className="text-[var(--accent)]">{d.common.brand.suffix}</span></div><div className="text-[10px] tracking-[.22em] text-[var(--muted)]">{d.common.brand.tagline}</div></div>
        </div>
        <nav className="mt-9 space-y-1.5">
          {navItems.map(({ href, key, icon: Icon }) => {
            const active = pathname === href;
            return <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-medium transition", active ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--muted)] hover:bg-[var(--paper)] hover:text-[var(--ink)]")}><Icon className="size-[18px]" />{t.nav[key].label}</Link>;
          })}
        </nav>
        <div className="mt-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--paper)] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]"><Bot className="size-4 text-[var(--accent)]" />{online ? t.ai.active : t.ai.offline}</div>
          {summary && (
            <>
              <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--muted)]"><span>{t.stats.today}</span><span className="font-semibold text-[var(--ink)]">{format(t.stats.value, { count: summary.today_received })}</span></div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--muted)]"><span>{t.stats.qualified}</span><span className="font-semibold text-[var(--ink)]">{format(t.stats.value, { count: summary.qualified })}</span></div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--muted)]"><span>{t.stats.aiActive}</span><span className="font-semibold text-[var(--ink)]">{format(t.stats.value, { count: summary.ai_active })}</span></div>
            </>
          )}
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between bg-[var(--surface)] px-4 shadow-[var(--shadow-card)] sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden"><BrandMark /><span className="font-bold">{d.common.brand.name} {d.common.brand.suffix}</span></div>
          <div className="hidden items-center gap-2 text-xs text-[var(--muted)] lg:flex"><span className={cn("size-2 rounded-full", online ? "bg-[var(--success)]" : "bg-[var(--warning)]")} />{online ? t.status.online : t.status.offline}</div>
          <div className="ml-auto flex items-center gap-3">
            {/* 语言切换放在页头右侧第一位（铃铛左边）：它是全局偏好，不该被通知/头像挤掉 */}
            <LanguageSwitcher />
            <div className="relative">
              <button aria-label={t.notifications.label} onClick={() => setOpen(current => !current)} className="relative grid size-9 place-items-center rounded-xl border border-[var(--line)] bg-white text-[var(--muted)]">
                <Bell className="size-4" />
                {pending.length > 0 && <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-white">{pending.length}</span>}
              </button>
              {open && <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />}
              {open && (
                <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
                  <div className="border-b border-[var(--line)] px-4 py-3 text-sm font-bold">{t.notifications.title}</div>
                  {pending.length ? <div className="max-h-80 divide-y divide-[var(--line)] overflow-y-auto">{pending.map(item => (
                    <Link key={item.id} href={`/negotiate?id=${item.id}`} onClick={() => setOpen(false)} className="block px-4 py-3 transition hover:bg-[var(--paper)]">
                      <div className="flex items-center justify-between gap-2 text-sm font-semibold"><span className="truncate">{item.supplier.company_name}</span><span className="shrink-0 text-xs font-bold text-[var(--accent-strong)]">{format(t.notifications.score, { score: item.score })}</span></div>
                      <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{format(t.notifications.meta, { product: item.product.name, price: item.quoted_price, region: item.supplier.region })}</div>
                    </Link>
                  ))}</div> : <div className="px-4 py-6 text-center text-xs text-[var(--muted)]"><Inbox className="mx-auto mb-2 size-6" />{t.notifications.empty}</div>}
                </div>
              )}
            </div>

            {isBuyer ? (
              <div className="relative">
                <button onClick={() => setMenuOpen(current => !current)} className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-2 py-1.5 text-sm transition hover:border-[var(--ink)]">
                  {avatar}
                  <span className="hidden max-w-[9rem] truncate sm:block">{merchant?.store_name || t.menu.defaultStoreName}</span>
                  <ChevronDown className="size-3.5 text-[var(--muted)]" />
                </button>
                {menuOpen && <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />}
                {menuOpen && (
                  <div className="absolute right-0 top-11 z-40 w-44 overflow-hidden rounded-2xl border border-[var(--line)] bg-white py-1.5 shadow-2xl">
                    <button onClick={openProfile} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--ink)] transition hover:bg-[var(--paper)]"><User className="size-4 text-[var(--muted)]" />{t.menu.profile}</button>
                    <button onClick={goSecurity} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--ink)] transition hover:bg-[var(--paper)]"><ShieldCheck className="size-4 text-[var(--muted)]" />{t.menu.security}</button>
                    <div className="my-1.5 h-px bg-[var(--line)]" />
                    <button onClick={() => { setMenuOpen(false); setLogoutOpen(true); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-faint)]"><LogOut className="size-4" />{t.menu.logout}</button>
                  </div>
                )}
              </div>
            ) : (
              <button className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-2 py-1.5 text-sm"><span className="grid size-7 place-items-center rounded-lg bg-[var(--accent-faint)] text-xs font-bold text-[var(--accent-strong)]">{t.menu.defaultAvatar}</span><span className="hidden sm:block">{t.menu.defaultStoreName}</span><ChevronDown className="size-3.5 text-[var(--muted)]" /></button>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">{children}</main>
      </div>
      <nav className={cn("fixed inset-x-3 bottom-3 z-30 grid rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-pop)] lg:hidden", isBuyer ? "grid-cols-2" : "grid-cols-4")}>
        {navItems.map(({ href, key, icon: Icon }) => {
          const active = pathname === href;
          return <Link key={href} href={href} className={cn("flex flex-col items-center gap-1 rounded-[var(--radius-control)] py-2 text-[11px]", active ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]")}><Icon className="size-4" />{t.nav[key].short}</Link>;
        })}
      </nav>

      <Dialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={t.profile.title}
        description={t.profile.description}
        size="md"
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setProfileOpen(false)}>{d.common.actions.cancel}</Button>
            <Button variant="accent" className="flex-1" disabled={savingProfile} onClick={() => void saveProfile()}>
              {savingProfile ? <Loader2 className="size-4 animate-spin" /> : d.common.actions.save}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            {profileForm.logo_image
              // eslint-disable-next-line @next/next/no-img-element -- 同上：data URL 无需交给图片优化器
              ? <img src={profileForm.logo_image} alt={t.profile.avatarAlt} width={64} height={64} className="size-16 rounded-[var(--radius-card)] object-cover" />
              : <span className="grid size-16 place-items-center rounded-[var(--radius-card)] bg-[var(--accent-faint)] text-3xl">{profileForm.logo_emoji || "🦌"}</span>}
            <button type="button" onClick={() => avatarInputRef.current?.click()} aria-label={t.profile.uploadAvatar} className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-[var(--ink)] text-white shadow"><Camera className="size-3" /></button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAvatarFile(f); e.target.value = ""; }} />
          </div>
          <div className="min-w-0 flex-1">
            <label className="block"><span className="text-xs font-semibold">{t.profile.emojiLabel}</span><Input className="mt-2" value={profileForm.logo_emoji} onChange={(e) => setProfileForm({ ...profileForm, logo_emoji: e.target.value })} placeholder={t.profile.emojiPlaceholder} maxLength={8} /></label>
            <p className="mt-1.5 text-[11px] leading-4 text-[var(--muted)]">{t.profile.emojiHint}</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block"><span className="text-xs font-semibold">{t.profile.storeName}</span><Input className="mt-2" value={profileForm.store_name} onChange={(e) => setProfileForm({ ...profileForm, store_name: e.target.value })} placeholder={t.profile.storeNamePlaceholder} maxLength={120} /></label>
          <label className="block"><span className="text-xs font-semibold">{t.profile.contact}</span><Input className="mt-2" value={profileForm.contact} onChange={(e) => setProfileForm({ ...profileForm, contact: e.target.value })} placeholder={t.profile.contactPlaceholder} maxLength={80} /></label>
          <label className="block"><span className="text-xs font-semibold">{t.profile.category}</span><Input className="mt-2" value={profileForm.category} onChange={(e) => setProfileForm({ ...profileForm, category: e.target.value })} placeholder={t.profile.categoryPlaceholder} maxLength={255} /></label>
        </div>
        {profileError && <div className="mt-3 rounded-[var(--radius-control)] border border-[var(--danger)]/20 bg-[var(--danger-faint)] p-2.5 text-xs text-[var(--danger)]">{profileError}</div>}
      </Dialog>

      <Dialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title={t.logout.title}
        description={t.logout.description}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setLogoutOpen(false)}>{d.common.actions.cancel}</Button>
            <Button variant="danger" className="flex-1" disabled={loggingOut} onClick={() => void doLogout()}>
              {loggingOut ? <Loader2 className="size-4 animate-spin" /> : t.menu.logout}
            </Button>
          </>
        }
      >
        <div className="flex justify-center">
          <div className="grid size-12 place-items-center rounded-[var(--radius-card)] bg-[var(--danger-faint)] text-[var(--danger)]"><LogOut className="size-5" /></div>
        </div>
      </Dialog>
    </div>
  );
}
