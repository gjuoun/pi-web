import { cn } from "@/lib/utils";
import { StatCache, StatContext, StatDown, StatUp } from "../glyphs";
import type { SessionStatsData } from "../view-types";

/** Token, cache, cost and context readout at the right of the top bar, as the real "Session info" button draws it. */
export function SessionStats({ up, down, cache, cost, contextPercent, contextWindow }: SessionStatsData) {
  const tone = contextPercent > 90 ? "text-destructive" : contextPercent > 70 ? "text-warning" : "text-muted-foreground";
  return (
    <div data-slot="session-stats" className="ml-auto flex h-full min-w-0 items-center justify-end gap-2.5 overflow-hidden border-none border-t-2 border-t-transparent px-3 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
      <span className="flex items-center gap-1"><StatUp />{up}</span>
      <span className="flex items-center gap-1"><StatDown />{down}</span>
      <span className="flex items-center gap-1"><StatCache />{cache}</span>
      <span className="flex items-center font-medium text-foreground">{cost}</span>
      <span className={cn("flex items-center gap-1", tone)}><StatContext />{`${contextPercent}% / ${contextWindow}`}</span>
    </div>
  );
}
