"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useHomeDir } from "@/hooks/useHomeDir";
import { collapseHomePath } from "@/lib/path-display";
import type { ContextUsage, SessionStatsInfo } from "@/lib/pi-types";
import {
  THINKING_LEVEL_DESC_KEYS,
  thinkingChoicesFor,
  thinkingLevelAlias,
  type ThinkingLevelChoice,
} from "@/lib/thinking-levels";
import type { AgentUsage } from "@/lib/types";
import { ModelSelector, type ModelSelectorOption } from "./ModelSelector";

/**
 * pi's native footer, reproduced for the web.
 *
 * Reference: `@earendil-works/pi-coding-agent/dist/modes/interactive/components/footer.js`
 * (`FooterComponent`). Line 1 is `cwd (branch) • session name`; line 2 is the usage stats on the
 * left and `(provider) model • level` on the right. pi's third line (extension statuses) is not
 * reproduced here — `ExtensionStatusBar` renders whatever extensions publish, including the
 * `tps-status` extension's task-timer line.
 *
 * Where pi only prints text, the model / level segments double as the control surface:
 * the composer keeps an image button and a send button and nothing else.
 */

/** pi's `formatTokens` (`footer.js:20-30`) — the exact thresholds both lines rely on. */
export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

/** Cache hit rate of the *latest* assistant message, as a percentage (`footer.js:83-85`). */
export function latestCacheHitRate(
  messages: readonly { role?: string; usage?: AgentUsage | null }[] | undefined,
): number | null {
  if (!messages) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant" || !message.usage) continue;
    const usage = message.usage;
    const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
    return promptTokens > 0 ? (usage.cacheRead / promptTokens) * 100 : null;
  }
  return null;
}

export type UsageStatKind =
  | "input"
  | "output"
  | "cacheRead"
  | "cacheWrite"
  | "cacheHit"
  | "cost"
  | "context";

export interface UsageStat {
  kind: UsageStatKind;
  text: string;
  /** Context segment only — drives the `>90` error / `>70` warning tone. */
  percent?: number | null;
}

export interface StatusUsageStats {
  tokens: SessionStatsInfo["tokens"];
  cost: number;
  cacheHitRate: number | null;
}

/**
 * Left side of line 2, split so the context segment can carry its own colour. Every counter is
 * omitted while it is zero, `CH` additionally requires cache traffic in either direction, and the
 * context segment is never omitted.
 */
export function usageStats(
  stats: StatusUsageStats | null,
  contextUsage: ContextUsage | null | undefined,
  autoCompactionEnabled: boolean,
): UsageStat[] {
  const items: UsageStat[] = [];
  if (stats) {
    const { input, output, cacheRead, cacheWrite } = stats.tokens;
    if (input) items.push({ kind: "input", text: `↑${formatTokens(input)}` });
    if (output) items.push({ kind: "output", text: `↓${formatTokens(output)}` });
    if (cacheRead) items.push({ kind: "cacheRead", text: `R${formatTokens(cacheRead)}` });
    if (cacheWrite) items.push({ kind: "cacheWrite", text: `W${formatTokens(cacheWrite)}` });
    const hasCacheTraffic = cacheRead > 0 || cacheWrite > 0;
    if (hasCacheTraffic && stats.cacheHitRate !== null && stats.cacheHitRate !== undefined) {
      items.push({ kind: "cacheHit", text: `CH${stats.cacheHitRate.toFixed(1)}%` });
    }
    if (stats.cost > 0) items.push({ kind: "cost", text: `$${stats.cost.toFixed(3)}` });
  }

  if (contextUsage?.contextWindow) {
    const percent = contextUsage.percent;
    const percentText = percent === null || percent === undefined ? "?" : `${percent.toFixed(1)}%`;
    items.push({
      kind: "context",
      text: `${percentText}/${formatTokens(contextUsage.contextWindow)}${autoCompactionEnabled ? " (auto)" : ""}`,
      percent,
    });
  }

  return items;
}

/** Space-joined form of {@link usageStats}, for tests and plain-text callers. */
export function formatUsageStats(
  stats: StatusUsageStats | null,
  contextUsage: ContextUsage | null | undefined,
  autoCompactionEnabled: boolean,
): string {
  return usageStats(stats, contextUsage, autoCompactionEnabled).map((item) => item.text).join(" ");
}

