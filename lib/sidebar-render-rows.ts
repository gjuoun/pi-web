import type { SessionFamily } from "./session-family";
import { groupFamiliesByProject, type RecentProject } from "./project-groups";

export const SIDEBAR_SESSION_ROW_HEIGHT = 40;
export const SIDEBAR_PROJECT_HEADER_ROW_HEIGHT = 32;

export type SidebarRenderRow =
  | { kind: "session"; height: typeof SIDEBAR_SESSION_ROW_HEIGHT; family: SessionFamily }
  | {
      kind: "project-header";
      height: typeof SIDEBAR_PROJECT_HEADER_ROW_HEIGHT;
      project: RecentProject;
      count: number;
      collapsed: boolean;
      projectKey: string;
    };

/**
 * Flattens recency-sorted unpinned families into a heterogeneous row array:
 * one project-header row per project (clustered by `groupFamiliesByProject`,
 * ordered by each project's own latest activity), followed by that project's
 * session rows only when it's in `expandedProjectKeys` — collapsed groups
 * contribute just their header row, so the virtualized list's total height
 * already reflects fold state.
 */
export function buildSidebarRenderRows(
  unpinnedFamilies: readonly SessionFamily[],
  expandedProjectKeys: ReadonlySet<string>,
): SidebarRenderRow[] {
  const groups = groupFamiliesByProject(unpinnedFamilies);
  const rows: SidebarRenderRow[] = [];

  for (const group of groups) {
    const expanded = expandedProjectKeys.has(group.project.key);
    rows.push({
      kind: "project-header",
      height: SIDEBAR_PROJECT_HEADER_ROW_HEIGHT,
      project: group.project,
      count: group.families.length,
      collapsed: !expanded,
      projectKey: group.project.key,
    });
    if (expanded) {
      for (const family of group.families) {
        rows.push({ kind: "session", height: SIDEBAR_SESSION_ROW_HEIGHT, family });
      }
    }
  }

  return rows;
}

/** Cumulative row-height offsets: `prefixSums[i]` is the top of row `i`, `prefixSums[length]` is the total height. */
export function buildRowPrefixSums(rowHeights: readonly number[]): number[] {
  const prefixSums = new Array<number>(rowHeights.length + 1);
  prefixSums[0] = 0;
  for (let i = 0; i < rowHeights.length; i++) prefixSums[i + 1] = prefixSums[i] + rowHeights[i];
  return prefixSums;
}

/** Largest row index whose top offset is <= `offset` (binary search over the prefix sums). */
function findRowAtOffset(prefixSums: readonly number[], offset: number): number {
  const count = prefixSums.length - 1;
  if (count <= 0) return 0;
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (prefixSums[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Windowed row indices for a heterogeneous-height list, using a prefix-sum
 * binary search instead of dividing by a constant row height. Mirrors the
 * previous `getSessionListIndices` contract: an overscan pixel margin above
 * and below the viewport, plus a focused row kept mounted even when scrolled
 * out of range (so an inline rename/input never gets unmounted mid-edit).
 */
export function getSidebarRowIndices(
  rowHeights: readonly number[],
  scrollTop: number,
  viewportHeight: number,
  focusedIndex = -1,
): number[] {
  const count = rowHeights.length;
  if (count === 0) return [];

  const prefixSums = buildRowPrefixSums(rowHeights);
  const overscanPx = 8 * SIDEBAR_SESSION_ROW_HEIGHT;
  const startOffset = Math.max(0, scrollTop - overscanPx);
  const endOffset = scrollTop + (viewportHeight || 600) + overscanPx;

  const start = findRowAtOffset(prefixSums, startOffset);
  const end = Math.min(count, findRowAtOffset(prefixSums, endOffset) + 1);

  const indices = Array.from({ length: end - start }, (_, offset) => start + offset);
  if (focusedIndex >= 0 && focusedIndex < start) indices.unshift(focusedIndex);
  if (focusedIndex >= end && focusedIndex < count) indices.push(focusedIndex);
  return indices;
}
