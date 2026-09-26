"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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

function statusClass(status: SubagentSessionStatus): string {
  if (status === "running" || status === "starting") return "text-primary";
  if (status === "completed") return "text-success";
  if (status === "failed") return "text-destructive";
  if (status === "aborted") return "text-warning";
  return "text-muted-foreground";
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
      className={cn(
        "grid min-h-14 w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-[9px] border-0 border-b border-border px-3 py-[7px] text-left text-foreground",
        selected ? "border-l-2 border-l-primary bg-accent" : "border-l-2 border-l-transparent bg-transparent hover:bg-accent",
      )}
    >
      <span className={cn("grid h-7 w-7 place-items-center", main ? "text-muted-foreground" : "text-primary")}>
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
      <span className="min-w-0">
        <span className={cn("block overflow-hidden text-ellipsis whitespace-nowrap text-xs", selected ? "font-semibold" : "font-medium")} title={primary}>
          {primary}
        </span>
        <span className="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted-foreground" title={secondary}>
          {relation?.engine === "pi-subagents" && (
            // Origin tag: without it a package run reads exactly like one of Pi Web's own children.
            <Badge
              data-testid="agent-engine-tag"
              variant="outline"
              className="mr-[5px] h-3.5 rounded px-1 align-[1px] text-[10px] leading-[14px] text-primary"
            >
              {t("agentSwitcher.enginePackage")}
            </Badge>
          )}
          {secondary}
        </span>
      </span>
      <span className={cn("flex items-center gap-1.5 text-[11px] whitespace-nowrap", main && !running ? "text-muted-foreground" : statusClass(status))}>
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
      className="overflow-hidden rounded-b-md border-x border-b border-border bg-sidebar shadow-[0_10px_28px_rgba(0,0,0,0.10)]"
    >
      <div>
        <div className="flex min-h-11 items-center gap-2 border-b border-border px-3 py-[7px]">
          <strong className="text-xs font-semibold">{t("agentSwitcher.title")}</strong>
          <span className="text-[11px] text-muted-foreground">
            {t("agentSwitcher.count", { count: subagents.length })}
          </span>
          {runningCount > 0 && (
            <span className="ml-auto text-[11px] text-primary">
              {t("agentSwitcher.runningCount", { count: runningCount })}
            </span>
          )}
        </div>
        {subagents.length > 8 && (
          <div className="border-b border-border p-2">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("agentSwitcher.search")}
              aria-label={t("agentSwitcher.search")}
              className="text-xs"
            />
          </div>
        )}
        <div className="max-h-[min(58dvh,480px)] overflow-y-auto">
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
              className="grid min-h-11 w-full cursor-default grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-[9px] border-0 border-b border-border border-l-2 border-l-transparent bg-transparent px-3 py-[7px] text-left text-muted-foreground"
            >
              <span className="grid w-7 place-items-center text-primary">
                <StatusIcon status="starting" />
              </span>
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs">
                {run.description || run.profile}
              </span>
              <span className="text-[11px] whitespace-nowrap text-muted-foreground">
                {t("piSubagents.sessionPending")}
              </span>
            </button>
          ))}
          {visibleSubagents.length === 0 && pendingRuns.length === 0 && (
            <div className="px-3 py-[22px] text-center text-xs text-muted-foreground">
              {t("agentSwitcher.noMatches")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
