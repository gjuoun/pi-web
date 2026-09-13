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
 * left and `(provider) model • level` on the right. pi's third line (extension statuses) is not
 * reproduced here — `ExtensionStatusBar` renders whatever extensions publish, including the
 * `⏳ … ⚡ … tok/s … ttft …` line from the `tps-status` extension.
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

/** Right side of line 2 — `(provider) model • level` (`footer.js:154-178`). */
export function formatModelLabel(input: {
  model?: { provider: string; modelId: string } | null;
  providerCount: number;
  thinkingLevel?: string | null;
  supportsReasoning: boolean;
}): string {
  const modelId = input.model?.modelId || "no-model";
  let label = modelId;
  if (input.supportsReasoning) {
    const level = input.thinkingLevel || "off";
    label = level === "off" ? `${modelId} • thinking off` : `${modelId} • ${level}`;
  }
  // pi only prefixes the provider while more than one provider has available models.
  if (input.providerCount > 1 && input.model?.provider) {
    label = `(${input.model.provider}) ${label}`;
  }
  return label;
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
}: Props) {
  const { t } = useI18n();
  const fetchedHome = useHomeDir();
  const homeDir = home ?? fetchedHome;

  const pwdLine = formatPwdLine({ cwd, home: homeDir, branch, sessionName });
  const stats = usage
    ? { tokens: usage.tokens, cost: usage.cost ?? 0, cacheHitRate: latestCacheHitRate(messages) }
    : null;
  const items = usageStats(stats, contextUsage, autoCompactionEnabled);
  const modelLabel = formatModelLabel({ model, providerCount, thinkingLevel, supportsReasoning });

  if (!pwdLine && items.length === 0) return null;

  return (
    <div className="chat-status-bar" role="status" aria-label={t("chat.status")}>
      {pwdLine && <div className="chat-status-line">{pwdLine}</div>}
      <div className="chat-status-line">
        <span className="chat-status-stats">
          {items.map((item) => {
            const tint = item.kind === "context" ? contextColor(item.percent) : undefined;
            return (
              <span key={item.kind} style={tint ? { color: tint } : undefined}>{item.text}</span>
            );
          })}
        </span>
        <span className="chat-status-model">{modelLabel}</span>
      </div>
    </div>
  );
}
