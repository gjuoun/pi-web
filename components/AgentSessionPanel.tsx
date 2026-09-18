"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { SessionInfo, SubagentSessionStatus } from "@/lib/types";
// Type-only: `lib/pi-subagents-bridge` reaches the pi SDK, and a value import from a client
// component drags it into the browser bundle (see lib/pi-subagents-details.ts).
import type { PiSubagentRun } from "@/lib/pi-subagents-bridge";

interface Props {
  rootSession: SessionInfo;
  subagents: SessionInfo[];
  selectedSessionId: string;
  runningSessionIds: ReadonlySet<string>;
  onSelectSession: (session: SessionInfo) => void;
  /**
   * Live runs of the `pi-subagents` engine for this parent session. The single Agents tab shows
   * both what is on disk (the family) and what the engine is doing right now: a run that already
   * has a child session enriches that row, one that does not yet renders as a pending row.
   */
  runs?: readonly PiSubagentRun[];
}

function formatTokens(tokens: number | undefined): string | null {
  if (tokens === undefined) return null;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

/** The metrics line a package run contributes to a row: tool uses, tokens, cost. */
function runMetrics(run: PiSubagentRun | undefined, t: (key: string) => string): string | null {
  if (!run) return null;
  const tokens = formatTokens(run.tokens);
  const parts = [
    run.toolUses !== undefined ? `${run.toolUses} ${t("piSubagents.tools")}` : null,
    tokens ? `${tokens} ${t("piSubagents.tokens")}` : null,
    run.cost ? `$${run.cost.toFixed(4)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function sessionTitle(session: SessionInfo): string {
  return session.name || session.firstMessage || session.id.slice(0, 12);
}

function formatRelativeTime(value: string, locale: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const elapsedSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(elapsedSeconds) < 60) return formatter.format(elapsedSeconds, "second");
  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  if (Math.abs(elapsedMinutes) < 60) return formatter.format(elapsedMinutes, "minute");
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (Math.abs(elapsedHours) < 24) return formatter.format(elapsedHours, "hour");
  return formatter.format(Math.round(elapsedHours / 24), "day");
}

/** The row's status tone; every tone is a `.agent-session-row-status.is-*` rule in globals.css. */
function statusTone(status: SubagentSessionStatus): string {
  if (status === "running" || status === "starting") return "is-running";
  if (status === "completed") return "is-completed";
  if (status === "failed") return "is-failed";
  if (status === "aborted") return "is-aborted";
  return "is-idle";
}

function StatusIcon({ status }: { status: SubagentSessionStatus }) {
  if (status === "running" || status === "starting") {
    return (
      <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" />
      </svg>
    );
  }
  if (status === "aborted" || status === "interrupted") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M9 9h6v6H9z" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" />
    </svg>
  );
}

function AgentRow({
  session,
  main,
  selected,
  running,
  run,
  onSelect,
}: {
  session: SessionInfo;
  main?: boolean;
  selected: boolean;
  running: boolean;
  run?: PiSubagentRun;
  onSelect: () => void;
}) {
  const { locale, t } = useI18n();
  const relation = session.relation?.kind === "subagent" ? session.relation : null;
  const status: SubagentSessionStatus = running ? "running" : relation?.status ?? "completed";
  const primary = main ? t("agentSwitcher.main") : relation?.description || sessionTitle(session);
  const metrics = runMetrics(run, t);
  const secondary = main
    ? sessionTitle(session)
    : [
        `${relation?.profile ?? t("agentSwitcher.subagent")} · ${formatRelativeTime(session.modified, locale)}`,
        metrics,
      ].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={"agent-session-row" + (selected ? " is-selected" : "")}
      onMouseEnter={(event) => {
        if (!selected) event.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(event) => {
        if (!selected) event.currentTarget.style.background = "transparent";
      }}
    >
      <span className={"agent-session-row-icon" + (main ? " is-main" : "")}>
        {main ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="7" width="14" height="11" rx="2" /><path d="M9 11h.01M15 11h.01M9 15h6M12 7V4M10 4h4" />
          </svg>
        )}
      </span>
      <span className="agent-session-row-copy">
        <span className={"agent-session-row-title" + (selected ? " is-selected" : "")} title={primary}>
          {primary}
        </span>
        <span className="agent-session-row-subtitle" title={secondary}>
          {relation?.engine === "pi-subagents" && (
            // Origin tag: without it a package run reads exactly like one of Pi Web's own children.
            <span
              data-testid="agent-engine-tag"
              className="agent-session-engine-tag"
            >
              {t("agentSwitcher.enginePackage")}
            </span>
          )}
          {secondary}
        </span>
      </span>
      <span className={"agent-session-row-status " + (main && !running ? "is-main" : statusTone(status))}>
        {main && !running ? (
          selected ? t("agentSwitcher.current") : null
        ) : (
          <>
            <StatusIcon status={status} />
            <span>{t(`agentSwitcher.status.${status}`)}</span>
          </>
        )}
      </span>
    </button>
  );
}

export function AgentSessionPanel({ rootSession, subagents, selectedSessionId, runningSessionIds, onSelectSession, runs = [] }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const sortedSubagents = useMemo(() => [...subagents].sort((a, b) => {
    const aRunning = runningSessionIds.has(a.id);
    const bRunning = runningSessionIds.has(b.id);
    if (aRunning !== bRunning) return aRunning ? -1 : 1;
    return b.modified.localeCompare(a.modified);
  }), [runningSessionIds, subagents]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSubagents = normalizedQuery
    ? sortedSubagents.filter((session) => {
        const relation = session.relation?.kind === "subagent" ? session.relation : null;
        return [relation?.description, relation?.profile, session.name, session.firstMessage]
          .some((value) => value?.toLowerCase().includes(normalizedQuery));
      })
    : sortedSubagents;
  const runByChild = useMemo(() => {
    const map = new Map<string, PiSubagentRun>();
    for (const run of runs) if (run.childSessionId) map.set(run.childSessionId, run);
    return map;
  }, [runs]);
  // A run the bridge has not attached yet owns no session file, so the family cannot show it.
  const pendingRuns = useMemo(() => runs.filter((run) => !run.childSessionId), [runs]);
  const runningCount = subagents.filter((session) => runningSessionIds.has(session.id)).length;

  return (
    <div
      role="listbox"
      aria-label={t("agentSwitcher.title")}
      className="agent-session-panel"
    >
      <div>
        <div className="agent-session-header">
          <strong className="agent-session-title">{t("agentSwitcher.title")}</strong>
          <span className="agent-session-count">
            {t("agentSwitcher.count", { count: subagents.length })}
          </span>
          {runningCount > 0 && (
            <span className="agent-session-running-count">
              {t("agentSwitcher.runningCount", { count: runningCount })}
            </span>
          )}
        </div>
        {subagents.length > 8 && (
          <div className="agent-session-search">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("agentSwitcher.search")}
              aria-label={t("agentSwitcher.search")}
              className="agent-session-search-input"
            />
          </div>
        )}
        <div className="agent-session-list">
          <AgentRow
            session={rootSession}
            main
            selected={rootSession.id === selectedSessionId}
            running={runningSessionIds.has(rootSession.id)}
            onSelect={() => onSelectSession(rootSession)}
          />
          {visibleSubagents.map((session) => (
            <AgentRow
              key={session.id}
              session={session}
              selected={session.id === selectedSessionId}
              running={runningSessionIds.has(session.id)}
              run={runByChild.get(session.id)}
              onSelect={() => onSelectSession(session)}
            />
          ))}
          {pendingRuns.map((run) => (
            <button
              key={run.runId}
              type="button"
              disabled
              data-testid="agent-pending-run"
              title={t("piSubagents.sessionPending")}
              className="agent-session-pending-row"
            >
              <span className="agent-session-pending-icon">
                <StatusIcon status="starting" />
              </span>
              <span className="agent-session-pending-title">
                {run.description || run.profile}
              </span>
              <span className="agent-session-pending-note">
                {t("piSubagents.sessionPending")}
              </span>
            </button>
          ))}
          {visibleSubagents.length === 0 && pendingRuns.length === 0 && (
            <div className="agent-session-empty">
              {t("agentSwitcher.noMatches")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
