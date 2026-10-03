import type { ReactNode } from "react";
import type { UsageLine } from "../view-types";

const fmt = (n: number) => n.toLocaleString("en-US");

/** `2 in · 2,632 out · 404,974 cache R · 4,253 cache W · $0.1180` — zero counters are left out, as the real line does. */
export function usageText(u: UsageLine): string {
  const parts = [
    u.input ? `${fmt(u.input)} in` : "",
    u.output ? `${fmt(u.output)} out` : "",
    u.cacheRead ? `${fmt(u.cacheRead)} cache R` : "",
    u.cacheWrite ? `${fmt(u.cacheWrite)} cache W` : "",
    u.cost ? `$${u.cost.toFixed(4)}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * The row under an answer: the usage line, the (invisible, 22px) copy button's space, and the time at
 * the right. The real copy button is `opacity-0` until hover but still takes its height, so the
 * replica reserves it (an errored reply has no copy button, so `copy={false}` there).
 */
export function MessageMeta({ usage, time, children, copy = true }: { usage?: UsageLine; time?: string; children?: ReactNode; copy?: boolean }) {
  return (
    <div data-slot="message-meta" className="mt-1 flex items-center gap-2">
      <div className="text-[11px] text-muted-foreground">{usage ? usageText(usage) : children}</div>
      {copy ? <span aria-hidden="true" className="flex h-[22px] items-center px-2 text-[11px] opacity-0">Copy</span> : null}
      {time ? <span className="ml-auto text-[10px] text-muted-foreground">{time}</span> : null}
    </div>
  );
}
