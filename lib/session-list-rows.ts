/**
 * Row model for the all-projects sidebar.
 *
 * The sidebar renders one flat, virtualized list, so project grouping has to be expressed as rows
 * rather than nesting: a `project-header` row followed by that project's session rows. Keeping it a
 * pure function means the grouping, ordering, filtering and rollup can be tested without a browser,
 * and `components/SessionSidebar.tsx` only has to turn rows into pixels.
 *
 * Ordering rules, in priority order:
 *   1. projects by most recent activity (`getRecentProjects`, the same helper the project picker uses)
 *   2. the standalone bucket last, so sessions with no resolvable project never displace real ones
 *   3. pinned sessions first inside their project, then recency — each half stays newest-first
 */

import { getProjectActivity, getRecentProjects } from "./project-groups";
import { listSessionFamilies } from "./session-family";
import { workspaceKeyOf } from "./workspace-memory";
import type { SessionInfo } from "./types";

/** Bucket for sessions that resolve to no project root at all (dangling cwd, no path recorded). */
export const STANDALONE_PROJECT_KEY = "standalone";

export interface ProjectHeaderRow {
  kind: "project-header";
  projectKey: string;
  /** Project root path used for display and filesystem operations. */
  root: string;
  /** Short label — the last path segment, or `standalone`. */
  label: string;
  /** Every visible session in the project, subagents included. */
  count: number;
  running: number;
  unread: number;
  expanded: boolean;
}

export interface SessionRow {
  kind: "session";
  session: SessionInfo;
  projectKey: string;
  /** 0 for a family root; reserved for showing subagents inline later. */
  depth: number;
  pinned: boolean;
  archived: boolean;
  /** Subagent descendants collapsed behind this row, matching today's family rendering. */
  subagentCount: number;
}

export type SessionListRow = ProjectHeaderRow | SessionRow;

export interface BuildRowsInput {
  sessions: readonly SessionInfo[];
  runningSessionIds: ReadonlySet<string>;
  unreadSessionIds: ReadonlySet<string>;
  /** Project keys the user (or the activity default) has opened. */
  expandedProjects: ReadonlySet<string>;
  pinnedSessionIds?: ReadonlySet<string>;
  archivedSessionIds?: ReadonlySet<string>;
  /** Case-insensitive substring match over the session name, first message, id and cwd. */
  query?: string;
  /** Archived sessions stay hidden unless this is set. */
  includeArchived?: boolean;
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

export function buildSessionListRows(input: BuildRowsInput): SessionListRow[] {
  const pinned = input.pinnedSessionIds ?? EMPTY_IDS;
  const archived = input.archivedSessionIds ?? EMPTY_IDS;
  const query = input.query?.trim().toLowerCase() ?? "";

  const visible = input.sessions.filter((session) => {
    if (!input.includeArchived && archived.has(session.id)) return false;
    return query === "" || matchesQuery(session, query);
  });

  const activity = getProjectActivity(visible, input.runningSessionIds, input.unreadSessionIds);

  const grouped = new Map<string, SessionInfo[]>();
  const standalone: SessionInfo[] = [];
  for (const session of visible) {
    const key = workspaceKeyOf(session);
    if (!key) {
      standalone.push(session);
      continue;
    }
    const list = grouped.get(key);
    if (list) list.push(session);
    else grouped.set(key, [session]);
  }

  const rows: SessionListRow[] = [];
  const groups: { key: string; root: string; sessions: SessionInfo[] }[] = [];
  for (const project of getRecentProjects(visible)) {
    const sessions = grouped.get(project.key);
    if (sessions) groups.push({ key: project.key, root: project.root, sessions });
  }
  if (standalone.length > 0) {
    groups.push({ key: STANDALONE_PROJECT_KEY, root: "", sessions: standalone });
  }

  for (const group of groups) {
    const counts = activity.get(group.key);
    rows.push({
      kind: "project-header",
      projectKey: group.key,
      root: group.root,
      label: projectLabel(group.root),
      count: group.sessions.length,
      running: counts?.running ?? 0,
      unread: counts?.unread ?? 0,
      expanded: input.expandedProjects.has(group.key),
    });

    if (!input.expandedProjects.has(group.key)) continue;

    const families = listSessionFamilies(group.sessions);
    const ordered = [
      ...families.filter((family) => pinned.has(family.root.id)),
      ...families.filter((family) => !pinned.has(family.root.id)),
    ];
    for (const family of ordered) {
      rows.push({
        kind: "session",
        session: family.root,
        projectKey: group.key,
        depth: 0,
        pinned: pinned.has(family.root.id),
        archived: archived.has(family.root.id),
        subagentCount: family.subagents.length,
      });
    }
  }

  return rows;
}

/** Activity rollup shown on a project's header row. */
export function projectActivityOf(
  rows: readonly SessionListRow[],
  projectKey: string,
): { running: number; unread: number } {
  for (const row of rows) {
    if (row.kind === "project-header" && row.projectKey === projectKey) {
      return { running: row.running, unread: row.unread };
    }
  }
  return { running: 0, unread: 0 };
}

/** Short display label for a project root: the last path segment, or `standalone`. */
export function projectLabel(root: string): string {
  const segments = root.split(/[\\/]+/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : STANDALONE_PROJECT_KEY;
}

function matchesQuery(session: SessionInfo, query: string): boolean {
  return [session.name, session.firstMessage, session.id, session.cwd]
    .some((value) => typeof value === "string" && value.toLowerCase().includes(query));
}
