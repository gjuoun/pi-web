import { Lightbulb } from "lucide-react";

/** One collapsed thinking row: a bulb, the single-line text and how long it took. */
export function ThinkingLine({ text, duration }: { text: string; duration?: string }) {
  return (
    <div data-slot="thinking-line" className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2.5 font-mono text-xs text-muted-foreground">
      <Lightbulb aria-hidden="true" className="size-3 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {duration ? <span className="shrink-0">{duration}</span> : null}
    </div>
  );
}
