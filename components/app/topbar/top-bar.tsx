import { HistoryGlyph, SidebarToggleGlyph, SystemGlyph, TitleGlyph, ToolsGlyph } from "../glyphs";
import type { SessionStatsData } from "../view-types";
import { SessionStats } from "./session-stats";
import { ToolbarAction } from "./toolbar-action";

const toggle = "flex h-9 w-9 shrink-0 items-center justify-center border-none bg-transparent p-0 text-muted-foreground";

/**
 * The 36px row above the chat, ported from `AppShell`: sidebar toggle, the chat toolbar, the session
 * stats and the file-panel toggle. `fresh` (no messages yet) dims the history and title actions, drops the
 * stats and leaves the tools glyph muted (it turns primary once the session reports active tools).
 */
export function TopBar({ stats, fresh = false }: { stats?: SessionStatsData; fresh?: boolean }) {
  return (
    <div data-slot="top-bar" className="shrink-0 bg-sidebar">
      <div className="relative flex h-[36px] items-center border-b border-border">
        <div data-slot="top-bar-sidebar-toggle" role="img" aria-label="Hide sidebar" className={`${toggle} border-r border-r-border`}>
          <SidebarToggleGlyph side="left" />
        </div>
        <div className="flex h-full items-stretch">
          <ToolbarAction icon={<HistoryGlyph />} label="Full history" disabled={fresh} />
          <ToolbarAction icon={<TitleGlyph />} label="Generate title" disabled={fresh} />
          <ToolbarAction icon={<SystemGlyph className="text-muted-foreground" />} label="System" />
          <ToolbarAction icon={<ToolsGlyph className={fresh ? "text-muted-foreground" : "text-primary"} />} label="Tools" />
        </div>
        {stats && !fresh ? <SessionStats {...stats} /> : <div className="ml-auto" />}
        <div data-slot="top-bar-panel-toggle" role="img" aria-label="Show file panel" className={`${toggle} border-l border-l-border`}>
          <SidebarToggleGlyph side="right" />
        </div>
      </div>
    </div>
  );
}
