/**
 * Per-project sidebar fold state: which project groups are expanded.
 *
 * Absent entry (or `false`) means collapsed — new projects default to
 * folded, mirroring `lib/workspace-memory.ts`'s storage shape and
 * best-effort localStorage access.
 */

const STORAGE_KEY = "pi-web:sidebar-expanded-projects";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readMap(storage: StorageLike): Record<string, boolean> {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, boolean>
      : {};
  } catch {
    return {};
  }
}

/** The set of project keys currently expanded, empty when storage is unavailable. */
export function getExpandedProjects(
  storage: StorageLike | null = getBrowserStorage(),
): Set<string> {
  if (!storage) return new Set();
  try {
    const map = readMap(storage);
    return new Set(Object.keys(map).filter((key) => map[key] === true));
  } catch {
    return new Set();
  }
}

export function setProjectExpanded(
  projectKey: string,
  expanded: boolean,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    const map = readMap(storage);
    if (expanded) map[projectKey] = true;
    else delete map[projectKey];
    storage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // storage unavailable — fold state is best-effort
  }
}
