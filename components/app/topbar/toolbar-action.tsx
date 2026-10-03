import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One labelled action in the top bar's toolbar, with the real button's classes (it is a `button` there):
 * `border-none` first (the real class list does, so the hairline and top border never draw), 11px text. `disabled` is the new-session look.
 */
export function ToolbarAction({ icon, label, disabled = false }: { icon: ReactNode; label: string; disabled?: boolean }) {
  return (
    <div
      data-slot="toolbar-action"
      data-disabled={disabled || undefined}
      className={cn(
        "flex h-full shrink-0 items-center justify-center gap-1.5 border-none border-t-2 border-r border-t-transparent border-r-border bg-transparent px-3 text-[11px] whitespace-nowrap",
        disabled ? "text-muted-foreground/70 opacity-45" : "text-muted-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}