/** `(provider) model` — the model half of pi's right-hand side (`footer.js:154-178`). */
export function formatModelName(input: {
  model?: { provider: string; modelId: string } | null;
  providerCount: number;
}): string {
  const modelId = input.model?.modelId || "no-model";
  // pi only prefixes the provider while more than one provider has available models.
  if (input.providerCount > 1 && input.model?.provider) {
    return `(${input.model.provider}) ${modelId}`;
  }
  return modelId;
}

/** `• low` — the thinking half of pi's right-hand side; empty for non-reasoning models. */
export function formatThinkingSuffix(input: {
  thinkingLevel?: string | null;
  supportsReasoning: boolean;
}): string {
  if (!input.supportsReasoning) return "";
  const level = input.thinkingLevel || "off";
  return level === "off" ? "• thinking off" : `• ${level}`;
}

/** Right side of line 2, `(provider) model • level`, for the read-only rendering. */
export function formatModelLabel(input: {
  model?: { provider: string; modelId: string } | null;
  providerCount: number;
  thinkingLevel?: string | null;
  supportsReasoning: boolean;
}): string {
  return [formatModelName(input), formatThinkingSuffix(input)].filter(Boolean).join(" ");
}

/** `~/path (branch) • name` — pi's line 1 (`footer.js:100-111`). */
export function formatPwdLine(input: {
  cwd?: string | null;
  home?: string | null;
  branch?: string | null;
  sessionName?: string | null;
}): string {
  if (!input.cwd) return "";
  let line = collapseHomePath(input.cwd, input.home);
  if (input.branch) line = `${line} (${input.branch})`;
  if (input.sessionName) line = `${line} • ${input.sessionName}`;
  return line;
}

/** pi colours the context segment by band: `>90` error, `>70` warning. */
export function contextColor(percent: number | null | undefined): string | undefined {
  if (typeof percent !== "number") return undefined;
  if (percent > 90) return "#ef4444";
  if (percent > 70) return "rgba(234,179,8,0.95)";
  return undefined;
}

interface StatusMenuItem {
  key: string;
  label: string;
  description?: string;
  active: boolean;
  onSelect: () => void;
}

/** One flat, pi-styled text trigger with an upward menu. */
function StatusMenu({
  label,
  title,
  disabled,
  items,
  openKey,
  menuKey,
  onOpenChange,
}: {
  label: string;
  title: string;
  disabled?: boolean;
  items: StatusMenuItem[];
  openKey: string | null;
  menuKey: string;
  onOpenChange: (key: string | null) => void;
}) {
  const open = openKey === menuKey;
  const rootRef = useRef<HTMLSpanElement>(null);
  // The popover lives outside the scrolling row, so it is anchored from the trigger's viewport rect
  // on open instead of from an absolutely-positioned ancestor (ModelSelector does the same).
  const [anchorRect, setAnchorRect] = useState<{ top: number; right: number; bottom: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onOpenChange(null);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open, onOpenChange]);

  return (
    <span
      ref={rootRef}
      className="chat-status-menu"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(null);
      }}
    >
      <button
        type="button"
        className="chat-status-segment"
        title={title}
        aria-label={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchorRect({ top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width });
          onOpenChange(open ? null : menuKey);
        }}
      >
        {label}
      </button>
      {open && anchorRect && (() => {
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
        const spaceAbove = anchorRect.top - 8;
        const spaceBelow = viewportHeight - anchorRect.bottom - 8;
        // Prefer opening downwards; flip above only when the row is close enough to the bottom
        // that the menu no longer fits below it.
        const openAbove = spaceBelow < Math.min(320, viewportHeight * 0.5);
        const maxHeight = Math.max(120, Math.min(openAbove ? spaceAbove : spaceBelow, viewportHeight * 0.6));
        const verticalPosition = openAbove
          ? { bottom: viewportHeight - anchorRect.top + 6 }
          : { top: anchorRect.bottom + 6 };
        const horizontalPosition: CSSProperties = {
          right: Math.max(8, viewportWidth - anchorRect.right),
          maxWidth: Math.max(anchorRect.width, viewportWidth - anchorRect.left - 8),
        };

        return (
          <div
            className="chat-status-menu-popover"
            role="listbox"
            aria-label={title}
            style={{ ...verticalPosition, ...horizontalPosition, maxHeight }}
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="option"
                aria-selected={item.active}
                className={`chat-status-menu-item${item.active ? " is-active" : ""}`}
                onClick={() => {
                  onOpenChange(null);
                  if (!item.active) item.onSelect();
                }}
              >
                <span className="chat-status-menu-check">
                  {item.active ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1.5 5 4 7.5 8.5 2.5" />
                    </svg>
                  ) : null}
                </span>
                <span className="chat-status-menu-label">{item.label}</span>
                {item.description && <span className="chat-status-menu-desc">{item.description}</span>}
              </button>
            ))}
          </div>
        );
      })()}
    </span>
  );
}

