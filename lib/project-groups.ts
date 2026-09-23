import type { SessionFamily } from "./session-family";
import type { SessionInfo } from "./types";
import { workspaceKeyOf } from "./workspace-memory";

export interface RecentProject {
  /** Stable server-provided identity used for comparison and Map keys. */
  key: string;
  /** Original project path used for display and filesystem operations. */
  root: string;
}

/** Projects sorted by most recent activity and deduplicated by stable key. */
export function getRecentProjects(sessions: readonly SessionInfo[]): RecentProject[] {
  const latestByProject = new Map<string, { root: string; modified: string }>();
  for (const session of sessions) {
    const root = session.projectRoot ?? session.cwd;
    if (!root) continue;
    const key = workspaceKeyOf(session);
    const previous = latestByProject.get(key);
    if (!previous || session.modified > previous.modified) {
      latestByProject.set(key, { root, modified: session.modified });
    }
  }
  return [...latestByProject.entries()]
    .sort((a, b) => b[1].modified.localeCompare(a[1].modified))
    .map(([key, { root }]) => ({ key, root }));
}

export function getProjectActivity(
  sessions: readonly SessionInfo[],
  runningSessionIds: ReadonlySet<string>,
  unreadSessionIds: ReadonlySet<string>,
): Map<string, { running: number; unread: number }> {
  const counts = new Map<string, { running: number; unread: number }>();
  for (const session of sessions) {
    const key = workspaceKeyOf(session);
    if (!key) continue;
    let entry = counts.get(key);
    if (!entry) {
      entry = { running: 0, unread: 0 };
      counts.set(key, entry);
    }
    if (runningSessionIds.has(session.id)) entry.running++;
    if (unreadSessionIds.has(session.id)) entry.unread++;
  }
  return counts;
}

export interface ProjectFamilyGroup {
  project: RecentProject;
  families: SessionFamily[];
}

/**
 * Clusters families by project identity, preserving each cluster's internal
 * order, then sorts clusters by each cluster's own max `latestModified`.
 */
export function groupFamiliesByProject(
  families: readonly SessionFamily[],
): ProjectFamilyGroup[] {
  const groups = new Map<string, ProjectFamilyGroup>();

  for (const family of families) {
    const key = workspaceKeyOf(family.root);
    let group = groups.get(key);
    if (!group) {
      const root = family.root.projectRoot ?? family.root.cwd;
      group = { project: { key, root }, families: [] };
      groups.set(key, group);
    }
    group.families.push(family);
  }

  return [...groups.values()].sort((a, b) => {
    const aLatest = Math.max(...a.families.map((f) => Date.parse(f.latestModified)));
    const bLatest = Math.max(...b.families.map((f) => Date.parse(f.latestModified)));
    return bLatest - aLatest;
  });
}
