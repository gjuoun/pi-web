import { Terminal, X } from "lucide-react";
import { getFileIcon } from "@/components/FileIcons";
import { cn } from "@/lib/utils";
import type { FileTabItem } from "../view-types";

/** The file and terminal tab row: the active tab sits on the canvas, the rest on the sidebar tone. */
export function FileTabs({ tabs, activeId }: { tabs: FileTabItem[]; activeId: string }) {
  return (
    <div role="tablist" data-slot="file-tabs" className="flex h-9 shrink-0 items-end overflow-hidden bg-sidebar">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            aria-label={tab.label}
            data-kind={tab.kind}
            className={cn(
              "flex h-9 max-w-45 min-w-20 shrink-0 items-center gap-1.5 border-r border-border pr-1.5 pl-3 text-xs whitespace-nowrap select-none",
              active ? "bg-background text-foreground" : "bg-sidebar text-muted-foreground",
            )}
          >
            <span className={cn("flex shrink-0 items-center", active ? "opacity-100" : "opacity-70")}>
              {tab.kind === "terminal" ? <Terminal aria-hidden="true" className="size-[13px]" /> : getFileIcon(tab.label, 13)}
            </span>
            <span className={cn("flex-1 truncate", active ? "font-medium" : "font-normal")}>{tab.label}</span>
            <X aria-hidden="true" className="size-3 shrink-0 opacity-60" />
          </div>
        );
      })}
    </div>
  );
}
