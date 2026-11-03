"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";
type ToastItem = { id: number; tone: Tone; message: string };

const ToastContext = createContext<{ push: (tone: Tone, message: string) => void } | null>(null);

const TONE_STYLE: Record<Tone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "border-[var(--success)]/25 bg-[var(--success-faint)] text-[var(--success)]" },
  error: { icon: AlertTriangle, className: "border-[var(--danger)]/25 bg-[var(--danger-faint)] text-[var(--danger)]" },
  info: { icon: Info, className: "border-[var(--accent)]/25 bg-[var(--accent-faint)] text-[var(--accent-strong)]" },
};

const DURATION_MS = 3600;

/**
 * 全局轻提示。原来的成功/失败提示都是就地渲染的横幅，
 * 用户改完一处要滚到横幅位置才能看到结果；现在统一从右上角弹出并自动消失。
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  // ToastProvider 挂在 LanguageProvider 之内（见 app/layout.tsx），因此这里能拿到当前语言。
  const { d } = useI18n();

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((tone: Tone, message: string) => {
    const id = nextId.current++;
    setItems((current) => [...current, { id, tone, message }]);
    setTimeout(() => remove(id), DURATION_MS);
  }, [remove]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {items.map((item) => {
          const { icon: Icon, className } = TONE_STYLE[item.tone];
          return (
            <div
              key={item.id}
              className={cn("anim-pop pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius-control)] border px-3.5 py-3 text-sm shadow-[var(--shadow-pop)]", className)}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1 leading-6">{item.message}</span>
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label={d.common.a11y.closeToast}
                className="grid size-6 shrink-0 place-items-center rounded opacity-70 transition-opacity hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  // 没有 Provider 时降级成 console，避免调用方崩溃。
  return context ?? { push: (tone: Tone, message: string) => console.warn(`[toast:${tone}]`, message) };
}
