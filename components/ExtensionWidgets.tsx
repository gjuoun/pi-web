"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { AnsiText } from "@/components/AnsiText";
import { cn } from "@/lib/utils";
import type { ExtensionWidgetItem } from "@/lib/types";

export const DEFAULT_EXPANDED_WIDGET_LINES = 3;
export const WIDGET_UPDATE_IDLE_MS = 1100;

export function formatExtensionWidgetContent(lines: string[]): string {
  return lines.join("\n");
}

export function snapshotExtensionWidgetContents(
  widgets: ExtensionWidgetItem[],
): Map<string, string[]> {
  return new Map(widgets.map((widget) => [widget.key, [...widget.lines]]));
}

export function getUpdatedExtensionWidgetKeys(
  previous: ReadonlyMap<string, readonly string[]> | null,
  next: ReadonlyMap<string, readonly string[]>,
): string[] {
  if (!previous) return [];
  return Array.from(next, ([key, lines]) => {
    const previousLines = previous.get(key);
    if (!previousLines || previousLines.length !== lines.length) {
      return previousLines ? key : null;
    }
    return lines.some((line, index) => line !== previousLines[index]) ? key : null;
  }).filter((key): key is string => key !== null);
}

function getDefaultExpandedWidgetKey(widgets: ExtensionWidgetItem[]): string | null {
  return widgets.find((widget) => {
    const lineCount = widget.lines.length;
    return lineCount > 1 && lineCount <= DEFAULT_EXPANDED_WIDGET_LINES;
  })?.key ?? null;
}

export function getNextExpandedWidgetKey(
  currentKey: string | null,
  requestedKey: string,
): string | null {
  return currentKey === requestedKey ? null : requestedKey;
}

const TRIGGER_CLASS = "group relative flex h-[35px] w-[108px] shrink-0 items-center gap-[5px] overflow-hidden border-0 border-r border-border/[0.78] bg-transparent px-[7px] text-left font-mono text-[11px] text-muted-foreground transition-colors data-[state=expanded]:bg-accent data-[state=expanded]:text-foreground";

