"use client";

import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * 统一的模态弹窗。
 * 之前每个弹窗都是手写 div：没有 Esc 关闭、没有焦点陷阱、没有 aria-modal、
 * 打开时页面还能继续滚动。这里一次性把这些补齐，调用方只关心内容。
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "sm",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2, 9)}`);
  const { d } = useI18n();

  // Esc 关闭 + Tab 焦点陷阱
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    // 打开期间禁止背景滚动
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 焦点移入弹窗：优先第一个输入框，否则第一个可聚焦元素
    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>("input,textarea,select") ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
    // 关闭后把焦点还给「打开它的那个按钮」。否则 Esc 一按焦点掉回 <body>，
    // 键盘用户下一次 Tab 要从页首重新走一遍。
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="anim-fade absolute inset-0 bg-[var(--ink)]/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        className={cn(
          // max-h + overflow-y-auto：面板再长也能滚到底，窄屏手机键盘弹起时
          // 「提交」「注册」这些末尾元素不会被直接裁掉且无法到达。
          "anim-pop relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-pop)]",
          size === "md" ? "max-w-md" : "max-w-sm",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId.current} className="text-lg font-bold">{title}</h2>
            {description && <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={d.common.a11y.close}
            className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-chip)] border border-[var(--line)] text-[var(--muted)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            <X className="size-4" />
          </button>
        </div>
        {children && <div className="mt-5">{children}</div>}
        {footer && <div className="mt-6 flex gap-3">{footer}</div>}
      </div>
    </div>
  );
}
