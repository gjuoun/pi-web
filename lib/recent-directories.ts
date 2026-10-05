/**
 * Recent directories for the directory picker.
 *
 * The picker offers the folders a user actually returns to, so picking one does not
 * require walking the tree again. Best-effort localStorage memory, shaped like
 * `lib/file-explorer-state.ts` and `lib/workspace-memory.ts`: the storage handle is
 * injectable, every failure degrades to an empty list, and nothing here throws.
 */

export const RECENT_DIRECTORIES_LIMIT = 8;

const STORAGE_KEY = "pi-web:recent-directories";

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

/** Most-recent-first recent directories; empty when unavailable or unreadable. */
export function loadRecentDirectories(
  storage: StorageLike | null = getBrowserStorage(),
): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
      .slice(0, RECENT_DIRECTORIES_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Move `path` to the front of the recent list (deduped, capped) and return the new list.
 * A blank path is a no-op so the caller can push unconditionally.
 */
export function pushRecentDirectory(
  path: string,
  storage: StorageLike | null = getBrowserStorage(),
): string[] {
  const trimmed = path.trim();
  if (!storage || !trimmed) return loadRecentDirectories(storage);
  const next = [
    trimmed,
    ...loadRecentDirectories(storage).filter((entry) => entry !== trimmed),
  ].slice(0, RECENT_DIRECTORIES_LIMIT);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Privacy mode and quota errors must not break the picker.
  }
  return next;
}
