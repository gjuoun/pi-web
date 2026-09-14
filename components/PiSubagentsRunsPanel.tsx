"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { PiSubagentRun } from "@/lib/pi-subagents-bridge";

/**
 * The duplicated top-bar panel: runs started on the `pi-subagents` engine in the current session.
 *
 * This is the second Agents surface, sibling to the one that lists Pi Web's own sub-agent sessions
 * (`AgentSessionPanel`) — that one reads session relations, this one reads the package's runs, and
 * neither replaces the other (docs/adr/0003).
 */
export interface PiSubagentsRunsPanelProps {
  sessionId: string;
  selectedSessionId: string;
  onSelectSessionId: (sessionId: string) => void;
}

interface RunsResponse {
  engineReady: boolean;
  runs: PiSubagentRun[];
}

const POLL_MS = 2000;

function elapsedOf(run: PiSubagentRun, now: number): number {
  const started = Date.parse(run.startedAt);
  if (!Number.isFinite(started)) return 0;
  const ended = run.completedAt ? Date.parse(run.completedAt) : now;
  return Math.max(0, (Number.isFinite(ended) ? ended : now) - started);
}

function formatElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatTokens(tokens: number | undefined): string | null {
  if (tokens === undefined) return null;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

function statusColor(status: PiSubagentRun["status"]): string {
  if (status === "running" || status === "starting" || status === "steered") return "var(--accent)";
  if (status === "completed") return "#16a34a";
  if (status === "error") return "#dc2626";
  if (status === "aborted" || status === "stopped") return "#d97706";
  return "var(--text-dim)";
}

const IS_RUNNING = new Set<PiSubagentRun["status"]>(["starting", "running", "steered"]);

/** Pure list: everything the panel shows, with `now` injectable so elapsed time is testable. */
export function PiSubagentsRunsList({
  runs,
  engineReady,
  selectedSessionId,
  onSelectSessionId,
  now,
}: RunsResponse & {
  selectedSessionId: string;
  onSelectSessionId: (sessionId: string) => void;
  /** Wall clock for elapsed time, supplied by the caller: rendering must stay pure. */
  now: number;
}) {
  const { t } = useI18n();

  if (!engineReady) {
    return (
      <div style={{ padding: "10px 12px", color: "var(--text-dim)", fontSize: 12 }} data-testid="pi-subagents-panel-not-enabled">
        {t("piSubagents.notEnabled")}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div style={{ padding: "10px 12px", color: "var(--text-dim)", fontSize: 12 }} data-testid="pi-subagents-panel-empty">
        {t("piSubagents.empty")}
      </div>
    );
  }

  return (
    <div data-testid="pi-subagents-panel">
      {runs.map((run) => {
        const running = IS_RUNNING.has(run.status);
        const tokens = formatTokens(run.tokens);
        const openable = typeof run.childSessionId === "string" && run.childSessionId.length > 0;
        const selected = openable && run.childSessionId === selectedSessionId;
        return (
          <button
            key={run.runId}
            type="button"
            onClick={() => { if (openable) onSelectSessionId(run.childSessionId!); }}
            disabled={!openable}
            data-selected={selected ? "true" : undefined}
            title={openable ? t("piSubagents.openSession") : t("piSubagents.sessionPending")}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "8px 12px", border: "none",
              borderBottom: "1px solid var(--border)",
              background: selected ? "var(--bg-selected)" : "none",
              color: "var(--text)", cursor: openable ? "pointer" : "default",
              fontSize: 12, lineHeight: 1.45,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden="true" style={{
                width: 7, height: 7, borderRadius: 4, flexShrink: 0,
                background: statusColor(run.status),
              }} />
              <span style={{ fontWeight: 600 }}>{run.profile}</span>
              <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {run.description}
              </span>
            </span>
            <span style={{ display: "block", marginTop: 2, color: "var(--text-dim)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
              <span data-testid="pi-subagents-run-status">{t(`piSubagents.status.${running ? "running" : run.status}`)}</span>
              {" · "}
              <span data-testid="pi-subagents-run-elapsed">{formatElapsed(elapsedOf(run, now))}</span>
              {run.toolUses !== undefined ? ` · ${run.toolUses} ${t("piSubagents.tools")}` : ""}
              {tokens ? ` · ${tokens} ${t("piSubagents.tokens")}` : ""}
              {run.cost ? ` · $${run.cost.toFixed(4)}` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Container: polls the runs route while the panel is open. */
export function PiSubagentsRunsPanel({ sessionId, selectedSessionId, onSelectSessionId }: PiSubagentsRunsPanelProps) {
  const [state, setState] = useState<RunsResponse>({ engineReady: false, runs: [] });
  // 0 until the first response lands; the elapsed label reads "0s" for at most one poll.
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/pi-subagents/runs?sessionId=${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json() as RunsResponse;
        if (cancelled) return;
        setState({ engineReady: data.engineReady === true, runs: Array.isArray(data.runs) ? data.runs : [] });
        setNow(Date.now());
      } catch { /* keep the last snapshot; the next tick retries */ }
    };
    void load();
    const timer = setInterval(() => { void load(); }, POLL_MS);
    return () => { cancelled = true; controller.abort(); clearInterval(timer); };
  }, [sessionId]);

  return (
    <PiSubagentsRunsList
      engineReady={state.engineReady}
      runs={state.runs}
      selectedSessionId={selectedSessionId}
      onSelectSessionId={onSelectSessionId}
      now={now}
    />
  );
}
