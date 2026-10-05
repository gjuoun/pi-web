"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadRecentDirectories } from "@/lib/recent-directories";

interface DirectoryEntry {
  name: string;
  path: string;
}

interface BrowseResponse {
  path?: string;
  parentPath?: string | null;
  directories?: DirectoryEntry[];
  drives?: DirectoryEntry[];
  /** Whether /api/files may list this directory too (explorer preview gate). */
  allowed?: boolean;
  error?: string;
}

/** Rows a filtered field may show at once — the list below is the only surface. */
const FILTER_LIMIT = 10;

/** Recent directories offered above the folder rows. */
const RECENT_ROWS = 5;

/**
 * Best-effort basename for a recent path's label. Same documented limitation as
 * `projectBasename` in SessionSidebar: the browser does not apply OS path rules.
 */
function basenameOf(directory: string): string {
  const trimmed = directory.replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || trimmed;
}

async function loadDirectories(directory?: string): Promise<BrowseResponse> {
  const query = directory ? `?path=${encodeURIComponent(directory)}` : "";
  const response = await fetch(`/api/cwd/browse${query}`);
  const data = await response.json() as BrowseResponse;
  if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

interface CompletionResponse {
  base?: string | null;
  fragment?: string;
  matches?: DirectoryEntry[];
  allowed?: boolean;
}

async function loadCompletions(query: string, signal: AbortSignal): Promise<CompletionResponse | null> {
  const response = await fetch(
    `/api/cwd/complete?q=${encodeURIComponent(query)}&limit=${FILTER_LIMIT}`,
    { signal },
  );
  if (!response.ok) return null;
  return await response.json() as CompletionResponse;
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M1.5 3h4l1.5 2h7.5v7.5h-13z" />
    </svg>
  );
}

function DriveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 9h12" />
      <circle cx="11.5" cy="11" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function isWindowsDriveRoot(directory: string): boolean {
  return /^[a-zA-Z]:[\\/]?$/.test(directory);
}

interface Breadcrumb {
  label: string;
  path: string;
}

/** A trailing separator does not make a different directory. */
function withoutTrailingSeparator(directory: string): string {
  const trimmed = directory.replace(/[\\/]+$/, "");
  return trimmed === "" ? directory : trimmed;
}

/**
 * Split a directory into clickable ancestor chips. The browser does not apply OS
 * path rules, so this follows the same best-effort convention as `basenameOf`.
 */
function breadcrumbs(directory: string): Breadcrumb[] {
  if (!directory) return [];
  const windows = /^[a-zA-Z]:[\\/]/.test(directory) || directory.startsWith("\\\\");
  const separator = windows ? "\\" : "/";
  const parts = directory.split(/[\\/]/).filter(Boolean);
  const crumbs: Breadcrumb[] = [];
  let accumulated = "";
  if (windows && parts.length > 0) {
    accumulated = parts.shift() as string;
    crumbs.push({ label: accumulated, path: accumulated + separator });
  } else if (directory.startsWith("/")) {
    accumulated = "/";
    crumbs.push({ label: "/", path: "/" });
  }
  for (const part of parts) {
    accumulated = accumulated === "/" || accumulated.endsWith(separator) ? accumulated + part : accumulated + separator + part;
    crumbs.push({ label: part, path: accumulated });
  }
  return crumbs;
}

interface Props {
  onCancel: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
  busy?: boolean;
  error?: string | null;
  /** Called with the directory currently browsed, so the explorer can follow. */
  onPreviewPath?: (path: string | null) => void;
}