export function ExtensionWidgets({ widgets }: { widgets: ExtensionWidgetItem[] }) {
  const { t } = useI18n();
  const idPrefix = useId();
  const previousContentsRef = useRef<Map<string, string[]> | null>(null);
  const updateClearTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [expandedWidgetKey, setExpandedWidgetKey] = useState<string | null>(
    () => getDefaultExpandedWidgetKey(widgets),
  );
  const [updatingWidgetKeys, setUpdatingWidgetKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const nextContents = snapshotExtensionWidgetContents(widgets);
    const updatedKeys = getUpdatedExtensionWidgetKeys(
      previousContentsRef.current,
      nextContents,
    );
    previousContentsRef.current = nextContents;

    for (const [key, timer] of updateClearTimersRef.current) {
      if (nextContents.has(key)) continue;
      clearTimeout(timer);
      updateClearTimersRef.current.delete(key);
    }

    setUpdatingWidgetKeys((current) => {
      const next = new Set(Array.from(current).filter((key) => nextContents.has(key)));
      for (const key of updatedKeys) next.add(key);
      if (
        next.size === current.size
        && Array.from(next).every((key) => current.has(key))
      ) return current;
      return next;
    });

    for (const key of updatedKeys) {
      const currentTimer = updateClearTimersRef.current.get(key);
      if (currentTimer) clearTimeout(currentTimer);
      updateClearTimersRef.current.set(key, setTimeout(() => {
        updateClearTimersRef.current.delete(key);
        setUpdatingWidgetKeys((current) => {
          if (!current.has(key)) return current;
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }, WIDGET_UPDATE_IDLE_MS));
    }
  }, [widgets]);

  useEffect(() => () => {
    for (const timer of updateClearTimersRef.current.values()) clearTimeout(timer);
    updateClearTimersRef.current.clear();
  }, []);

  if (widgets.length === 0) return null;

  const expandedWidget = widgets.find((widget) => (
    widget.key === expandedWidgetKey
    && widget.lines.length > 0
  ));

  const toggleWidget = (widget: ExtensionWidgetItem) => {
    setExpandedWidgetKey((current) => getNextExpandedWidgetKey(current, widget.key));
  };

  return (
    <>
      {expandedWidget && (
        <div
          data-slot="extension-widget-panels"
          className="flex max-h-[min(144px,18dvh)] flex-[0_0_100%] flex-col overflow-x-hidden overflow-y-auto overscroll-contain border-b border-border/[0.78] bg-sidebar [scrollbar-gutter:stable]"
        >
          {(() => {
            const widget = expandedWidget;
            const index = widgets.indexOf(widget);
            const triggerId = `${idPrefix}-trigger-${index}`;
            const panelId = `${idPrefix}-panel-${index}`;
            return (
              <section
                key={widget.key}
                id={panelId}
                data-slot="extension-widget-panel"
                className="min-w-0 shrink-0 overflow-hidden bg-transparent"
                aria-labelledby={triggerId}
              >
                <div
                  data-slot="extension-widget-panel-heading"
                  className="h-[26px] overflow-hidden px-3 pt-[5px] font-mono text-[11px] font-semibold text-ellipsis whitespace-nowrap text-foreground"
                >
                  {widget.key}
                </div>
                <pre
                  data-slot="extension-widget-content"
                  className="m-0 px-3 pt-[3px] pb-2 font-mono text-xs leading-[1.45] break-words whitespace-pre-wrap text-muted-foreground"
                >
                  <AnsiText text={formatExtensionWidgetContent(widget.lines)} />
                </pre>
              </section>
            );
          })()}
        </div>
      )}
      <div
        data-slot="extension-widget-triggers"
        className="flex h-[35px] min-w-0 flex-[1_1_100%] items-stretch overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={t("chat.extensionWidgets")}
      >
        {widgets.map((widget, index) => {
          const expandable = widget.lines.length > 0;
          const expanded = expandable && widget.key === expandedWidget?.key;
          const updating = updatingWidgetKeys.has(widget.key);
          const lineCountLabel = t(
            widget.lines.length === 1 ? "chat.extensionWidgetLine" : "chat.extensionWidgetLines",
            { count: widget.lines.length },
          );
          const placementLabel = t(
            widget.placement === "belowEditor"
              ? "chat.extensionWidgetBelow"
              : "chat.extensionWidgetAbove",
          );
          const triggerId = `${idPrefix}-trigger-${index}`;
          const panelId = `${idPrefix}-panel-${index}`;
          const content = (
            <>
              <span
                data-slot="extension-widget-update-pulse"
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-180 group-data-[updating=true]:opacity-100"
              >
                <span
                  className={cn(
                    "absolute inset-0 bg-primary opacity-12",
                    "group-data-[updating=true]:motion-safe:animate-[extension-widget-update-pulse_900ms_ease-in-out_infinite_alternate]",
                  )}
                />
              </span>
              <span data-slot="extension-widget-placement" aria-hidden="true" className="relative z-1 flex w-2.5 shrink-0 items-center justify-center text-muted-foreground">
                <svg
                  data-slot="extension-widget-placement-icon"
                  className="block h-1.5 w-2 shrink-0 fill-current"
                  viewBox="0 0 8 6"
                  width="8"
                  height="6"
                  data-direction={widget.placement === "belowEditor" ? "down" : "up"}
                  focusable="false"
                >
                  <path
                    d={widget.placement === "belowEditor"
                      ? "M0 0h8L4 6z"
                      : "M4 0l4 6H0z"}
                  />
                </svg>
              </span>
              <span data-slot="extension-widget-key" className="relative z-1 min-w-0 flex-1 overflow-hidden font-semibold text-ellipsis whitespace-nowrap text-foreground">{widget.key}</span>
            </>
          );

          return expandable ? (
            <button
              key={widget.key}
              id={triggerId}
              type="button"
              data-slot="extension-widget-trigger"
              data-state={expanded ? "expanded" : undefined}
              data-updating={updating ? "true" : undefined}
              className={cn(TRIGGER_CLASS, "group cursor-pointer hover:bg-accent hover:text-foreground focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary")}
              aria-controls={panelId}
              aria-expanded={expanded}
              aria-label={`${placementLabel}: ${widget.key}, ${lineCountLabel}`}
              title={`${widget.key} - ${placementLabel} - ${expanded ? t("i18n.collapse") : t("i18n.expand")}`}
              onClick={() => toggleWidget(widget)}
            >
              {content}
            </button>
          ) : (
            <div
              key={widget.key}
              data-slot="extension-widget-trigger"
              data-updating={updating ? "true" : undefined}
              className={cn(TRIGGER_CLASS, "group")}
              aria-label={`${placementLabel}: ${widget.key}, ${lineCountLabel}`}
              title={`${widget.key} - ${placementLabel}`}
            >
              {content}
            </div>
          );
        })}
      </div>
    </>
  );
}
