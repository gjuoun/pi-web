import { FolderIcon, getFileIcon } from "@/components/FileIcons";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChangesGlyph, ExplorerChevron, RefreshGlyph, SearchGlyph, TerminalGlyph, TreeChevron, UploadGlyph } from "../glyphs";
import type { ExplorerRow, GitStatus } from "../view-types";

/** Indent per tree depth: 8px + 14px per level in px (the real row sets `padding-left` inline), written out so Tailwind sees every class. */
const INDENT = ["pl-[8px]", "pl-[22px]", "pl-[36px]", "pl-[50px]"] as const;
const LETTER: Record<GitStatus, string> = { modified: "M", added: "A", untracked: "U" };
const LETTER_TONE: Record<GitStatus, string> = { modified: "text-warning", added: "text-success", untracked: "text-success" };
const DOT_TONE: Record<GitStatus, string> = { modified: "bg-warning", added: "bg-success", untracked: "bg-success" };

const iconButton = buttonVariants({ variant: "ghost", size: "icon-sm" });

/** The EXPLORER block ported from the real `SessionSidebar`/`FileExplorer`: header with its tool buttons, then file-tree rows with git status. */
export function ExplorerPanel({ rows }: { rows: ExplorerRow[] }) {
  return (
    <div data-slot="explorer-panel" className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
      <div className="flex shrink-0 items-center">
        <div className="flex flex-1 items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
          <ExplorerChevron open />
          EXPLORER
        </div>
        <span className={iconButton}><TerminalGlyph /></span>
        <span className={iconButton}><ChangesGlyph /></span>
        <span className={iconButton}><SearchGlyph size={13} /></span>
        <span className={iconButton}><UploadGlyph /></span>
        <span className={cn(iconButton, "mr-[6px]")}><RefreshGlyph /></span>
      </div>
      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        <div className="min-h-full">
          <div className="px-1 py-0.5">
            {rows.map((row) => (
              <div key={`${row.depth}-${row.name}`}>
                <div
                  data-slot="explorer-row"
                  data-status={row.status}
                  className={cn("relative flex h-6 items-center gap-1 rounded pr-2 select-none", INDENT[Math.min(row.depth, INDENT.length - 1)])}
                >
                  {row.kind === "folder" ? <TreeChevron open={row.open} /> : <span className="w-2.5 shrink-0" />}
                  <span className="flex shrink-0 items-center">{row.kind === "folder" ? <FolderIcon size={14} open={row.open} /> : getFileIcon(row.name, 14)}</span>
                  <span className="flex-1 overflow-hidden text-xs text-ellipsis whitespace-nowrap text-foreground">{row.name}</span>
                  {row.status && row.kind === "file" ? (
                    <span><span className={cn("flex size-3.5 shrink-0 items-center justify-center font-mono text-[11px] font-semibold", LETTER_TONE[row.status])}>{LETTER[row.status]}</span></span>
                  ) : null}
                  {row.status && row.kind === "folder" ? (
                    <span className="flex size-3.5 shrink-0 items-center justify-center"><span className={cn("size-1.5 rounded-full", DOT_TONE[row.status])} /></span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