interface BodyProps {
  currentPath: string;
  parentDirectory: string | null;
  pathInput: string;
  /** The folder rows to render: the browse children, or the filtered matches while typing. */
  directories: DirectoryEntry[];
  /** Recent directories, rendered as a labelled group above the folder rows. */
  recents?: DirectoryEntry[];
  drives: DirectoryEntry[] | null;
  loadError: string | null;
  loading: boolean;
  busy: boolean;
  error?: string | null;
  /** True while the typed path drives the list; changes the empty-state copy. */
  filtering?: boolean;
  highlightedIndex?: number;
  onHighlight?: (index: number) => void;
  /** "type" shows the path field; "browse" shows the current path as chips. */
  mode?: "type" | "browse";
  /** Chips to render: the current path in browse mode, the resolved ancestor while typing. */
  breadcrumb?: Breadcrumb[];
  onToggleMode?: () => void;
  onBreadcrumbNavigate?: (path: string) => void;
  onPathInputChange: (value: string) => void;
  onPathSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNavigateUp: () => void;
  onNavigate: (path: string) => void;
  onCancel: () => void;
  onSelect: () => void;
  onPathKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/** Pure, portal-free body — this is what unit tests render, since Dialog content is SSR-invisible. */
export function DirectoryPickerBody({
  currentPath,
  parentDirectory,
  pathInput,
  directories,
  recents = [],
  drives,
  loadError,
  loading,
  busy,
  error,
  filtering = false,
  highlightedIndex = -1,
  onHighlight,
  mode = "type",
  breadcrumb = [],
  onToggleMode,
  onBreadcrumbNavigate,
  onPathInputChange,
  onPathSubmit,
  onNavigateUp,
  onNavigate,
  onCancel,
  onSelect,
  onPathKeyDown,
}: BodyProps) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const hasUncommittedPath = pathInput.trim() !== currentPath;
  const canSelect = Boolean(currentPath) && !hasUncommittedPath && !busy;
  const canNavigateUp = Boolean(parentDirectory) || isWindowsDriveRoot(currentPath);
  const emptyMessage = filtering
    ? t("directoryPicker.noMatchingDirectories")
    : t("directoryPicker.noSubdirectories");

