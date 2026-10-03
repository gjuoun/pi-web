import { GroupChevron, PlusGlyph, WorktreeGlyph } from "../glyphs";
import type { ProjectItem } from "../view-types";
import { SessionRow } from "./session-row";

/** A project header ported from the real `ProjectHeaderRow` (32px: chevron, `name (count)`, worktree and plus) and, when expanded, its rows. */
export function ProjectGroup({ name, count, expanded = false, sessions }: ProjectItem) {
  return (
    <div data-slot="project-group" data-expanded={expanded}>
      <div role="treeitem" aria-expanded={expanded} aria-selected={false} data-slot="project-group-header" className="flex h-[32px] items-center gap-1.5 px-3.5 select-none">
        <GroupChevron collapsed={!expanded} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-muted-foreground">{`${name} (${count})`}</span>
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground/70"><WorktreeGlyph size={10} /></span>
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground/70"><PlusGlyph size={10} /></span>
      </div>
      {expanded ? sessions.map((session) => <SessionRow key={session.id} {...session} />) : null}
    </div>
  );
}
