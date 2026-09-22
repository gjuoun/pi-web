import type { SessionFamily } from "./session-family";

export type DateBucketLabel = "Today" | "Yesterday" | "Previous 7 Days" | "Older";

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Partitions families into Today/Yesterday/Previous 7 Days/Older buckets by
 * `family.latestModified`, preserving each bucket's existing latest-first order.
 * Pure function: takes `nowMs` explicitly instead of reading the clock.
 */
export function bucketFamilies(
  families: SessionFamily[],
  nowMs: number,
): { label: DateBucketLabel; families: SessionFamily[] }[] {
  const todayStart = startOfDay(nowMs);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const previous7Start = todayStart - 7 * 24 * 60 * 60 * 1000;

  const today: SessionFamily[] = [];
  const yesterday: SessionFamily[] = [];
  const previous7Days: SessionFamily[] = [];
  const older: SessionFamily[] = [];

  for (const family of families) {
    const modifiedMs = new Date(family.latestModified).getTime();
    if (modifiedMs >= todayStart) today.push(family);
    else if (modifiedMs >= yesterdayStart) yesterday.push(family);
    else if (modifiedMs >= previous7Start) previous7Days.push(family);
    else older.push(family);
  }

  return [
    { label: "Today" as const, families: today },
    { label: "Yesterday" as const, families: yesterday },
    { label: "Previous 7 Days" as const, families: previous7Days },
    { label: "Older" as const, families: older },
  ].filter((bucket) => bucket.families.length > 0);
}
