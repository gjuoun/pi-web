import { readdir, realpath, stat } from "fs/promises";
import { homedir } from "os";
import path from "path";

export interface BrowsableDirectory {
  name: string;
  path: string;
}

export function shouldShowWindowsDrivePicker(
  directory?: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === "win32" && !directory;
}

export function getBrowseStartDirectory(directory?: string): string {
  return directory || homedir();
}

export function getWindowsDriveCandidates(): BrowsableDirectory[] {
  return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => ({
    name: `${letter}:`,
    path: `${letter}:\\`,
  }));
}

export async function listWindowsDrives(): Promise<BrowsableDirectory[]> {
  const candidates = await Promise.all(getWindowsDriveCandidates().map(async (drive) => {
    try {
      const driveStat = await stat(drive.path);
      return driveStat.isDirectory() ? drive : null;
    } catch {
      return null;
    }
  }));

  return candidates.filter((drive): drive is BrowsableDirectory => drive !== null);
}

export function normalizeDirectory(directory: string): string {
  if (directory === "~") return homedir();
  if (directory.startsWith("~/")) return path.resolve(homedir(), directory.slice(2));
  return path.resolve(directory);
}

export function getParentDirectory(directory: string): string | null {
  const pathApi = /^[a-zA-Z]:[\\/]/.test(directory) || directory.startsWith("\\\\")
    ? path.win32
    : path.posix;
  const normalized = pathApi.normalize(directory);
  const parent = pathApi.dirname(normalized);
  return parent === normalized ? null : parent;
}

export async function resolveDirectory(directory: string): Promise<string> {
  return realpath(normalizeDirectory(directory));
}

export async function listDirectories(directory: string): Promise<BrowsableDirectory[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  // 忽略损坏、不可访问或不指向目录的符号链接。
  const candidates = await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory()) {
      return { name: entry.name, path: path.join(directory, entry.name) };
    }
    if (!entry.isSymbolicLink()) return null;

    try {
      const entryPath = path.join(directory, entry.name);
      const realEntryPath = await realpath(entryPath);
      const entryStat = await stat(realEntryPath);
      if (!entryStat.isDirectory()) return null;
      return { name: entry.name, path: entryPath };
    } catch {
      return null;
    }
  }));

  return candidates
    .filter((entry): entry is BrowsableDirectory => entry !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Deepest existing ancestor of a typed path plus its prefix-matched children. */
export interface DirectoryCompletion {
  /** Deepest existing directory the typed path falls under (null if nothing exists). */
  base: string | null;
  /** First unmatched path segment used to filter `matches` ("" = list all children). */
  fragment: string;
  /** Child directories of `base` whose name starts with `fragment`, sorted and capped. */
  matches: BrowsableDirectory[];
}

function pathApiFor(candidate: string): typeof path.posix | typeof path.win32 {
  return /^[a-zA-Z]:[\\/]/.test(candidate) || candidate.startsWith("\\\\")
    ? path.win32
    : path.posix;
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Complete a partially typed directory path. Never throws for a path that does
 * not exist yet: it walks up to the deepest existing ancestor and reports the
 * children that match the first unmatched segment, so typing `/a/b/c` against
 * an existing `/a` yields the `b*` children of `/a`.
 */
export async function completeDirectories(input: string, limit = 20): Promise<DirectoryCompletion> {
  const empty: DirectoryCompletion = { base: null, fragment: "", matches: [] };
  const trimmed = input.trim();
  if (!trimmed) return empty;

  const normalized = normalizeDirectory(trimmed);
  const pathApi = pathApiFor(normalized);

  let base: string;
  let fragment: string;
  if (await isDirectory(normalized)) {
    base = normalized;
    fragment = "";
  } else {
    base = pathApi.dirname(normalized);
    fragment = pathApi.basename(normalized);
    while (!(await isDirectory(base))) {
      const parent = pathApi.dirname(base);
      if (parent === base) return empty;
      fragment = pathApi.basename(base);
      base = parent;
    }
  }

  let resolvedBase: string;
  try {
    resolvedBase = await realpath(base);
  } catch {
    resolvedBase = base;
  }

  const entries = await listDirectories(resolvedBase);
  const stem = fragment.toLowerCase();
  // The cap belongs to a filtered result. With no fragment the user has typed a
  // directory, which is the browse case: return every child, exactly like
  // /api/cwd/browse. Capping there showed only the alphabetically first N entries
  // (every dot-directory) instead of the directory's actual contents.
  const matches = stem
    ? entries.filter((entry) => entry.name.toLowerCase().includes(stem)).slice(0, Math.max(1, limit))
    : entries;

  return { base: resolvedBase, fragment, matches };
}
