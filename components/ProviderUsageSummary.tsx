"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { isProviderUsageId } from "@/lib/provider-usage-ids";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

type UsageBucket = {
  id: string;
  label: string;
  groupLabel?: string;
  used?: number;
  remaining?: number;
  limit?: number;
  unit: "percent" | "currency" | "count";
  currency?: string;
  windowMinutes?: number;
  resetsAt?: number;
  period?: string;
};

type UsageMetric = { id: string; label: string; value: number | string; unit?: string; currency?: string };
type UsageReport = { capturedAt: number; buckets: UsageBucket[]; metrics: UsageMetric[]; notes?: string[] };
type UsageResponse = { providerId: string; status: "ready" | "auth-unavailable" | "query-failed"; report?: UsageReport; message?: string };

const STORAGE_PREFIX = "pi-web:provider-usage:";

export function ProviderUsageSummary({ providerId, enabled }: { providerId: string; enabled: boolean }) {
  if (!isProviderUsageId(providerId)) return null;
  return <ProviderUsageContent providerId={providerId} enabled={enabled} />;
}

function ProviderUsageContent({ providerId, enabled }: { providerId: string; enabled: boolean }) {
  const [snapshot, setSnapshot] = useState<UsageResponse | null>(null);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshDone, setRefreshDone] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setRefreshDone(false);
    setSnapshot(null);
    try {
      const cached = localStorage.getItem(`${STORAGE_PREFIX}${providerId}`);
      if (cached) {
        const parsed = JSON.parse(cached) as UsageResponse;
        if (parsed?.status === "ready" && parsed.report && Array.isArray(parsed.report.buckets) && Array.isArray(parsed.report.metrics)) {
          setSnapshot(parsed);
        }
      }
    } catch {
      try { localStorage.removeItem(`${STORAGE_PREFIX}${providerId}`); } catch {}
    }
    setError(null);
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [providerId]);

  const query = useCallback(async () => {
    setQuerying(true);
    setError(null);
    try {
      const response = await fetch("/api/provider-usage/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      const result = await response.json() as UsageResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      if (result.status === "ready") {
        setSnapshot(result);
        try { localStorage.setItem(`${STORAGE_PREFIX}${providerId}`, JSON.stringify(result)); } catch {}
        setRefreshDone(true);
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => setRefreshDone(false), 2000);
      } else {
        setError(result.message ?? t("providerUsage.queryFailed"));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("providerUsage.queryFailed"));
    } finally {
      setQuerying(false);
    }
  }, [providerId, t]);

  const report = snapshot?.status === "ready" ? snapshot.report : undefined;
  return (
    <section className="flex flex-col gap-2.5 pt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] leading-[1.35] font-semibold text-foreground">{t("providerUsage.usage")}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={query}
          disabled={!enabled || querying}
          title={t(querying ? "providerUsage.refreshing" : "providerUsage.refresh")}
          aria-label={t(querying ? "providerUsage.refreshing" : "providerUsage.refresh")}
          className={refreshDone ? "text-success" : "text-muted-foreground"}
        >
          {refreshDone ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={querying ? "animate-spin" : undefined} aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          )}
        </Button>
        {report && <span className="text-[11px] whitespace-nowrap text-muted-foreground">{t("providerUsage.updated", { time: formatUpdated(report.capturedAt) })}</span>}
      </div>

      {!report && !error && <span className="text-xs text-muted-foreground">{t("providerUsage.notQueried")}</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
      {report && (
        <div className="grid w-full max-w-full min-w-0 grid-cols-[180px_minmax(0,1fr)] items-baseline gap-x-3.5 gap-y-2 text-xs sm:w-[min(100%,420px)]">
          {report.buckets.map((bucket) => (
            <div key={bucket.id} className="contents">
              <span className="overflow-hidden font-mono text-ellipsis whitespace-nowrap text-muted-foreground">{bucket.groupLabel ? `${bucket.groupLabel} / ${bucket.label}` : bucket.label}</span>
              {bucket.unit === "percent" && bucket.remaining !== undefined ? (
                <div className="flex min-w-0 items-center gap-2">
                  <Progress value={bucket.remaining} className="h-1.5 min-w-0 flex-1" />
                  <Badge variant="secondary" className="font-mono whitespace-nowrap">{formatBucket(bucket, t("providerUsage.available"))}</Badge>
                </div>
              ) : (
                <span className="overflow-hidden font-mono text-ellipsis whitespace-nowrap text-foreground">{formatBucket(bucket, t("providerUsage.available"))}</span>
              )}
            </div>
          ))}
          {report.metrics.map((metric) => (
            <div key={metric.id} className="contents">
              <span className="overflow-hidden font-mono text-ellipsis whitespace-nowrap text-muted-foreground">{metric.label}</span>
              <span className="overflow-hidden font-mono text-ellipsis whitespace-nowrap text-foreground">{formatMetric(metric)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatBucket(bucket: UsageBucket, availableLabel: string): string {
  if (bucket.unit === "percent" && bucket.remaining !== undefined) {
    const reset = bucket.resetsAt ? ` / ${formatReset(bucket.resetsAt)}` : "";
    return `${Math.round(bucket.remaining)}%${reset}`;
  }
  if (bucket.unit === "currency") return `${bucket.currency === "CNY" ? "CNY " : "$"}${formatAmount(bucket.remaining ?? bucket.limit)}`;
  if (bucket.remaining !== undefined && bucket.limit !== undefined) return `${formatAmount(bucket.remaining)} / ${formatAmount(bucket.limit)}`;
  return bucket.period ?? availableLabel;
}

function formatMetric(metric: UsageMetric): string {
  if (metric.unit === "currency") return `${metric.currency === "CNY" ? "CNY " : "$"}${metric.value}`;
  return String(metric.value);
}

function formatAmount(value: number | undefined): string {
  return value === undefined ? "-" : Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatReset(seconds: number): string {
  return new Date(seconds * 1_000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatUpdated(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