interface Props {
  cwd?: string | null;
  branch?: string | null;
  sessionName?: string | null;
  /** Test/embedding override; otherwise the home directory is fetched once per tab. */
  home?: string;
  usage?: SessionStatsInfo | null;
  messages?: readonly { role?: string; usage?: AgentUsage | null }[];
  contextUsage?: ContextUsage | null;
  autoCompactionEnabled?: boolean;
  model?: { provider: string; modelId: string } | null;
  providerCount?: number;
  thinkingLevel?: string | null;
  supportsReasoning?: boolean;
  /** True while the agent is running: every segment is read-only then. */
  busy?: boolean;
  // Model segment
  modelOptions?: ModelSelectorOption[];
  onModelChange?: (provider: string, modelId: string) => void;
  modelSwitching?: boolean;
  isAutoModelSelection?: boolean;
  // Thinking segment
  onThinkingLevelChange?: (level: ThinkingLevelChoice) => void;
  availableThinkingLevels?: string[] | null;
  thinkingLevelMap?: Record<string, string | null> | null;
}

export function ChatStatusBar({
  cwd,
  branch,
  sessionName,
  home,
  usage,
  messages,
  contextUsage,
  autoCompactionEnabled = false,
  model,
  providerCount = 0,
  thinkingLevel,
  supportsReasoning = false,
  busy = false,
  modelOptions,
  onModelChange,
  modelSwitching = false,
  isAutoModelSelection = false,
  onThinkingLevelChange,
  availableThinkingLevels,
  thinkingLevelMap,
}: Props) {
  const { t } = useI18n();
  const fetchedHome = useHomeDir();
  const homeDir = home ?? fetchedHome;
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // A segment opened while idle should not survive a run that starts underneath it.
  useEffect(() => {
    if (busy) setOpenMenu(null);
  }, [busy]);

  const pwdLine = formatPwdLine({ cwd, home: homeDir, branch, sessionName });
  const stats = usage
    ? { tokens: usage.tokens, cost: usage.cost ?? 0, cacheHitRate: latestCacheHitRate(messages) }
    : null;
  const items = usageStats(stats, contextUsage, autoCompactionEnabled);
  const modelName = formatModelName({ model, providerCount });
  const thinkingSuffix = formatThinkingSuffix({ thinkingLevel, supportsReasoning });

  const thinkingItems: StatusMenuItem[] = thinkingChoicesFor(availableThinkingLevels).map((level) => {
    const alias = thinkingLevelAlias(level, thinkingLevelMap);
    const description = t(THINKING_LEVEL_DESC_KEYS[level]);
    return {
      key: level,
      label: alias ?? level,
      description: alias ? `(${level}) ${description}` : description,
      active: (thinkingLevel ?? "auto") === level,
      onSelect: () => onThinkingLevelChange?.(level),
    };
  });

  if (!pwdLine && items.length === 0) return null;

  let modelSegment: ReactNode = modelName;
  if (onModelChange) {
    // Rendered even with an empty option list: the selector itself reports "No models", which is
    // how a broken models.json surfaces next to the model-error banner.
    modelSegment = (
      <ModelSelector
        variant="status"
        placement="up"
        options={modelOptions ?? []}
        value={model}
        onChange={onModelChange}
        disabled={busy}
        busy={modelSwitching}
        isAutoSelection={isAutoModelSelection}
        triggerLabel={model ? modelName : undefined}
        ariaLabel={modelName}
      />
    );
  }

  return (
    <div className="chat-status-bar" role="status" aria-label={t("chat.status")}>
      {pwdLine && <span className="chat-status-pwd">{pwdLine}</span>}
      <span className="chat-status-stats">
        {items.map((item) => {
          const tint = item.kind === "context" ? contextColor(item.percent) : undefined;
          return (
            <span key={item.kind} style={tint ? { color: tint } : undefined}>{item.text}</span>
          );
        })}
      </span>
      <span className="chat-status-model">
        {modelSegment}
        {thinkingSuffix && (
          onThinkingLevelChange ? (
            <StatusMenu
              label={thinkingSuffix}
              title={t("chat.changeReasoningLabel")}
              disabled={busy}
              items={thinkingItems}
              openKey={openMenu}
              menuKey="thinking"
              onOpenChange={setOpenMenu}
            />
          ) : <span>{thinkingSuffix}</span>
        )}
      </span>
    </div>
  );
}

