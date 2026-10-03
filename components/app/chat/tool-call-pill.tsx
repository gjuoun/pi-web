import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** A tool call row: bold tool name, a one-line summary, the duration and a chevron. */
export function ToolCallPill({ name, summary, duration, failed = false }: { name: string; summary: string; duration: string; failed?: boolean }) {
  return (
    <div
      data-slot="tool-call-pill"
      data-failed={failed || undefined}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md border px-2.5 font-mono text-xs",
        failed ? "border-destructive/30 bg-destructive/10" : "border-success/30 bg-success/8",
      )}
    >
      <span className={cn("shrink-0 font-bold", failed ? "text-destructive" : "text-success")}>{name}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{summary}</span>
      <span className="shrink-0 text-muted-foreground">{duration}</span>
      <ChevronDown aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
    </div>
  );
}
