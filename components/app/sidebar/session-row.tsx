import { cn } from "@/lib/utils";
import { AgentGlyph, PinGlyph, RunningArc } from "../glyphs";
import type { SessionItem } from "../view-types";

/**
 * One session line in the sidebar, ported from the real `SessionItem`: a 40px row (px, not rem: the app's root font size is 14px, and the real row sets its height and padding in px) with a 2px left
 * border (primary and tinted when active), an optional pin glyph, and the title on one line. The real
 * list shows families, so only a family's root is a row; `depth` and `running` exist for the specimen
 * (a running row needs a live agent, a child row is shown in the Agents tab, not in this list).
 */
export function SessionRow({ title, time, active, pinned, running, depth = 0 }: SessionItem) {
  return (
    <div
      role="treeitem"
      data-slot="session-row"
      data-depth={depth}
      aria-current={active ? "page" : undefined}
      aria-selected={Boolean(active)}
      title={`${title} · ${time}`}
      className={cn(
        "flex h-[40px] items-center gap-1.5 overflow-hidden border-l-2 pr-2",
        depth > 0 ? "pl-[26px]" : "pl-[14px]",
        active ? "border-l-primary bg-accent" : "border-l-transparent bg-transparent",
      )}
    >
      {depth > 0 ? <span data-slot="session-agent-glyph" className="shrink-0 text-primary"><AgentGlyph /></span> : null}
      <div className="min-w-0 flex-1">
        <div className={cn("flex min-w-0 items-center gap-1.5 text-xs leading-[1.4] text-foreground", active ? "font-medium" : "font-normal")}>
          {running ? (
            <span data-slot="session-running-indicator" className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-primary"><RunningArc /></span>
          ) : null}
          {pinned ? <span data-slot="session-pin-indicator" role="img" aria-label="Pinned" className="shrink-0 text-muted-foreground"><PinGlyph /></span> : null}
          <span className="min-w-0 truncate">{title}</span>
        </div>
      </div>
    </div>
  );
}
