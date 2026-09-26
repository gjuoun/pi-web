"use client";

import { getFileIcon } from "./FileIcons";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FileViewerDisplayMode, FileViewerState } from "@/lib/file-viewer-state";

export interface Tab {
  id: string;
  label: string;
  filePath: string;
  kind?: "terminal";
  closing?: boolean;
  sourceSessionId?: string | null;
  initialDisplayMode?: FileViewerDisplayMode;
  viewerState?: FileViewerState;
  viewerRevision?: number;
}

interface Props {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab }: Props) {
  const { t } = useI18n();

  return (
    <div role="tablist" className="flex h-9 shrink-0 items-end overflow-x-auto bg-sidebar">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-label={tab.kind === "terminal" ? t("terminal.tabLabel", { name: tab.label }) : tab.label}
            aria-selected={isActive}
            tabIndex={isActive || (!activeTabId && tabs[0].id === tab.id) ? 0 : -1}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectTab(tab.id);
              } else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const index = tabs.findIndex((item) => item.id === tab.id);
                const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
                  : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                onSelectTab(tabs[next].id);
                (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
              }
            }}
            onClick={() => onSelectTab(tab.id)}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault();
            }}
            onAuxClick={(e) => {
              if (e.button !== 1) return;
              e.preventDefault();
              e.stopPropagation();
              if (!tab.closing) onCloseTab(tab.id);
            }}
            className={cn(
              "flex h-9 min-w-20 max-w-45 shrink-0 cursor-pointer items-center gap-1.5 border-r border-border pr-1.5 pl-3 text-xs whitespace-nowrap select-none transition-colors",
              isActive ? "bg-background text-foreground" : "bg-sidebar text-muted-foreground",
            )}
          >
            <span className={cn("flex shrink-0 items-center", isActive ? "opacity-100" : "opacity-70")}>
              {tab.kind === "terminal" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              ) : getFileIcon(tab.label, 13)}
            </span>
            <span
              className={cn("flex-1 overflow-hidden text-ellipsis", isActive ? "font-medium" : "font-normal")}
              title={tab.filePath}
            >
              {tab.label}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={tab.closing}
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              title={t(tab.kind === "terminal" ? "terminal.close" : "i18n.close")}
              aria-label={`${t(tab.kind === "terminal" ? "terminal.close" : "i18n.close")} ${tab.label}`}
            >
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
