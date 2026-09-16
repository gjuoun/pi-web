/**
 * Pure model for the session tab strip.
 *
 * A tab is an open session. This module holds no React state and no storage: AppShell owns the
 * live TabSet, `lib/ui-state.ts` persists it, and every transition here is a pure function so the
 * behaviour can be tested without a browser.
 *
 * Ordering: tabs keep insertion order. Closing the active tab activates its right neighbour, or the
 * left one when it was last; the cap drops the oldest tab that is not active, so the tab you are
 * looking at is never the one evicted.
 */

/** Upper bound on open tabs. Restoring a larger saved set trims to this. */
export const MAX_TABS = 20;

/** Bumped when the persisted shape changes; `restoreTabs` refuses any other version. */
export const TAB_SET_VERSION = 1;

export interface SessionTab {
  sessionId: string;
  /** Project identity (`SessionInfo.projectKey`) so a tab can be grouped or labelled without a lookup. */
  projectKey: string;
  /** Display label, normally the session name; refreshed from the session list when it changes. */
  title: string;
}

export interface TabSet {
  tabs: SessionTab[];
  activeId: string | null;
}

export interface PersistedTabSet {
  version: number;
  tabs: SessionTab[];
  activeId: string | null;
}

export function emptyTabSet(): TabSet {
  return { tabs: [], activeId: null };
}

/** Add a tab, or focus it when that session is already open. Never duplicates a sessionId. */
export function openTab(set: TabSet, tab: SessionTab): TabSet {
  if (!tab.sessionId) return set;
  const existing = set.tabs.findIndex((entry) => entry.sessionId === tab.sessionId);
  if (existing !== -1) {
    const tabs = set.tabs.slice();
    tabs[existing] = { ...tabs[existing], ...tab };
    return { tabs, activeId: tab.sessionId };
  }

  const tabs = [...set.tabs, tab];
  if (tabs.length > MAX_TABS) {
    const dropAt = tabs.findIndex((entry) => entry.sessionId !== tab.sessionId);
    if (dropAt !== -1) tabs.splice(dropAt, 1);
  }
  return { tabs, activeId: tab.sessionId };
}

/** Close a tab, activating its right neighbour (or the left one when it was last). */
export function closeTab(set: TabSet, sessionId: string): TabSet {
  const index = set.tabs.findIndex((entry) => entry.sessionId === sessionId);
  if (index === -1) return set;
  const tabs = set.tabs.filter((entry) => entry.sessionId !== sessionId);
  if (set.activeId !== sessionId) return { tabs, activeId: set.activeId };
  if (tabs.length === 0) return { tabs, activeId: null };
  return { tabs, activeId: tabs[Math.min(index, tabs.length - 1)].sessionId };
}

/** Focus an open tab. An unknown id is a no-op and returns the same object. */
export function selectTab(set: TabSet, sessionId: string): TabSet {
  if (!set.tabs.some((entry) => entry.sessionId === sessionId)) return set;
  if (set.activeId === sessionId) return set;
  return { ...set, activeId: sessionId };
}

/** Move `delta` tabs through the strip, wrapping at both ends. An empty strip stays empty. */
export function cycleTab(set: TabSet, delta: number): TabSet {
  if (set.tabs.length === 0) return set;
  const current = set.tabs.findIndex((entry) => entry.sessionId === set.activeId);
  const base = current === -1 ? 0 : current;
  const next = (((base + delta) % set.tabs.length) + set.tabs.length) % set.tabs.length;
  return { ...set, activeId: set.tabs[next].sessionId };
}

export function serializeTabs(set: TabSet): PersistedTabSet {
  return {
    version: TAB_SET_VERSION,
    tabs: set.tabs.map((entry) => ({ ...entry })),
    activeId: set.activeId,
  };
}

/**
 * Structurally parse a persisted tab set into a TabSet without checking session ids. Callers that
 * know which sessions still exist should prefer `restoreTabs`.
 */
export function parseTabSet(raw: unknown): TabSet {
  const payload = typeof raw === "string" ? parseJson(raw) : raw;
  if (!isRecord(payload) || payload.version !== TAB_SET_VERSION || !Array.isArray(payload.tabs)) {
    return emptyTabSet();
  }

  const tabs: SessionTab[] = [];
  for (const entry of payload.tabs) {
    if (tabs.length === MAX_TABS) break;
    if (!isRecord(entry)) continue;
    const sessionId = entry.sessionId;
    if (typeof sessionId !== "string" || !sessionId) continue;
    if (tabs.some((tab) => tab.sessionId === sessionId)) continue;
    tabs.push({
      sessionId,
      projectKey: typeof entry.projectKey === "string" ? entry.projectKey : "",
      title: typeof entry.title === "string" && entry.title ? entry.title : sessionId,
    });
  }

  const remembered = typeof payload.activeId === "string" ? payload.activeId : null;
  const activeId =
    remembered && tabs.some((tab) => tab.sessionId === remembered)
      ? remembered
      : (tabs[0]?.sessionId ?? null);

  return { tabs, activeId };
}

/**
 * Rebuild a tab set from persisted data, keeping only sessions the server still has. Accepts a JSON
 * string or an already-parsed value; anything malformed, of another version, or filled with unknown
 * ids degrades to an empty set rather than throwing.
 */
export function restoreTabs(raw: unknown, validSessionIds: readonly string[]): TabSet {
  const parsed = parseTabSet(raw);
  const valid = new Set(validSessionIds);
  const tabs = parsed.tabs.filter((tab) => valid.has(tab.sessionId));
  const activeId =
    parsed.activeId && tabs.some((tab) => tab.sessionId === parsed.activeId)
      ? parsed.activeId
      : (tabs[0]?.sessionId ?? null);
  return { tabs, activeId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
