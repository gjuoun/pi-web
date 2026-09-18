"use client";

import { useI18n } from "@/hooks/useI18n";
import { useHomeDir } from "@/hooks/useHomeDir";
import { collapseHomePath } from "@/lib/path-display";
import type { ContextUsage, SessionStatsInfo } from "@/lib/pi-types";
import type { AgentUsage } from "@/lib/types";

/**
 * pi's native footer, reproduced for the web.
 *
 * Reference: `@earendil-works/pi-coding-agent/dist/modes/interactive/components/footer.js`
 * (`FooterComponent`). Line 1 is `cwd (branch) • session name`; line 2 is the usage stats on the
 * left and `(provider) model • level` on the right. The web drops pi's `• ` inside each pair: both
 * clusters are pinned to opposite ends of their line, so a leading separator would hang off the
 * right-hand one with nothing left to separate it from — a left inset on that cluster does the job.
 *
 * A new session has neither a name nor counters to show, so it collapses to a single line: the
 * workspace against the model and thinking pickers. pi's third line (extension statuses) rides in
 * the same bar — `ExtensionStatusLine` renders whatever extensions publish, including the
 * `tps-status` extension's task-timer line — and every line shares one scroll surface with it in
 * `ChatWindow`, so a bar that outgrows the window scrolls as a whole.
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

/** `~/path (branch)` — pi's line 1 (`footer.js:100-111`), minus the session name, which is its own segment. */
export function formatProjectLine(input: {
  cwd?: string | null;
  projectRoot?: string | null;
  home?: string | null;
  branch?: string | null;
}): string {
  // A linked worktree shows its main repo; cwd is the fallback for the transient sessions the client
  // builds before its first refresh, where projectRoot is not set yet.
  const target = input.projectRoot || input.cwd;
  if (!target) return "";
  let line = collapseHomePath(target, input.home);
  if (input.branch) line = `${line} (${input.branch})`;
  return line;
}

/** The session-name segment, empty while the session has no name. */
export function formatSessionName(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "";
}

/** pi colours the context segment by band: `>90` error, `>70` warning. */
export function contextColor(percent: number | null | undefined): string | undefined {
  if (typeof percent !== "number") return undefined;
  if (percent > 90) return "#ef4444";
  if (percent > 70) return "rgba(234,179,8,0.95)";
  return undefined;
}

interface Props {
  cwd?: string | null;
  /** Main repo of a linked worktree; falls back to `cwd` when absent. */
  projectRoot?: string | null;
  branch?: string | null;
  sessionName?: string | null;
  /**
   * True while the session has no messages yet. The row narrows to `[model] [project]` — the
   * project justifies against the model — and drops the name and token segments entirely.
   */
  fresh?: boolean;
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
  // Both segments are plain text triggers: the list they open is the one shared picker, which
  // ChatWindow owns and anchors, so the bar carries no popover state of its own.
  onOpenModelPicker?: () => void;
  onOpenThinkingPicker?: () => void;
}

export function ChatStatusBar({
  cwd,
  projectRoot,
  branch,
  sessionName,
  fresh = false,
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
  onOpenModelPicker,
  onOpenThinkingPicker,
}: Props) {
  const { t } = useI18n();
  const fetchedHome = useHomeDir();
  const homeDir = home ?? fetchedHome;

  const projectLine = formatProjectLine({ cwd, projectRoot, home: homeDir, branch });
  const nameLine = formatSessionName(sessionName);
  const stats = usage
    ? { tokens: usage.tokens, cost: usage.cost ?? 0, cacheHitRate: latestCacheHitRate(messages) }
    : null;
  const items = usageStats(stats, contextUsage, autoCompactionEnabled);
  const modelName = formatModelName({ model, providerCount });
  const thinkingSuffix = formatThinkingSuffix({ thinkingLevel, supportsReasoning });


  // Without a project line there is nothing to anchor the row; the fresh state is exactly this pair.
  if (!projectLine) return null;

  // A plain text trigger. The list it opens is the one shared picker — the bar keeps no popover
  // state of its own, so both segments behave identically to the composer's /model and /thinking.
  const modelSegment = onOpenModelPicker ? (
    <button
      type="button"
      className="chat-status-segment"
      title={modelName}
      aria-label={t("chat.commandModel")}
      aria-haspopup="listbox"
      disabled={busy}
      onClick={onOpenModelPicker}
    >
      {modelName}
    </button>
  ) : modelName;

  const thinkingSegment = thinkingSuffix
    ? (onOpenThinkingPicker ? (
      <span className="chat-status-thinking">
        <button
          type="button"
          className="chat-status-segment"
          title={t("chat.changeReasoningLabel")}
          aria-label={t("chat.changeReasoningLabel")}
          aria-haspopup="listbox"
          disabled={busy}
          onClick={onOpenThinkingPicker}
        >
          {thinkingSuffix}
        </button>
      </span>
    ) : <span>{thinkingSuffix}</span>)
    : null;

  // The model cluster closes whichever line it rides on: the only line when the session is new,
  // line 2 once the run has counters to report.
  const modelCluster = (
    <span className="chat-status-model">
      {modelSegment}
      {thinkingSegment}
    </span>
  );

  return (
    <div
      className={`chat-status-bar${fresh ? " is-fresh" : ""}`}
      role="status"
      aria-label={t("chat.status")}
    >
      {fresh ? (
        // No counters and no name yet: the workspace against the pickers it was chosen with.
        <div className="chat-status-line">
          <span className="chat-status-project">{projectLine}</span>
          {modelCluster}
        </div>
      ) : (
        <>
          <div className="chat-status-line">
            <span className="chat-status-project">{projectLine}</span>
            {nameLine && <span className="chat-status-name">{nameLine}</span>}
          </div>
          <div className="chat-status-line">
            <span className="chat-status-stats">
              {items.map((item) => {
                const tint = item.kind === "context" ? contextColor(item.percent) : undefined;
                return (
                  <span key={item.kind} style={tint ? { color: tint } : undefined}>{item.text}</span>
                );
              })}
            </span>
            {modelCluster}
          </div>
        </>
      )}
    </div>
  );
}

