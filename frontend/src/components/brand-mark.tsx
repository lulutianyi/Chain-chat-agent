import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("relative grid size-9 place-items-center rounded-xl bg-[var(--ink)] text-white", className)} aria-hidden="true">
      <span className="absolute left-[9px] top-[9px] size-2 rounded-full border-2 border-[var(--accent)]" />
      <span className="absolute bottom-[9px] right-[9px] size-2 rounded-full border-2 border-white" />
      <span className="h-px w-4 rotate-45 bg-white/70" />
    </div>
  );
}