  // Keep the highlighted row in view without stealing focus from the field.
  useEffect(() => {
    if (highlightedIndex < 0) return;
    listRef.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const renderRow = (entry: DirectoryEntry, index: number, kind: "recent" | "folder") => (
    <button
      key={kind + ":" + entry.path}
      type="button"
      data-slot="directory-row"
      data-kind={kind}
      data-highlighted={index === highlightedIndex ? "true" : undefined}
      aria-current={index === highlightedIndex ? "true" : undefined}
      onMouseEnter={() => onHighlight?.(index)}
      onClick={() => onNavigate(entry.path)}
      title={entry.path}
      className={`flex min-h-7.5 w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left font-mono text-xs ${index === highlightedIndex ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
    >
      <FolderIcon />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">{entry.name}</span>
    </button>
  );

  return (
    <div className="flex h-[min(620px,calc(100dvh-16px))] max-h-[calc(100dvh-16px)] flex-col overflow-hidden">
      <form onSubmit={onPathSubmit} className="flex shrink-0 items-center gap-2 border-b py-2.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onNavigateUp}
          disabled={loading || !canNavigateUp}
          title={t("directoryPicker.goToParent")}
          aria-label={t("directoryPicker.goToParent")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m18 15-6-6-6 6" />
          </svg>
        </Button>
        {mode === "browse" ? (
          <div
            data-slot="directory-breadcrumb"
            className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 font-mono text-xs"
          >
            {breadcrumb.map((crumb) => (
              <button
                key={crumb.path}
                type="button"
                onClick={() => onBreadcrumbNavigate?.(crumb.path)}
                title={crumb.path}
                className="rounded-sm px-1 py-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {crumb.label}
              </button>
            ))}
          </div>
        ) : (
          <>
            <label htmlFor="directory-path" className="sr-only">
              {t("directoryPicker.directoryPath")}
            </label>
            <Input
              id="directory-path"
              type="text"
              value={pathInput}
              placeholder="/path/to/project or ~/project"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-controls="directory-picker-list"
              onChange={(event) => onPathInputChange(event.target.value)}
              onKeyDown={onPathKeyDown}
              className="min-w-0 flex-1 font-mono text-xs"
            />
          </>
        )}
        {mode === "type" && (
          <Button type="submit" variant="outline" disabled={loading || !pathInput.trim()}>
            {t("directoryPicker.go")}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          data-slot="directory-mode-toggle"
          aria-pressed={mode === "browse"}
          onClick={onToggleMode}
          title={mode === "browse" ? t("directoryPicker.typePath") : t("directoryPicker.browsePath")}
          aria-label={mode === "browse" ? t("directoryPicker.typePath") : t("directoryPicker.browsePath")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6h16" />
            <path d="M4 12h10" />
            <path d="M4 18h7" />
          </svg>
        </Button>
      </form>

      {mode === "type" && breadcrumb.length > 0 && (
        <div
          data-slot="directory-breadcrumb"
          className="flex shrink-0 flex-wrap items-center gap-0.5 border-b px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
        >
          {breadcrumb.map((crumb) => (
            <button
              key={crumb.path}
              type="button"
              onClick={() => onBreadcrumbNavigate?.(crumb.path)}
              title={crumb.path}
              className="rounded-sm px-1 py-0.5 hover:bg-accent hover:text-accent-foreground"
            >
              {crumb.label}
            </button>
          ))}
        </div>
      )}

      <div id="directory-picker-list" data-slot="directory-picker-list" ref={listRef} className="min-h-0 flex-1 overflow-auto px-2.5 py-2">
        {/* Recents come from local storage, so they render before any fetch lands. */}
        {recents.length > 0 && (
          <div data-slot="directory-recents">
            <div className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("directoryPicker.recent")}
            </div>
            {recents.map((entry, index) => renderRow(entry, index, "recent"))}
          </div>
        )}
        {loading ? (
          <div className="p-2 text-xs text-muted-foreground">{t("directoryPicker.loadingDirectories")}</div>
        ) : drives !== null ? (
          drives.length > 0 ? (
            drives.map((drive) => (
              <button
                key={drive.path}
                type="button"
                onClick={() => onNavigate(drive.path)}
                title={drive.path}
                className="flex min-h-8.5 w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left font-mono text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <DriveIcon />
                <span>{drive.name}</span>
              </button>
            ))
          ) : (
            <div className="p-2 text-xs text-muted-foreground">{t("directoryPicker.noDrives")}</div>
          )
        ) : directories.length > 0 ? (
          directories.map((entry, index) => renderRow(entry, recents.length + index, "folder"))
        ) : (
          <div className="p-2 text-xs text-muted-foreground">{emptyMessage}</div>
        )}
        {(loadError || error) && <div className="p-2 text-xs text-destructive">{loadError ?? error}</div>}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2.5 border-t py-2.5 pb-[max(10px,env(safe-area-inset-bottom))]">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          {t("i18n.cancel")}
        </Button>
        <Button
          type="button"
          onClick={onSelect}
          disabled={!canSelect}
          title={hasUncommittedPath ? t("directoryPicker.openBeforeSelecting") : t("directoryPicker.selectCurrentDirectory")}
        >
          {busy ? t("i18n.checking") : t("directoryPicker.selectThisFolder")}
        </Button>
      </div>
    </div>
  );
}

export function DirectoryPicker({ onCancel, onSelect, initialPath, busy = false, error, onPreviewPath }: Props) {
  const { t } = useI18n();
  const [currentPath, setCurrentPath] = useState("");
  const [parentDirectory, setParentDirectory] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState(initialPath ?? "");
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [drives, setDrives] = useState<DirectoryEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<DirectoryEntry[] | null>(null);
  const [fragment, setFragment] = useState("");
  const [completionBase, setCompletionBase] = useState<string | null>(null);
  const [mode, setMode] = useState<"type" | "browse">("type");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // Read once per open: the picker mounts fresh for each visit.
  const [recentPaths] = useState<string[]>(() => loadRecentDirectories());
  // Navigation rewrites pathInput; skip the completion fetch for the directory we just opened.
  const skipCompletionRef = useRef(false);
  // Latest field value, so an in-flight browse can tell whether the user has typed.
  const pathInputRef = useRef(pathInput);
  useEffect(() => {
    pathInputRef.current = pathInput;
  }, [pathInput]);

  const filtering = pathInput.trim() !== currentPath;
  const folderRows = filtering ? (matches ?? []) : directories;
  // The directory whose children the list is showing right now.
  const displayedBase = filtering ? completionBase : currentPath;
  // Recents lead the list, filtered by the same fragment and never duplicated by
  // a folder row that is already visible - nor by the directory the list itself
  // is showing, where the row would be a no-op.
  const visibleRecents = (filtering && fragment
      ? recentPaths.filter((path) => basenameOf(path).toLowerCase().includes(fragment.toLowerCase()))
      : recentPaths
    )
    .slice(0, RECENT_ROWS)
    .filter((path) => path !== displayedBase && !folderRows.some((row) => row.path === path))
    .map((path) => ({ name: basenameOf(path), path }));
  const rows = [...visibleRecents, ...folderRows];
  // Type mode shows the resolved ancestor only when it differs from what was typed -
  // and a trailing separator is not a difference, or the chips would just echo the
  // field. Browse mode shows the committed path as chips.
  const resolvedBreadcrumb = filtering
    && completionBase !== null
    && withoutTrailingSeparator(completionBase) !== withoutTrailingSeparator(pathInput.trim())
    ? breadcrumbs(completionBase)
    : [];

  const navigateTo = useCallback(async (directory?: string) => {
    const startedWith = pathInputRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await loadDirectories(directory);
      const nextPath = data.path ?? directory ?? "/";
      // Adopt the resolved path only when the user has not typed since the
      // navigation started - otherwise the browse would clobber their input and
      // merge the two strings. A typed field keeps driving the list instead.
      const adoptPath = pathInputRef.current === startedWith;
      skipCompletionRef.current = adoptPath;
      if (adoptPath) setPathInput(nextPath);
      setCurrentPath(nextPath);
      setParentDirectory(data.parentPath ?? null);
      setDirectories(data.directories ?? []);
      setDrives(data.drives ?? null);
      setHighlightedIndex((data.directories ?? []).length > 0 ? 0 : -1);
      // Follow the picker in the explorer, but only where /api/files can list.
      onPreviewPath?.(data.allowed ? nextPath : null);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [onPreviewPath]);

  useEffect(() => {
    void navigateTo(initialPath || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typing drives the same list the folder rows live in; 250 ms of quiet turns a
  // keystroke burst into one request.
  useEffect(() => {
    if (skipCompletionRef.current) {
      skipCompletionRef.current = false;
      return;
    }
    if (!filtering) {
      setMatches(null);
      setFragment("");
      setCompletionBase(null);
      return;
    }
    const query = pathInput.trim();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      loadCompletions(query, controller.signal)
        .then((data) => {
          if (!data) return;
          const next = data.matches ?? [];
          setMatches(next);
          setFragment(data.fragment ?? "");
          setCompletionBase(data.base ?? null);
          setHighlightedIndex(next.length > 0 ? 0 : -1);
          if (data.allowed && data.base) onPreviewPath?.(data.base);
          else onPreviewPath?.(null);
        })
        .catch(() => {
          // Aborted or failed: keep the rows already on screen.
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filtering, pathInput, onPreviewPath]);

  const handlePathKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (rows.length === 0) return;
      event.preventDefault();
      setHighlightedIndex((index) => (
        event.key === "ArrowDown"
          ? (index + 1) % rows.length
          : (index - 1 + rows.length) % rows.length
      ));
      return;
    }
    if (event.key === "Tab" && highlightedIndex >= 0 && rows[highlightedIndex]) {
      event.preventDefault();
      void navigateTo(rows[highlightedIndex].path);
    }
  };

  const handlePathSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = pathInput.trim();
    if (candidate) void navigateTo(candidate);
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <DialogContent
        className="flex max-h-[calc(100dvh-16px)] w-[520px] max-w-[calc(100vw-16px)] flex-col gap-0 p-0"
        aria-label={t("directoryPicker.selectDirectory")}
      >
        <DialogHeader className="shrink-0 border-b px-4.5 py-3">
          <DialogTitle>{t("directoryPicker.selectDirectory")}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 px-4">
          <DirectoryPickerBody
            currentPath={currentPath}
            parentDirectory={parentDirectory}
            pathInput={pathInput}
            directories={folderRows}
            recents={visibleRecents}
            drives={drives}
            loadError={loadError}
            loading={filtering ? matches === null : loading}
            busy={busy}
            error={error}
            filtering={filtering}
            mode={mode}
            breadcrumb={mode === "browse" ? breadcrumbs(currentPath) : resolvedBreadcrumb}
            onToggleMode={() => setMode((current) => (current === "type" ? "browse" : "type"))}
            onBreadcrumbNavigate={(path) => {
              setMode("type");
              void navigateTo(path);
            }}
            highlightedIndex={highlightedIndex}
            onHighlight={setHighlightedIndex}
            onPathInputChange={(value) => {
              setPathInput(value);
              setLoadError(null);
            }}
            onPathSubmit={handlePathSubmit}
            onPathKeyDown={handlePathKeyDown}
            onNavigateUp={() => void navigateTo(parentDirectory ?? undefined)}
            onNavigate={(path) => void navigateTo(path)}
            onCancel={onCancel}
            onSelect={() => onSelect(currentPath)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
