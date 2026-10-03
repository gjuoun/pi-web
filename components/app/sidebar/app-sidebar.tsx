import { ArchiveGlyph, PlusGlyph, SearchGlyph, SettingsGlyph } from "../glyphs";
import type { ExplorerRow, ProjectItem } from "../view-types";
import { ExplorerPanel } from "./explorer-panel";
import { ProjectGroup } from "./project-group";

const squareButton = "flex size-[32px] shrink-0 items-center justify-center rounded-[7px] border border-border bg-accent/60 text-muted-foreground";

/** The 260px left sidebar ported from the real `SessionSidebar`: action row, project groups, explorer, settings footer. */
export function AppSidebar({ projects, explorerRows }: { projects: ProjectItem[]; explorerRows: ExplorerRow[] }) {
  return (
    <aside data-slot="app-sidebar" className="relative flex h-full w-[260px] shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar">
      {/* The real content box is 260px wide inside a 260px border-box aside whose `overflow: hidden` clips its last pixel, so the 1px right border stays visible. */}
      <div className="flex h-full w-[260px] flex-none flex-col overflow-hidden">
        <div data-slot="sidebar-actions" className="shrink-0 border-b border-border px-[10px] pt-3 pb-[10px]">
          <div className="mb-[10px] flex items-center justify-end">
            <div className="flex gap-1.5">
              <div className="flex h-[32px] shrink-0 items-center justify-center gap-[5px] rounded-[7px] border border-border bg-accent/60 pr-3 pl-[10px] text-xs font-medium tracking-[-0.01em] text-muted-foreground">
                <PlusGlyph size={12} />
                New
              </div>
              <div role="img" aria-label="Search conversations" className={squareButton}><SearchGlyph size={18} /></div>
              <div role="img" aria-label="Show archived" className={squareButton}><ArchiveGlyph size={14} /></div>
            </div>
          </div>
        </div>
        <div data-slot="sidebar-groups" role="tree" aria-label="Sessions" className="min-h-20 flex-1 overflow-hidden p-0">
          {projects.map((project) => (
            <ProjectGroup key={project.name} {...project} />
          ))}
        </div>
        <ExplorerPanel rows={explorerRows} />
        <div data-slot="sidebar-footer" className="shrink-0 p-2">
          <div className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md p-0 text-xs text-muted-foreground">
            <SettingsGlyph size={14} strokeWidth={2} />
            <span>Settings</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
