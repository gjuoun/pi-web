"use client";

import { stripAnsi } from "@/lib/ansi";
import type { ExtensionStatusItem, ExtensionWidgetItem } from "@/lib/types";
import { AnsiText } from "./AnsiText";
import { ExtensionWidgets } from "./ExtensionWidgets";

export function sanitizeExtensionStatusText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\t/g, " ").replace(/ +/g, " ").trim())
    .join("\n")
    .trim();
}

export function formatExtensionStatusLine(statuses: ExtensionStatusItem[]): string {
  return [...statuses]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ text }) => sanitizeExtensionStatusText(text))
    .join(" ");
}

/**
 * Line 3 of pi's footer — the ANSI extension status text as a single, unwrapped block that rides
 * inside the status row. The row's `max-height` + `overflow-y: auto` is the only cap, so a tall or
 * multi-line status scrolls instead of being truncated.
 */
export function ExtensionStatusLine({ statuses }: { statuses: ExtensionStatusItem[] }) {
  if (statuses.length === 0) return null;

  const statusLine = formatExtensionStatusLine(statuses);
  const plainStatusLine = stripAnsi(statusLine);

  return (
    <div
      role="status"
      data-slot="chat-status-ext"
      className="px-1 font-mono text-[11px] whitespace-pre text-muted-foreground"
      aria-label={plainStatusLine}
      title={plainStatusLine}
    >
      <span data-slot="extension-status-text" className="min-w-0 flex-1 font-mono text-[11px] leading-[1.45] whitespace-pre text-muted-foreground">
        <AnsiText text={statusLine} />
      </span>
    </div>
  );
}

/** The extension widget shelf: a sibling row above the status row, carrying widgets only. */
export function ExtensionStatusBar({ widgets = [] }: { widgets?: ExtensionWidgetItem[] }) {
  if (widgets.length === 0) return null;

  return (
    <div data-slot="extension-status-shelf" data-state="has-widgets" className="flex min-w-0 shrink-0 flex-wrap items-stretch">
      <ExtensionWidgets widgets={widgets} />
    </div>
  );
}
