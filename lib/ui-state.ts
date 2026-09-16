/**
 * Browser-local UI layout state: which sessions are open as tabs, which projects the user has
 * explicitly expanded or collapsed, and the local pin/archive marks.
 *
 * Nothing here is server state — session files stay the source of truth for content, and a session
 * that disappears from the server simply drops out of the tab set on the next load
 * (`resolveTabs`). The whole payload is versioned: an older or malformed blob degrades to defaults
 * instead of throwing, the same way `lib/file-explorer-state.ts` and `components/terminal-tab-state.ts`
 * treat their own keys.
 */

import {
  MAX_TABS,
  TAB_SET_VERSION,
  emptyTabSet,
  parseTabSet,
  restoreTabs,
  serializeTabs,
  type SessionTab,
  type TabSet,
} from "./session-tabs";

export const UI_STATE_KEY = "pi-web:ui-state";

/** Bumped when the persisted shape changes; any other version is discarded on load. */
export const UI_STATE_VERSION = 1;

export type ProjectOverride = "expanded" | "collapsed";

export interface UiState {
  version: number;
  /** Open session tabs, in strip order. */
  tabs: TabSet;
  /** Explicit user choices only; a project with no entry is open. */
  projectOverrides: Record<string, ProjectOverride>;
  pinned: string[];
  archived: string[];
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultUiState(): UiState {
  return {
    version: UI_STATE_VERSION,
    tabs: emptyTabSet(),
    projectOverrides: {},
    pinned: [],
    archived: [],
  };
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadUiState(storage: StorageLike | null = getBrowserStorage()): UiState {
  if (!storage) return defaultUiState();
  let raw: string | null;
  try {
    raw = storage.getItem(UI_STATE_KEY);
  } catch {
    return defaultUiState();
  }
  if (!raw) return defaultUiState();

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return defaultUiState();
  }
  if (!isRecord(payload) || payload.version !== UI_STATE_VERSION) return defaultUiState();

  return {
    version: UI_STATE_VERSION,
    tabs: parseTabSet(payload.tabs),
    projectOverrides: parseOverrides(payload.projectOverrides),
    pinned: parseIdList(payload.pinned),
    archived: parseIdList(payload.archived),
  };
}

export function saveUiState(state: UiState, storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(
      UI_STATE_KEY,
      JSON.stringify({
        version: UI_STATE_VERSION,
        tabs: serializeTabs(state.tabs),
        projectOverrides: state.projectOverrides,
        pinned: state.pinned,
        archived: state.archived,
      }),
    );
  } catch {
    // Persistence is best-effort; private mode and storage quotas must not break the sidebar.
  }
}

/**
 * Whether a project's sessions are shown. Every project is open by default — hiding sessions behind a
 * default is the behaviour this redesign removes — so only an explicit collapse closes one. The choice
 * is remembered per project; activity drives the header badge, never visibility.
 */
export function projectExpanded(state: UiState, projectKey: string): boolean {
  return state.projectOverrides[projectKey] !== "collapsed";
}

export function setProjectExpanded(state: UiState, projectKey: string, expanded: boolean): UiState {
  if (!projectKey) return state;
  return {
    ...state,
    projectOverrides: { ...state.projectOverrides, [projectKey]: expanded ? "expanded" : "collapsed" },
  };
}

export function togglePinned(state: UiState, sessionId: string): UiState {
  return { ...state, pinned: toggleId(state.pinned, sessionId) };
}

export function toggleArchived(state: UiState, sessionId: string): UiState {
  return { ...state, archived: toggleId(state.archived, sessionId) };
}

export function isPinned(state: UiState, sessionId: string): boolean {
  return state.pinned.includes(sessionId);
}

export function isArchived(state: UiState, sessionId: string): boolean {
  return state.archived.includes(sessionId);
}

/**
 * The tab set to render: persisted tabs intersected with the sessions the server actually has, so a
 * deleted session cannot leave a dead tab behind.
 */
export function resolveTabs(state: UiState, validSessionIds: readonly string[]): TabSet {
  return restoreTabs(serializeTabs(state.tabs), validSessionIds);
}

/** Build a tab record from a session list entry, keeping the label in sync with the session name. */
export function tabForSession(session: { id: string; name?: string; firstMessage?: string; projectKey?: string; projectRoot?: string; cwd?: string }): SessionTab {
  const label = session.name?.trim() || session.firstMessage?.trim() || session.id;
  return {
    sessionId: session.id,
    projectKey: session.projectKey ?? session.projectRoot ?? session.cwd ?? "",
    title: label.length > 120 ? `${label.slice(0, 119)}…` : label,
  };
}

function toggleId(list: string[], id: string): string[] {
  if (!id) return list;
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
}

function parseIdList(value: unknown, limit = Number.MAX_SAFE_INTEGER): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (out.length === limit) break;
    if (typeof entry !== "string" || !entry) continue;
    if (out.includes(entry)) continue;
    out.push(entry);
  }
  return out;
}

function parseOverrides(value: unknown): Record<string, ProjectOverride> {
  if (!isRecord(value)) return {};
  const out: Record<string, ProjectOverride> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!key) continue;
    if (entry === "expanded" || entry === "collapsed") out[key] = entry;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
