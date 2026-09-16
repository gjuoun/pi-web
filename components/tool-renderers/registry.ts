import type { ComponentType } from "react";
import type { ToolCallContent, ToolResultMessage } from "@/lib/types";

/**
 * Custom tool renderers — the insertion point for preset UI components
 * (charts, quote cards, …). A renderer registered for a tool name takes over
 * the toolCall block entirely; the default MessageView body renders when
 * nothing matches. Nothing registers at startup, so today's output is
 * byte-identical with this module in place.
 */

export interface ToolRendererProps {
  block: ToolCallContent;
  result?: ToolResultMessage;
  duration?: number;
}

export type ToolRendererMatcher = string | RegExp | ((toolName: string) => boolean);

interface Entry {
  matcher: ToolRendererMatcher;
  component: ComponentType<ToolRendererProps>;
}

// Module-level registry. Order matters: first match wins.
const entries: Entry[] = [];

export function registerToolRenderer(
  matcher: ToolRendererMatcher,
  component: ComponentType<ToolRendererProps>,
): void {
  entries.push({ matcher, component });
}

/** Test-only: drop all registrations. */
export function clearToolRenderers(): void {
  entries.length = 0;
}

export function resolveToolRenderer(
  toolName: string,
): ComponentType<ToolRendererProps> | undefined {
  for (const entry of entries) {
    const matches =
      typeof entry.matcher === "string"
        ? entry.matcher === toolName
        : typeof entry.matcher === "function"
          ? entry.matcher(toolName)
          : entry.matcher.test(toolName);
    if (matches) return entry.component;
  }
  return undefined;
}
