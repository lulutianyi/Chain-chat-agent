"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  leadingIcon?: React.ReactNode;
};

export function PasswordInput({ leadingIcon, className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);
  const { d } = useI18n();
  return (
    <div className="relative">
      {leadingIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]">
          {leadingIcon}
        </span>
      )}
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-11", leadingIcon ? "pl-9" : undefined, className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? d.common.a11y.hidePassword : d.common.a11y.showPassword}
        aria-pressed={visible}
        // 这里原来带 tabIndex={-1}：密码可见性切换对键盘用户完全不可达。
        // 它是有实际功能的开关（不是装饰），必须留在 Tab 顺序里。
        className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-[var(--radius-chip)] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
