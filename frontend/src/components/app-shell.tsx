"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Bot, Building2, Camera, ChevronDown, FlaskConical, Inbox, LayoutDashboard, Loader2, LogOut, MessagesSquare, ShieldCheck, User, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearMerchantAuth, getMerchantProfile, getMerchantToken, getNegotiations, merchantLogout, updateMerchantProfile, type MerchantProfile, type Negotiation } from "@/lib/api";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "采购工作台", short: "工作台", icon: LayoutDashboard },
  { href: "/negotiate", label: "实时谈判", short: "谈判", icon: MessagesSquare },
  { href: "/supplier", label: "供应商入口", short: "供应商", icon: Building2 },
  { href: "/evaluation", label: "测评实验室", short: "测评", icon: FlaskConical },
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
  const [pending, setPending] = useState<Negotiation[]>([]);
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

  // 铃铛 = 待接管提醒：轮询达到转人工条件、等待商家接管的会话。
  const loadPending = useCallback(async () => {
    try {
      const items = await getNegotiations();
      setPending(items.filter(item => item.status === "manual_required"));
    } catch { /* 后端未启动或令牌未配置时静默 */ }
  }, []);
  useEffect(() => {
    void loadPending();
    const timer = setInterval(() => void loadPending(), 30_000);
    return () => clearInterval(timer);
  }, [loadPending]);

  // 采购方已登录（存在商家 token）时拉取个人资料；网页调试无 token，保持死按钮现状。
  useEffect(() => {
    if (!getMerchantToken()) { setIsBuyer(false); return; }
    setIsBuyer(true);
    getMerchantProfile().then(profile => { setMerchant(profile); setProfileForm(profile); }).catch(() => { /* 后端不可达时静默，保留默认显示 */ });
  }, []);

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
      setProfileError("图片处理失败，请换一张图片");
    }
  }

  async function saveProfile() {
    if (!profileForm.store_name.trim()) { setProfileError("请填写店名"); return; }
    setSavingProfile(true);
    setProfileError("");
    try {
      const updated = await updateMerchantProfile({ ...profileForm, store_name: profileForm.store_name.trim() });
      setMerchant(updated);
      setProfileForm(updated);
      setProfileOpen(false);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "保存失败");
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
    router.push("/");
  }

  const avatar = merchant?.logo_image
    ? <img src={merchant.logo_image} alt="" className="size-7 rounded-lg object-cover" />
    : <span className="grid size-7 place-items-center rounded-lg bg-[var(--accent-faint)] text-xs font-bold text-[var(--accent-strong)]">{merchant?.logo_emoji || "鹿"}</span>;

  // 采购方登录后只保留「采购工作台 / 实时谈判」；网页调试保留全部 4 页导航。
  const navItems = isBuyer
    ? nav.filter(item => item.href === "/dashboard" || item.href === "/negotiate")
    : nav;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-white/10 bg-[var(--ink)] text-white lg:flex lg:min-h-screen lg:flex-col lg:p-5">
        <div className="flex items-center gap-3 px-2 py-2">
          <BrandMark className="bg-white text-[var(--ink)] [&>span:first-child]:border-[var(--accent)] [&>span:nth-child(2)]:border-[var(--ink)]" />
          <div><div className="text-lg font-bold tracking-tight">链谈 <span className="text-[var(--accent)]">Agent</span></div><div className="text-[10px] tracking-[.22em] text-white/45">SUPPLY NEGOTIATOR</div></div>
        </div>
        <nav className="mt-9 space-y-1.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition", active ? "bg-white text-[var(--ink)] shadow-lg" : "text-white/62 hover:bg-white/8 hover:text-white")}><Icon className={cn("size-[18px]", active && "text-[var(--accent)]")} />{label}</Link>;
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.055] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/75"><Bot className="size-4 text-[var(--accent)]" />AI 守门狗正在工作</div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-white/45"><span>本月已筛选</span><span className="text-white">126 家</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[68%] rounded-full bg-[var(--accent)]" /></div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[rgba(247,248,250,.88)] px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden"><BrandMark /><span className="font-bold">链谈 Agent</span></div>
          <div className="hidden items-center gap-2 text-xs text-[var(--muted)] lg:flex"><span className="size-2 rounded-full bg-[var(--success)]" />系统运行正常·AI 防火墙已开启</div>
          <div className="ml-auto flex items-center gap-3">
            <div className="relative">
              <button aria-label="通知" onClick={() => setOpen(current => !current)} className="relative grid size-9 place-items-center rounded-xl border border-[var(--line)] bg-white text-[var(--muted)]">
                <Bell className="size-4" />
                {pending.length > 0 && <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-white">{pending.length}</span>}
              </button>
              {open && <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />}
              {open && (
                <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
                  <div className="border-b border-[var(--line)] px-4 py-3 text-sm font-bold">待接管的优质候选</div>
                  {pending.length ? <div className="max-h-80 divide-y divide-[var(--line)] overflow-y-auto">{pending.map(item => (
                    <Link key={item.id} href={`/negotiate?id=${item.id}`} onClick={() => setOpen(false)} className="block px-4 py-3 transition hover:bg-[var(--paper)]">
                      <div className="flex items-center justify-between gap-2 text-sm font-semibold"><span className="truncate">{item.supplier.company_name}</span><span className="shrink-0 text-xs font-bold text-[var(--accent-strong)]">{item.score} 分</span></div>
                      <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{item.product.name} · 报价 ¥{item.quoted_price} · {item.supplier.region}</div>
                    </Link>
                  ))}</div> : <div className="px-4 py-6 text-center text-xs text-[var(--muted)]"><Inbox className="mx-auto mb-2 size-6" />暂无待接管会话，AI 正常工作中</div>}
                </div>
              )}
            </div>

            {isBuyer ? (
              <div className="relative">
                <button onClick={() => setMenuOpen(current => !current)} className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-2 py-1.5 text-sm transition hover:border-[var(--ink)]">
                  {avatar}
                  <span className="hidden max-w-[9rem] truncate sm:block">{merchant?.store_name || "小鹿生活馆"}</span>
                  <ChevronDown className="size-3.5 text-[var(--muted)]" />
                </button>
                {menuOpen && <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />}
                {menuOpen && (
                  <div className="absolute right-0 top-11 z-40 w-44 overflow-hidden rounded-2xl border border-[var(--line)] bg-white py-1.5 shadow-2xl">
                    <button onClick={openProfile} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--ink)] transition hover:bg-[var(--paper)]"><User className="size-4 text-[var(--muted)]" />个人资料</button>
                    <button onClick={goSecurity} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--ink)] transition hover:bg-[var(--paper)]"><ShieldCheck className="size-4 text-[var(--muted)]" />账号安全</button>
                    <div className="my-1.5 h-px bg-[var(--line)]" />
                    <button onClick={() => { setMenuOpen(false); setLogoutOpen(true); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-faint)]"><LogOut className="size-4" />退出登录</button>
                  </div>
                )}
              </div>
            ) : (
              <button className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-2 py-1.5 text-sm"><span className="grid size-7 place-items-center rounded-lg bg-[var(--accent-faint)] text-xs font-bold text-[var(--accent-strong)]">鹿</span><span className="hidden sm:block">小鹿生活馆</span><ChevronDown className="size-3.5 text-[var(--muted)]" /></button>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">{children}</main>
      </div>
      <nav className={cn("fixed inset-x-3 bottom-3 z-30 grid rounded-2xl border border-white/10 bg-[rgba(17,24,39,.94)] p-1.5 text-white shadow-2xl backdrop-blur-lg lg:hidden", isBuyer ? "grid-cols-2" : "grid-cols-4")}>
        {navItems.map(({ href, short, icon: Icon }) => {
          const active = pathname === href;
          return <Link key={href} href={href} className={cn("flex flex-col items-center gap-1 rounded-xl py-2 text-[10px]", active ? "bg-white text-[var(--ink)]" : "text-white/55")}><Icon className={cn("size-4", active && "text-[var(--accent)]")} />{short}</Link>;
        })}
      </nav>

      {profileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[var(--ink)]/30" onClick={() => setProfileOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">个人资料</h2>
              <button aria-label="关闭" onClick={() => setProfileOpen(false)} className="grid size-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] transition hover:text-[var(--ink)]"><X className="size-4" /></button>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">店名、头像、联系人与主营品类</p>
            <div className="mt-5 flex items-start gap-4">
              <div className="relative shrink-0">
                {profileForm.logo_image
                  ? <img src={profileForm.logo_image} alt="" className="size-16 rounded-2xl object-cover" />
                  : <span className="grid size-16 place-items-center rounded-2xl bg-[var(--accent-faint)] text-3xl">{profileForm.logo_emoji || "🦌"}</span>}
                <button type="button" onClick={() => avatarInputRef.current?.click()} aria-label="上传头像" className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-[var(--ink)] text-white shadow"><Camera className="size-3" /></button>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAvatarFile(f); e.target.value = ""; }} />
              </div>
              <div className="min-w-0 flex-1">
                <label className="block"><span className="text-xs font-semibold">头像 emoji</span><Input className="mt-2" value={profileForm.logo_emoji} onChange={(e) => setProfileForm({ ...profileForm, logo_emoji: e.target.value })} placeholder="例如 🦌" maxLength={8} /></label>
                <p className="mt-1.5 text-[10px] leading-4 text-[var(--muted)]">可填写 emoji，或点击左侧相机上传图片作为头像</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block"><span className="text-xs font-semibold">店名</span><Input className="mt-2" value={profileForm.store_name} onChange={(e) => setProfileForm({ ...profileForm, store_name: e.target.value })} placeholder="请输入店名" maxLength={120} /></label>
              <label className="block"><span className="text-xs font-semibold">联系人</span><Input className="mt-2" value={profileForm.contact} onChange={(e) => setProfileForm({ ...profileForm, contact: e.target.value })} placeholder="请输入联系人" maxLength={80} /></label>
              <label className="block"><span className="text-xs font-semibold">主营品类</span><Input className="mt-2" value={profileForm.category} onChange={(e) => setProfileForm({ ...profileForm, category: e.target.value })} placeholder="例如：家居布艺、收纳日用" maxLength={255} /></label>
            </div>
            {profileError && <div className="mt-3 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-faint)] p-2.5 text-xs text-[var(--danger)]">{profileError}</div>}
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setProfileOpen(false)}>取消</Button>
              <Button variant="accent" className="flex-1" disabled={savingProfile} onClick={() => void saveProfile()}>{savingProfile ? <Loader2 className="size-4 animate-spin" /> : "保存"}</Button>
            </div>
          </div>
        </div>
      )}

      {logoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[var(--ink)]/30" onClick={() => setLogoutOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-[var(--line)] bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--danger-faint)] text-[var(--danger)]"><LogOut className="size-5" /></div>
            <h2 className="mt-4 text-lg font-bold">确认是否退出登录？</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">退出后将返回网页登录界面</p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setLogoutOpen(false)}>取消</Button>
              <Button variant="danger" className="flex-1" disabled={loggingOut} onClick={() => void doLogout()}>{loggingOut ? <Loader2 className="size-4 animate-spin" /> : "退出登录"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
