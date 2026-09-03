import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--ink)] text-white shadow-sm hover:-translate-y-0.5 hover:bg-[var(--ink-soft)]",
        accent: "bg-[var(--accent)] text-white shadow-sm hover:-translate-y-0.5 hover:bg-[var(--accent-strong)]",
        outline: "border border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)] hover:bg-[var(--paper)]",
        ghost: "text-[var(--muted)] hover:bg-[var(--paper)] hover:text-[var(--ink)]",
        danger: "bg-[var(--danger)] text-white hover:bg-[#9b3028]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 px-5 text-base",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
