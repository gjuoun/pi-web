"use client";

import { useEffect, useLayoutEffect, useState, useCallback, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionInfo } from "@/lib/types";
import { collapseHomePath } from "@/lib/path-display";
import { listSessionFamilies } from "@/lib/session-family";
import { loadExplorerOpen, saveExplorerOpen } from "@/lib/file-explorer-state";
import { dispatchSessionRowContextMenu } from "@/lib/session-row-context-menu";
import { skillExpansionToCommand } from "@/lib/slash-display";
import { getRecentProjects } from "@/lib/project-groups";
import { workspaceKeyOf } from "@/lib/workspace-memory";
import {
  buildSidebarRenderRows,
  buildRowPrefixSums,
  getSidebarRowIndices,
  SIDEBAR_SESSION_ROW_HEIGHT,
  SIDEBAR_PROJECT_HEADER_ROW_HEIGHT,
  type SidebarRenderRow,
} from "@/lib/sidebar-render-rows";
import { getExpandedProjects, setProjectExpanded } from "@/lib/sidebar-expanded-projects";
import { useI18n } from "@/hooks/useI18n";
import { DirectoryPicker } from "./DirectoryPicker";
import { FileExplorer, type FileExplorerHandle } from "./FileExplorer";
import { SessionSearch } from "./SessionSearch";
import { IconButton } from "./IconButton";


declare global {
  interface Window {
    piDesktop?: {
      selectDirectory: () => Promise<string | null>;
    };
  }
}

/**
 * Best-effort basename for a project header/pinned-row label. Known
 * limitation (documented in the JW-148 plan): two different projects that
 * happen to share a basename are not disambiguated here.
 */
function projectBasename(root: string): string {
  const trimmed = root.replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || trimmed;
}

function ToolbarIconButton({
  onClick,
  title,
  disabled,
  active,
  marginRight,
  ariaPressed,
  className,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
  marginRight?: number;
  ariaPressed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <IconButton
      title={title}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ariaPressed}
      active={active}
      size="icon-sm"
      style={marginRight != null ? { marginRight } : undefined}
      className={className}
    >
      {children}
    </IconButton>
  );
}

interface Props {
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo, isRestore?: boolean, entryId?: string, blockIndex?: number) => void;
  onNewSession?: (sessionId: string, cwd: string) => void;
  initialSessionId?: string | null;
  skipInitialProjectSelection?: boolean;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  onSessionDeleted?: (sessionId: string) => void;
  selectedCwd?: string | null;
  onCwdChange?: (
    cwd: string | null,
    projectRoot?: string | null,
    projectKey?: string | null,
  ) => void;
  onOpenFile?: (filePath: string, fileName: string, options?: { sourceSessionId?: string | null; modeHint?: "diff" }) => void;
  onOpenTerminal?: (cwd: string) => void;
  explorerRefreshKey?: number;
  onExplorerRefresh?: () => void;
  onAtMention?: (relativePath: string, isDir: boolean) => void;
  onAtMentions?: (relativePaths: string[]) => void;
  /** Fired when a session that is not currently selected finishes running.
   *  Lets the app play a cross-workspace completion tone. */
  onBackgroundTaskDone?: () => void;
  onRunningSessionIdsChange?: (ids: Set<string>) => void;
  onSessionsChange?: (sessions: SessionInfo[]) => void;
}

interface WorktreeEntry {
  path: string;
  branch: string | null;
  isMain: boolean;
}

interface WorktreeState {
  /** The cwd this data was fetched for — guards against stale responses */
  forCwd: string;
  projectRoot: string;
  /** Stable server-computed identity; never derive OS path semantics here. */
  projectKey: string;
  isGit: boolean;
  /** False when forCwd is a repo subdirectory — the switcher is hidden there
   *  because subdir sessions keep their own project identity */
  isTopLevel: boolean;
  /** Canonical path of the checkout containing forCwd, resolved server-side. */
  currentWorktreePath: string | null;
  worktrees: WorktreeEntry[];
}

interface ProjectSelection {
  root: string;
  key: string;
}

interface ValidatedProject {
  cwd: string;
  root: string;
  key: string;
}

const UNREAD_SESSIONS_STORAGE_KEY = "pi-web:unread-session-ids";
const LAST_CUSTOM_CWD_STORAGE_KEY = "pi-web:last-custom-cwd";
const RUNNING_SESSIONS_POLL_MS = 2500;

function loadLastCustomCwd(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(LAST_CUSTOM_CWD_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveLastCustomCwd(cwd: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_CUSTOM_CWD_STORAGE_KEY, cwd);
  } catch {
    // Persistence is best-effort.
  }
}

function loadUnreadSessionIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(UNREAD_SESSIONS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed.filter((id): id is string => typeof id === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

function saveUnreadSessionIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    if (ids.size === 0) window.localStorage.removeItem(UNREAD_SESSIONS_STORAGE_KEY);
    else window.localStorage.setItem(UNREAD_SESSIONS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore storage quota / privacy-mode errors
  }
}

/**
 * Path label that ellipsizes on the LEFT, keeping the (most relevant) trailing
 * segments visible: "…orkspace/pi-web". Shows as much of the path as fits
 * instead of a fixed number of segments. The rtl container moves the ellipsis
 * to the left edge; the inner plaintext bidi isolation keeps the path itself
 * rendered strictly left-to-right (no punctuation reordering).
 */
function PathLabel({ text, style, className }: { text: string; style?: CSSProperties; className?: string }) {
  return (
    <span
      dir="rtl"
      className={cn("block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left leading-[1.35]", className)}
      style={style}
    >
      <span className="[unicode-bidi:plaintext]">{text}</span>
    </span>
  );
}

const DROPDOWN_ANIMATION_MS = 140;

function AnimatedDropdown({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    let frame: number | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (open) {
      setMounted(true);
      setVisible(false);
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      timeout = setTimeout(() => setMounted(false), DROPDOWN_ANIMATION_MS);
    }

    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (timeout) clearTimeout(timeout);
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "origin-top transition-[opacity,transform] duration-[140ms] ease-in-out",
        open ? "pointer-events-auto" : "pointer-events-none",
        visible ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-[0.96] opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}



export function SessionSidebar({ selectedSessionId, onSelectSession, onNewSession, initialSessionId, skipInitialProjectSelection, onInitialRestoreDone, refreshKey, onSessionDeleted, selectedCwd: selectedCwdProp, onCwdChange, onOpenFile, onOpenTerminal, explorerRefreshKey, onExplorerRefresh, onAtMention, onAtMentions, onBackgroundTaskDone, onRunningSessionIdsChange, onSessionsChange }: Props) {
  const { t } = useI18n();
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [sessionListVersion, setSessionListVersion] = useState<number | null>(null);
  const sessionListVersionRef = useRef<number | null>(null);
  const sessionLoadIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState<string>("");
  const [wtFilter, setWtFilter] = useState("");
  const [customPathOpen, setCustomPathOpen] = useState(false);
  const [customPathValue, setCustomPathValue] = useState(loadLastCustomCwd);
  const [customPathError, setCustomPathError] = useState<string | null>(null);
  const [customPathValidating, setCustomPathValidating] = useState(false);
  const [validatedProject, setValidatedProject] = useState<ValidatedProject | null>(null);
  // Worktree switcher state
  const [worktreeState, setWorktreeState] = useState<WorktreeState | null>(null);
  const [wtDropdownOpen, setWtDropdownOpen] = useState(false);
  const [wtNewOpen, setWtNewOpen] = useState(false);
  const [wtNewBranch, setWtNewBranch] = useState("");
  const [wtError, setWtError] = useState<string | null>(null);
  const [wtBusy, setWtBusy] = useState(false);
  const [wtConfirmRemove, setWtConfirmRemove] = useState<string | null>(null);
  const wtDropdownRef = useRef<HTMLDivElement>(null);
  const wtNewInputRef = useRef<HTMLInputElement>(null);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [explorerKey, setExplorerKey] = useState(0);
  const [explorerUploadBusy, setExplorerUploadBusy] = useState(false);
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState("");
  const sessionSearchActive = sessionSearchOpen && Boolean(sessionSearchQuery.trim());
  const [changesCount, setChangesCount] = useState(0);
  const [changesCollapsed, setChangesCollapsed] = useState(true);
  const [explorerRefreshDone, setExplorerRefreshDone] = useState(false);
  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(() => new Set());
  const [unreadSessionIds, setUnreadSessionIds] = useState<Set<string>>(() => loadUnreadSessionIds());
  // Per-project fold state (Step 3): collapsed by default, persisted in localStorage.
  const [expandedProjectKeys, setExpandedProjectKeys] = useState<Set<string>>(() => getExpandedProjects());
  const toggleProjectExpanded = useCallback((projectKey: string) => {
    setExpandedProjectKeys((current) => {
      const expanded = !current.has(projectKey);
      setProjectExpanded(projectKey, expanded);
      const next = new Set(current);
      if (expanded) next.add(projectKey);
      else next.delete(projectKey);
      return next;
    });
  }, []);
  const previousRunningSessionIdsRef = useRef<Set<string>>(new Set());
  const currentSuppressedCompletionSessionIdsRef = useRef<Set<string>>(new Set());
  const previousSuppressedCompletionSessionIdsRef = useRef<Set<string>>(new Set());
  // Once polling has delivered a snapshot it is the source of truth for
  // running state; late /api/sessions responses must not overwrite it.
  const runningPollAuthoritativeRef = useRef(false);
  const explorerRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileExplorerRef = useRef<FileExplorerHandle>(null);

  // Virtualized session list: only the visible window of rows is mounted.
  const listScrollRef = useRef<HTMLDivElement>(null);
  const [listViewportH, setListViewportH] = useState(0);
  const [listScrollTop, setListScrollTop] = useState(0);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const listScrollRafRef = useRef<number | null>(null);
  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (listScrollRafRef.current != null) return;
    listScrollRafRef.current = requestAnimationFrame(() => {
      listScrollRafRef.current = null;
      setListScrollTop(top);
    });
  }, []);
  useLayoutEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setListViewportH(entry.contentRect.height);
    });
    ro.observe(el);
    setListViewportH(el.clientHeight);
    setListScrollTop(el.scrollTop);
    return () => ro.disconnect();
  }, [sessionSearchActive]);

  const loadSessions = useCallback(async (showLoading = false, force = false) => {
    const loadId = ++sessionLoadIdRef.current;
    try {
      if (showLoading) setLoading(true);
      const base = force ? "/api/sessions?force=1" : "/api/sessions";
      const url = showArchived ? `${base}${force ? "&" : "?"}includeArchived=1` : base;
      const res = await fetch(url, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as {
        sessions: SessionInfo[];
        sessionListVersion: number;
        runningSessionIds?: string[];
        completionNotificationSuppressedSessionIds?: string[];
      };
      if (loadId !== sessionLoadIdRef.current) return;
      sessionListVersionRef.current = data.sessionListVersion;
      setSessionListVersion(data.sessionListVersion);
      setAllSessions(data.sessions);
      // Treat the fetched running set as an initial fallback only. Once the
      // lightweight poll is live, a slow session-list fetch cannot overwrite it.
      if (!runningPollAuthoritativeRef.current) {
        currentSuppressedCompletionSessionIdsRef.current = new Set(
          data.completionNotificationSuppressedSessionIds ?? [],
        );
        setRunningSessionIds(new Set(data.runningSessionIds ?? []));
      }
      // Drop markers for deleted sessions and for subagents, whose completion
      // is intentionally silent even if an older client marked them unread.
      const unreadEligibleIds = new Set(
        data.sessions
          .filter((session) => session.relation?.kind !== "subagent")
          .map((session) => session.id),
      );
      setUnreadSessionIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set([...prev].filter((id) => unreadEligibleIds.has(id)));
        return next.size === prev.size ? prev : next;
      });
      setError(null);
    } catch (e) {
      if (loadId === sessionLoadIdRef.current) setError(String(e));
    } finally {
      if (loadId === sessionLoadIdRef.current) setLoading(false);
    }
  }, [showArchived]);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    const isFirst = !initialLoadDone.current;
    initialLoadDone.current = true;
    loadSessions(isFirst, !isFirst);
  }, [loadSessions, refreshKey]);

  // Browser storage is unavailable during server rendering. Restore the panel
  // preference after hydration so a collapsed explorer stays collapsed on reload.
  useEffect(() => {
    setExplorerOpen(loadExplorerOpen());
  }, []);

  // Persist unread markers so they survive a browser refresh before the user
  // has actually opened the completed session.
  useEffect(() => {
    saveUnreadSessionIds(unreadSessionIds);
  }, [unreadSessionIds]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const schedule = () => {
      clearTimer();
      if (stopped || document.visibilityState !== "visible") return;
      timer = setTimeout(() => void poll(), RUNNING_SESSIONS_POLL_MS);
    };

    const poll = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      const current = new AbortController();
      controller?.abort();
      controller = current;
      try {
        const res = await fetch("/api/agent/running", {
          cache: "no-store",
          signal: current.signal,
        });
        if (!res.ok) return;
        const data = await res.json() as {
          sessionListVersion: number;
          runningSessionIds?: string[];
          completionNotificationSuppressedSessionIds?: string[];
        };
        if (stopped || controller !== current) return;
        runningPollAuthoritativeRef.current = true;
        currentSuppressedCompletionSessionIdsRef.current = new Set(
          data.completionNotificationSuppressedSessionIds ?? [],
        );
        setRunningSessionIds(new Set(data.runningSessionIds ?? []));
        if (data.sessionListVersion !== sessionListVersionRef.current) {
          // Reuse the invalidated cache; forcing a scan would change the version again.
          await loadSessions();
        }
      } catch {
        // Keep the last known state; the next visible-tab poll retries.
      } finally {
        if (controller === current) controller = null;
        schedule();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void poll();
        return;
      }
      clearTimer();
      controller?.abort();
      controller = null;
    };

    void poll();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      clearTimer();
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadSessions]);

  useEffect(() => {
    onRunningSessionIdsChange?.(runningSessionIds);
  }, [onRunningSessionIdsChange, runningSessionIds]);

  useEffect(() => {
    onSessionsChange?.(allSessions);
  }, [allSessions, onSessionsChange]);

  useEffect(() => {
    const previous = previousRunningSessionIdsRef.current;
    const completedInBackground = [...previous].filter((id) => !runningSessionIds.has(id) && id !== selectedSessionId);
    const knownSubagentIds = new Set(
      allSessions
        .filter((session) => session.relation?.kind === "subagent")
        .map((session) => session.id),
    );
    const completedWithNotifications = completedInBackground.filter(
      (id) => !previousSuppressedCompletionSessionIdsRef.current.has(id) && !knownSubagentIds.has(id),
    );
    const newlyRunning = [...runningSessionIds].filter((id) => !previous.has(id));

    if (completedWithNotifications.length > 0 || newlyRunning.length > 0) {
      setUnreadSessionIds((prev) => {
        const next = new Set(prev);
        runningSessionIds.forEach((id) => next.delete(id));
        completedWithNotifications.forEach((id) => next.add(id));
        return next;
      });
    }
    const hasUnlistedRunningSession = newlyRunning.some(
      (id) => !allSessions.some((session) => session.id === id),
    );
    if (completedInBackground.length > 0 || hasUnlistedRunningSession) {
      loadSessions(false, true);
    }
    if (completedWithNotifications.length > 0) {
      onBackgroundTaskDone?.();
    }

    previousRunningSessionIdsRef.current = runningSessionIds;
    previousSuppressedCompletionSessionIdsRef.current = new Set(
      [...runningSessionIds].filter(
        (id) => currentSuppressedCompletionSessionIdsRef.current.has(id) || knownSubagentIds.has(id),
      ),
    );
  }, [runningSessionIds, selectedSessionId, allSessions, loadSessions, onBackgroundTaskDone]);

  useEffect(() => {
    if (!selectedSessionId) return;
    setUnreadSessionIds((prev) => {
      if (!prev.has(selectedSessionId)) return prev;
      const next = new Set(prev);
      next.delete(selectedSessionId);
      return next;
    });
  }, [selectedSessionId]);

  useEffect(() => {
    if (explorerRefreshKey !== undefined) setExplorerKey((k) => k + 1);
  }, [explorerRefreshKey]);

  useEffect(() => {
    fetch("/api/home").then((r) => r.json()).then((d: { home?: string }) => {
      if (d.home) setHomeDir(d.home);
    }).catch(() => {});
  }, []);

  const restoredRef = useRef(false);

  const projectSelection = useCallback((root: string, key: string): ProjectSelection => ({
    root,
    key,
  }), []);

  /** Resolve both display root and stable identity from server-provided data. */
  const projectFor = useCallback((cwd: string | null): ProjectSelection | null => {
    if (!cwd) return null;
    // /api/cwd/validate resolves identity before a custom path becomes active,
    // preventing one render with a raw path key from looking like a switch.
    if (validatedProject?.cwd === cwd) {
      return projectSelection(validatedProject.root, validatedProject.key);
    }
    if (worktreeState && worktreeState.forCwd === cwd) {
      return projectSelection(worktreeState.projectRoot, worktreeState.projectKey);
    }
    // Any path in the loaded worktree list belongs to that project — covers
    // worktrees without sessions, so switching to them keeps the row mounted.
    if (worktreeState?.worktrees.some((w) => w.path === cwd)) {
      return projectSelection(worktreeState.projectRoot, worktreeState.projectKey);
    }
    const match = allSessions.find((session) => (
      session.cwd === cwd || (session.projectRoot ?? session.cwd) === cwd
    ));
    return match
      ? projectSelection(match.projectRoot ?? match.cwd, workspaceKeyOf(match))
      : projectSelection(cwd, cwd);
  }, [validatedProject, worktreeState, allSessions, projectSelection]);

  // A worktree/session refresh can hydrate the stable key without changing
  // cwd, so notify when either changes. The parent treats same-cwd key changes
  // as identity hydration rather than a workspace switch.
  const lastNotifiedProjectRef = useRef<{ cwd: string | null; key: string | null } | null>(null);
  useEffect(() => {
    const project = projectFor(selectedCwd);
    const previous = lastNotifiedProjectRef.current;
    if (previous?.cwd === selectedCwd && previous.key === (project?.key ?? null)) return;
    lastNotifiedProjectRef.current = { cwd: selectedCwd, key: project?.key ?? null };
    onCwdChange?.(
      selectedCwd,
      project?.root ?? null,
      project?.key ?? null,
    );
  }, [selectedCwd, onCwdChange, projectFor]);

  // Sync the worktree switcher to the selected session's cwd. Sessions of all
  // worktrees in a project share one list, so clicking a session from another
  // worktree should move the effective cwd there. Only fires when the prop
  // value changes, so a manual switcher change is not snapped back.
  const lastSyncedCwdPropRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedCwdProp && selectedCwdProp !== lastSyncedCwdPropRef.current) {
      lastSyncedCwdPropRef.current = selectedCwdProp;
      setSelectedCwd(selectedCwdProp);
    }
  }, [selectedCwdProp]);

  // Load worktrees for the current effective cwd
  const [wtRefreshKey, setWtRefreshKey] = useState(0);
  useLayoutEffect(() => {
    if (!selectedCwd) {
      setWorktreeState(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/worktrees?cwd=${encodeURIComponent(selectedCwd)}`)
      .then((r) => r.json())
      .then((d: { projectRoot?: string; projectKey?: string; isGit?: boolean; isTopLevel?: boolean; currentWorktreePath?: string | null; worktrees?: WorktreeEntry[]; error?: string }) => {
        if (cancelled) return;
        if (d.error || !d.projectRoot) {
          setWorktreeState(null);
          return;
        }
        setWorktreeState({
          forCwd: selectedCwd,
          projectRoot: d.projectRoot,
          projectKey: d.projectKey ?? d.projectRoot,
          isGit: d.isGit ?? false,
          isTopLevel: d.isTopLevel ?? false,
          currentWorktreePath: d.currentWorktreePath ?? null,
          worktrees: d.worktrees ?? [],
        });
      })
      .catch(() => {
        if (!cancelled) setWorktreeState(null);
      });
    return () => { cancelled = true; };
  }, [selectedCwd, wtRefreshKey, refreshKey]);

  // Auto-select cwd and restore session from URL on first load
  useEffect(() => {
    if (allSessions.length === 0 || skipInitialProjectSelection) return;

    if (selectedCwd === null) {
      // If restoring a session, set cwd to match that session
      if (initialSessionId && !restoredRef.current) {
        restoredRef.current = true;
        const target = allSessions.find((s) => s.id === initialSessionId);
        if (target) {
          setSelectedCwd(target.cwd);
          onSelectSession(target, true);
          return;
        }
        // Session not found — notify parent so it can show the placeholder
        onInitialRestoreDone?.();
      }
      const projects = getRecentProjects(allSessions);
      if (projects.length > 0) setSelectedCwd(projects[0].root);
    }
  }, [allSessions, selectedCwd, initialSessionId, skipInitialProjectSelection, onSelectSession, onInitialRestoreDone]);

  // Prefer an exact UI selection while a refetch is in flight. Once the
  // response catches up, the server-resolved path handles Windows case and
  // separator differences without teaching the browser OS path semantics.
  const currentWorktree = worktreeState
    ? worktreeState.worktrees.find((worktree) => worktree.path === selectedCwd)
      ?? (worktreeState.forCwd === selectedCwd && worktreeState.currentWorktreePath
        ? worktreeState.worktrees.find((worktree) => worktree.path === worktreeState.currentWorktreePath)
        : undefined)
      ?? worktreeState.worktrees.find((worktree) => worktree.isMain)
    : undefined;
  const currentWorktreePath = currentWorktree?.path ?? null;

  const commitCustomPath = useCallback(async (candidate?: string) => {
    const path = (candidate ?? customPathValue).trim();
    if (!path || customPathValidating) return;

    setCustomPathValidating(true);
    setCustomPathError(null);
    try {
      const res = await fetch("/api/cwd/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: path }),
      });
      const data = await res.json().catch(() => ({})) as {
        cwd?: string;
        projectRoot?: string;
        projectKey?: string;
        error?: string;
      };
      if (!res.ok || data.error || !data.cwd || !data.projectRoot || !data.projectKey) {
        setCustomPathError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setValidatedProject({
        cwd: data.cwd,
        root: data.projectRoot,
        key: data.projectKey,
      });
      saveLastCustomCwd(data.cwd);
      setCustomPathValue(data.cwd);
      setSelectedCwd(data.cwd);
      setCustomPathOpen(false);
    } catch (e) {
      setCustomPathError(e instanceof Error ? e.message : String(e));
    } finally {
      setCustomPathValidating(false);
    }
  }, [customPathValue, customPathValidating]);

  const handleCreateWorktree = useCallback(async () => {
    const branch = wtNewBranch.trim();
    if (!branch || wtBusy || !worktreeState) return;
    setWtBusy(true);
    setWtError(null);
    try {
      const res = await fetch("/api/worktrees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: worktreeState.projectRoot, branch }),
      });
      const data = await res.json().catch(() => ({})) as { path?: string; error?: string };
      if (!res.ok || data.error || !data.path) {
        setWtError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setWtNewOpen(false);
      setWtNewBranch("");
      setWtDropdownOpen(false);
      // Optimistically register the new worktree so projectFor() resolves
      // it to the main repo before the refetch lands (keeps AppShell from
      // treating the new cwd as a different project).
      setWorktreeState((prev) => prev ? {
        ...prev,
        forCwd: data.path!,
        currentWorktreePath: data.path!,
        worktrees: [...prev.worktrees, { path: data.path!, branch, isMain: false }],
      } : prev);
      setSelectedCwd(data.path);
      setWtRefreshKey((k) => k + 1);
    } catch (e) {
      setWtError(e instanceof Error ? e.message : String(e));
    } finally {
      setWtBusy(false);
    }
  }, [wtNewBranch, wtBusy, worktreeState]);

  const handleRemoveWorktree = useCallback(async (path: string, force: boolean) => {
    if (!worktreeState || wtBusy) return;
    setWtBusy(true);
    setWtError(null);
    try {
      const res = await fetch("/api/worktrees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: worktreeState.projectRoot, path, force }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; dirty?: boolean };
      if (!res.ok) {
        if (data.dirty && !force) {
          // Dirty worktree — ask the user to confirm a force removal
          setWtConfirmRemove(path);
          return;
        }
        setWtError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setWtConfirmRemove(null);
      if (currentWorktreePath === path) setSelectedCwd(worktreeState.projectRoot);
      setWtRefreshKey((k) => k + 1);
    } catch (e) {
      setWtError(e instanceof Error ? e.message : String(e));
    } finally {
      setWtBusy(false);
    }
  }, [worktreeState, wtBusy, currentWorktreePath]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wtDropdownRef.current && !wtDropdownRef.current.contains(e.target as Node)) {
        setWtDropdownOpen(false);
        setWtNewOpen(false);
        setWtNewBranch("");
        setWtError(null);
        setWtConfirmRemove(null);
        setWtFilter("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Clicking a session moves the effective cwd to that session's worktree.
  // Done on the click path (not via the selectedCwd prop sync) so it also
  // works when the prop value won't change — e.g. re-clicking the already
  // open session after manually switching worktrees.
  const handleSelectSessionFromList = useCallback((s: SessionInfo, entryId?: string, blockIndex?: number) => {
    setAllSessions((current) => current.some((session) => session.id === s.id) ? current : [s, ...current]);
    if (s.cwd) setSelectedCwd(s.cwd);
    onSelectSession(s, false, entryId, blockIndex);
  }, [onSelectSession]);

  const newSessionForProject = useCallback((root: string) => {
    // Generate a temporary UUID client-side — no backend call needed.
    // Pi will be spawned lazily when the user sends the first message.
    const tempId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    onNewSession?.(tempId, root);
  }, [onNewSession]);

  // Cold start (decision 7): with no prior selectedCwd, try the "use default
  // cwd" shortcut first (formerly inside the deleted dropdown); only fall
  // back to the directory picker when there is no usable default.
  const handleNewSession = useCallback(() => {
    if (selectedCwd) {
      newSessionForProject(selectedCwd);
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/default-cwd", { method: "POST" });
        const data = await res.json() as { cwd?: string; error?: string };
        if (data.cwd) {
          setSelectedCwd(data.cwd);
          newSessionForProject(data.cwd);
          return;
        }
      } catch {
        // fall through to the picker
      }
      setCustomPathOpen(true);
      setCustomPathError(null);
    })();
  }, [selectedCwd, newSessionForProject]);

  // Locked decision 1: the sidebar always shows every session, no project gate.
  const filteredSessions = allSessions;

  // listSessionFamilies() must run on the FULL filtered set (not a pinned/bucket split)
  // or a subagent whose root falls in a different bucket becomes an orphan.
  const allFamilies = listSessionFamilies(filteredSessions);
  const pinnedFamilies = allFamilies.filter((family) => family.root.pinned === true);
  const unpinnedFamilies = allFamilies.filter((family) => family.root.pinned !== true);

  // "PINNED" is a curated-by-the-user label, not a date grouping, so it stays
  // (decision 5's date-caption removal doesn't touch it).
  const sectionLabelBySessionId = new Map<string, string>();
  if (pinnedFamilies.length > 0) sectionLabelBySessionId.set(pinnedFamilies[0].root.id, t("sidebar.pinnedSection"));

  // Decision 4: pinned rows are never grouped under a project header, so they
  // always carry an inline project label instead.
  const pinnedProjectLabelBySessionId = new Map<string, string>();
  for (const family of pinnedFamilies) {
    const root = family.root.projectRoot ?? family.root.cwd;
    pinnedProjectLabelBySessionId.set(family.root.id, projectBasename(root));
  }

  // Heterogeneous row list: pinned rows stay flat/ungrouped, then unpinned
  // families flatten into dedicated project-header rows (collapsed by
  // default) followed by their sessions when expanded (Step 1/3).
  const renderRows: SidebarRenderRow[] = [
    ...pinnedFamilies.map((family): SidebarRenderRow => ({
      kind: "session",
      height: SIDEBAR_SESSION_ROW_HEIGHT,
      family,
    })),
    ...buildSidebarRenderRows(unpinnedFamilies, expandedProjectKeys),
  ];
  const rowHeights = renderRows.map((row) => row.height);
  const rowPrefixSums = buildRowPrefixSums(rowHeights);
  const focusedRowIndex = renderRows.findIndex(
    (row) => row.kind === "session" && row.family.root.id === focusedSessionId,
  );

  const virtualIndices = getSidebarRowIndices(rowHeights, listScrollTop, listViewportH, focusedRowIndex);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {customPathOpen && (
        <DirectoryPicker
          initialPath={customPathValue}
          busy={customPathValidating}
          error={customPathError}
          onCancel={() => {
            setCustomPathOpen(false);
            setCustomPathError(null);
          }}
          onSelect={(path) => void commitCustomPath(path)}
        />
      )}
      {/* Header */}
      <div className="shrink-0 border-b border-border px-[10px] pb-[10px] pt-3">
        <div className="mb-[10px] flex items-center justify-end">
          <div className="flex gap-1.5">
            <button
              onClick={handleNewSession}
              disabled={!selectedCwd}
              title={selectedCwd ? t("sidebar.newSessionTitle", { path: selectedCwd }) : t("sidebar.selectProject")}
              className={cn(
                "flex h-[32px] shrink-0 items-center justify-center gap-[5px] rounded-[7px] border border-border pl-[10px] pr-3 text-xs font-medium tracking-[-0.01em] transition-colors",
                selectedCwd
                  ? "cursor-pointer bg-accent/60 text-muted-foreground hover:border-primary/35 hover:bg-accent hover:text-primary"
                  : "cursor-not-allowed bg-accent/60 text-muted-foreground/70",
              )}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="6" y1="1" x2="6" y2="11" />
                <line x1="1" y1="6" x2="11" y2="6" />
              </svg>
              {t("sidebar.new")}
            </button>
            <button
              type="button"
              onClick={() => {
                setSessionSearchOpen((open) => !open);
                setWtDropdownOpen(false);
              }}
              title={t("sidebar.toggleSessionSearch")}
              aria-label={t("sidebar.toggleSessionSearch")}
              aria-expanded={sessionSearchOpen}
              aria-controls="session-search-input"
              className={`flex h-[32px] w-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-border hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary ${sessionSearchOpen ? "bg-accent text-primary" : "bg-accent/60 text-muted-foreground"}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              title={t("sidebar.showArchived")}
              aria-label={t("sidebar.showArchived")}
              aria-pressed={showArchived}
              className={`flex h-[32px] w-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-border hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary ${showArchived ? "bg-accent text-primary" : "bg-accent/60 text-muted-foreground"}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="4" rx="1" />
                <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {sessionSearchOpen && (
          <input
            id="session-search-input"
            type="search"
            autoFocus
            value={sessionSearchQuery}
            maxLength={200}
            aria-label={t("sidebar.searchSessions")}
            placeholder={t("sidebar.searchSessions")}
            onChange={(event) => setSessionSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setSessionSearchQuery("");
              }
            }}
            className="mt-[6px] block h-[29px] w-full min-w-0 rounded-[7px] border border-border bg-background px-[10px] text-xs text-foreground focus:outline-2 focus:outline-primary"
          />
        )}

        {/* Worktree list/create/remove panel — trigger lives per-project-header
            (Step 4). Opened by setting selectedCwd to that project's root and
            toggling wtDropdownOpen; no standalone top-of-sidebar trigger. */}
        {!sessionSearchOpen && wtDropdownOpen && worktreeState && (() => {
          const showWtFilter = worktreeState.worktrees.length >= 8;
          const visibleWorktrees = showWtFilter && wtFilter.trim()
            ? worktreeState.worktrees.filter((w) =>
                (w.branch ?? collapseHomePath(w.path, homeDir)).toLowerCase().includes(wtFilter.trim().toLowerCase()))
            : worktreeState.worktrees;
          return (
            <div ref={wtDropdownRef} className="relative mt-1.5">
              <AnimatedDropdown
                open={wtDropdownOpen}
                className="absolute left-0 right-0 top-[calc(100%+4px)] z-[100] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
              >
                  {showWtFilter && (
                    <div className="border-b border-border px-2 py-1.5">
                      <input
                        value={wtFilter}
                        onChange={(e) => setWtFilter(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setWtFilter("");
                            setWtDropdownOpen(false);
                          }
                        }}
                        placeholder={t("sidebar.filterWorktrees")}
                        autoFocus
                        className="box-border w-full rounded-[5px] border border-border bg-background px-2 py-[5px] font-mono text-[11px] text-foreground outline-none"
                      />
                    </div>
                  )}
                  <div className="max-h-[min(40vh,300px)] overflow-y-auto">
                    {visibleWorktrees.map((wt) => {
                      const isCurrent = wt.path === currentWorktreePath;
                      if (wtConfirmRemove === wt.path) {
                        return (
                          <div key={wt.path} className="flex items-center gap-1.5 border-b border-border bg-destructive/[0.06] px-2.5 py-[7px]">
                            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-foreground">
                              {t("sidebar.forceRemoveCheckout")}
                            </span>
                            <button
                              onClick={() => void handleRemoveWorktree(wt.path, true)}
                              disabled={wtBusy}
                              className="shrink-0 cursor-pointer rounded-[5px] border-none bg-destructive px-[9px] py-[3px] text-[11px] font-semibold text-destructive-foreground"
                            >
                              {t("sidebar.force")}
                            </button>
                            <button
                              onClick={() => setWtConfirmRemove(null)}
                              className="shrink-0 cursor-pointer rounded-[5px] border border-border bg-accent/60 px-[9px] py-[3px] text-[11px] text-muted-foreground"
                            >
                              {t("sidebar.cancel")}
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={wt.path}
                          className="flex items-center border-b border-border"
                        >
                          <button
                            onClick={() => {
                              setSelectedCwd(wt.path);
                              setWtDropdownOpen(false);
                              setWtError(null);
                              setWtFilter("");
                            }}
                            title={wt.path}
                            className={cn(
                              "flex min-w-0 flex-1 items-center gap-[7px] border-none bg-background px-2.5 py-2 text-left font-mono text-[11px] cursor-pointer",
                              isCurrent ? "text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {isCurrent ? (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                <polyline points="1.5 5 4 7.5 8.5 2.5" />
                              </svg>
                            ) : (
                              <span className="w-2.5 shrink-0" />
                            )}
                            <PathLabel text={wt.branch ?? collapseHomePath(wt.path, homeDir)} className="flex-1" />
                            {wt.isMain && <span className="shrink-0 text-[10px] text-muted-foreground/70">{t("sidebar.main")}</span>}
                          </button>
                          {!wt.isMain && (
                            <button
                              onClick={() => void handleRemoveWorktree(wt.path, false)}
                              disabled={wtBusy}
                               title={t("sidebar.removeWorktreeTitle", { path: wt.path })}
                              className="mr-1 flex h-7 w-[34px] shrink-0 items-center justify-center rounded-[5px] border-none bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {showWtFilter && visibleWorktrees.length === 0 && wtFilter.trim() && (
                      <div className="px-2.5 py-2 text-[11px] text-muted-foreground/70">{t("sidebar.noMatchingWorktrees")}</div>
                    )}
                  </div>

                  {!wtNewOpen ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setWtNewOpen(true);
                        setWtError(null);
                        setTimeout(() => wtNewInputRef.current?.focus(), 0);
                      }}
                      title={t("sidebar.createWorktreeTitle")}
                      className="flex w-full cursor-pointer items-center gap-[7px] border-none bg-transparent px-2.5 py-2 text-left text-[11px] text-muted-foreground"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" className="shrink-0">
                        <line x1="5" y1="1" x2="5" y2="9" />
                        <line x1="1" y1="5" x2="9" y2="5" />
                      </svg>
                       <span>{t("sidebar.newWorktree")}</span>
                    </button>
                  ) : (
                    <div className="p-1.5">
                      <input
                        ref={wtNewInputRef}
                        value={wtNewBranch}
                        onChange={(e) => {
                          setWtNewBranch(e.target.value);
                          setWtError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleCreateWorktree();
                          }
                          if (e.key === "Escape") {
                            setWtNewOpen(false);
                            setWtNewBranch("");
                            setWtError(null);
                          }
                        }}
                         placeholder={t("sidebar.branchName")}
                        className="box-border w-full rounded-[5px] border border-primary bg-background px-2 py-[5px] font-mono text-[11px] text-foreground outline-none"
                      />
                      <div className="mt-[5px] flex gap-[5px]">
                        <button
                          onClick={() => void handleCreateWorktree()}
                          disabled={wtBusy || !wtNewBranch.trim()}
                          className={cn(
                            "flex-1 rounded-[5px] border-none bg-primary py-1 text-[11px] font-semibold text-primary-foreground",
                            wtBusy || !wtNewBranch.trim() ? "cursor-not-allowed opacity-65" : "cursor-pointer",
                          )}
                        >
                           {wtBusy ? t("sidebar.creating") : t("sidebar.create")}
                        </button>
                        <button
                          onClick={() => { setWtNewOpen(false); setWtNewBranch(""); setWtError(null); }}
                          className="flex-1 cursor-pointer rounded-[5px] border border-border bg-accent/60 py-1 text-[11px] text-muted-foreground"
                        >
                           {t("sidebar.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                  {wtError && (
                    <div className="px-2.5 pb-2 pt-[5px] text-[11px] leading-[1.35] text-destructive [overflow-wrap:anywhere]">
                      {wtError}
                    </div>
                  )}
              </AnimatedDropdown>
            </div>
          );
        })()}
      </div>

      {/* Session list */}
      <SessionSearch open={sessionSearchOpen} query={sessionSearchQuery} refreshKey={sessionListVersion} selectedSessionId={selectedSessionId} onSelectSession={handleSelectSessionFromList}>
      <div
        ref={listScrollRef}
        onScroll={handleListScroll}
        className={cn("min-h-20 overflow-y-auto p-0", explorerOpen && (selectedCwdProp || selectedCwd) ? "flex-1" : "flex-[1_1_auto]")}
      >
        {loading && (
          <div className="px-3.5 py-4 text-xs text-muted-foreground">
            {t("sidebar.loading")}
          </div>
        )}
        {error && (
          <div className="px-3.5 py-3 text-xs text-destructive">
            {error}
          </div>
        )}
        {!loading && !error && renderRows.length === 0 && (
          <div className="px-3.5 py-4 text-xs text-muted-foreground">
            {t("sidebar.noSessions")}
          </div>
        )}
        {renderRows.length > 0 && (
          <div
            className="relative"
            style={{ height: rowPrefixSums[rowPrefixSums.length - 1] }}
          >
            {virtualIndices.map((index) => {
              const row = renderRows[index];
              const top = rowPrefixSums[index];

              if (row.kind === "project-header") {
                return (
                  <div key={`project-header:${row.projectKey}`} className="absolute left-0 right-0" style={{ top }}>
                    <ProjectHeaderRow
                      label={`${projectBasename(row.project.root)} (${row.count})`}
                      collapsed={row.collapsed}
                      onToggleCollapse={() => toggleProjectExpanded(row.projectKey)}
                      onNewSession={() => newSessionForProject(row.project.root)}
                      onToggleWorktrees={() => {
                        setSelectedCwd(row.project.root);
                        setWtDropdownOpen((open) => !open || selectedCwd !== row.project.root);
                      }}
                    />
                  </div>
                );
              }

              const { family } = row;
              const familySessions = [family.root, ...family.subagents];
              const displaySession = family.latestModified === family.root.modified
                ? family.root
                : { ...family.root, modified: family.latestModified };
              // Bubble blur after the input's save handler before unpinning the row.
              return (
                <div
                  key={family.root.id}
                  onFocus={() => setFocusedSessionId(family.root.id)}
                  onBlur={() => setFocusedSessionId(null)}
                  className="absolute left-0 right-0"
                  style={{ top }}
                >
                  <SessionItem
                    session={displaySession}
                    sectionLabel={sectionLabelBySessionId.get(family.root.id)}
                    pinnedProjectLabel={pinnedProjectLabelBySessionId.get(family.root.id)}
                    isSelected={familySessions.some((session) => session.id === selectedSessionId)}
                    isRunning={familySessions.some((session) => runningSessionIds.has(session.id))}
                    isUnread={familySessions.some((session) => unreadSessionIds.has(session.id))}
                    onClick={() => handleSelectSessionFromList(family.root)}
                    onRenamed={loadSessions}
                    onDeleted={(id) => {
                      onSessionDeleted?.(id);
                      loadSessions();
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      </SessionSearch>

      {/* File Explorer section */}
      {(selectedCwdProp || selectedCwd) && (
        <div
          className={cn("flex min-h-0 flex-col overflow-hidden border-t border-border", explorerOpen ? "flex-1" : "flex-[0_0_auto]")}
        >
          <div className="flex shrink-0 items-center">
            <button
              onClick={() => setExplorerOpen((open) => {
                const next = !open;
                saveExplorerOpen(next);
                return next;
              })}
              className="flex flex-1 cursor-pointer items-center gap-1.5 border-none bg-transparent px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground"
            >
              <svg
                width="9" height="9" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                className={cn("shrink-0 transition-transform duration-150", explorerOpen ? "rotate-90" : "")}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              {t("files.explorer")}
            </button>
            {onOpenTerminal && (
              <ToolbarIconButton
                onClick={() => onOpenTerminal(selectedCwd ?? selectedCwdProp!)}
                title={t("terminal.open")}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </ToolbarIconButton>
            )}
            {explorerOpen && changesCount > 0 && (
              <ToolbarIconButton
                onClick={() => setChangesCollapsed((v) => !v)}
                title={t("sidebar.changedFiles", { count: changesCount })}
                ariaPressed={!changesCollapsed}
                active={!changesCollapsed}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M3 12h6" />
                  <path d="M15 12h6" />
                </svg>
              </ToolbarIconButton>
            )}
            {explorerOpen && (
              <ToolbarIconButton
                onClick={() => {
                  setFileSearchOpen((open) => !open);
                }}
                title={t("sidebar.searchFiles")}
                ariaPressed={fileSearchOpen}
                active={fileSearchOpen}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
                </svg>
              </ToolbarIconButton>
            )}
            {explorerOpen && (
              <ToolbarIconButton
                onClick={() => fileExplorerRef.current?.openUploadPicker()}
                disabled={explorerUploadBusy}
                title={t("sidebar.uploadFilesTitle")}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m17 8-5-5-5 5" />
                  <path d="M12 3v12" />
                </svg>
              </ToolbarIconButton>
            )}
            <ToolbarIconButton
              onClick={() => {
                if (onExplorerRefresh) onExplorerRefresh();
                else setExplorerKey((k) => k + 1);
                setExplorerRefreshDone(true);
                if (explorerRefreshTimerRef.current) clearTimeout(explorerRefreshTimerRef.current);
                explorerRefreshTimerRef.current = setTimeout(() => setExplorerRefreshDone(false), 2000);
              }}
              title={t("sidebar.refreshExplorer")}
              marginRight={6}
              className={explorerRefreshDone ? "text-success" : undefined}
            >
              {explorerRefreshDone ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </ToolbarIconButton>
          </div>
          {explorerOpen && (
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              <FileExplorer
                ref={fileExplorerRef}
                cwd={selectedCwd ?? selectedCwdProp!}
                onOpenFile={onOpenFile ?? (() => {})}
                refreshKey={explorerKey}
                onAtMention={onAtMention}
                onAtMentions={onAtMentions}
                onUploadBusyChange={setExplorerUploadBusy}
                changesCollapsed={changesCollapsed}
                onChangesCountChange={setChangesCount}
                fileSearchOpen={fileSearchOpen}
                onFileSearchOpenChange={setFileSearchOpen}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RunningSessionIndicator() {
  const { t } = useI18n();
  return (
    <span
      title={t("sidebar.agentRunning")}
      aria-label={t("sidebar.agentRunning")}
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-primary"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="block">
        <g>
          <path
            d="M21 12a9 9 0 1 1-3.8-7.4"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="0.9s"
            repeatCount="indefinite"
          />
        </g>
      </svg>
    </span>
  );
}

function UnreadSessionIndicator() {
  const { t } = useI18n();
  return (
    <span
      title={t("sidebar.newActivity")}
      aria-label={t("sidebar.newSessionActivity")}
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-primary"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="block">
        <circle cx="7" cy="7" r="2.5" fill="currentColor" />
        <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" opacity="0.32">
          <animate attributeName="r" values="3;6;3" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.32;0;0.32" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>
    </span>
  );
}

function ProjectHeaderRow({
  label,
  collapsed,
  onToggleCollapse,
  onNewSession,
  onToggleWorktrees,
}: {
  label: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNewSession: () => void;
  onToggleWorktrees?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      onClick={onToggleCollapse}
      role="button"
      aria-expanded={!collapsed}
      className="flex cursor-pointer select-none items-center gap-1.5 px-3.5"
      style={{ height: SIDEBAR_PROJECT_HEADER_ROW_HEIGHT }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("shrink-0 text-muted-foreground/70 transition-transform duration-150", collapsed ? "-rotate-90" : "")}
      >
        <polyline points="2 3.5 5 6.5 8 3.5" />
      </svg>
      <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-muted-foreground">
        {label}
      </span>
      {onToggleWorktrees && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleWorktrees(); }}
          title={t("sidebar.worktrees")}
          className="flex h-4 w-4 shrink-0 items-center justify-center border-none bg-transparent p-0 text-muted-foreground/70 cursor-pointer"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onNewSession(); }}
        title={t("sidebar.new")}
        className="flex h-4 w-4 shrink-0 items-center justify-center border-none bg-transparent p-0 text-muted-foreground/70 cursor-pointer"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="6" y1="1" x2="6" y2="11" />
          <line x1="1" y1="6" x2="11" y2="6" />
        </svg>
      </button>
    </div>
  );
}

function SessionItem({
  session,
  isSelected,
  isRunning,
  isUnread,
  onClick,
  onRenamed,
  onDeleted,
  depth = 0,
  hasChildren = false,
  collapsed = false,
  onToggleCollapse,
  sectionLabel,
  pinnedProjectLabel,
}: {
  session: SessionInfo;
  isSelected: boolean;
  isRunning?: boolean;
  isUnread?: boolean;
  onClick: () => void;
  onRenamed?: () => void;
  onDeleted?: (id: string) => void;
  depth?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  sectionLabel?: string;
  pinnedProjectLabel?: string;
}) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Select the whole name once the rename input is mounted (startRename's
  // immediate setTimeout can fire before the input exists).
  useEffect(() => {
    if (renaming) {
      const id = requestAnimationFrame(() => inputRef.current?.select());
      return () => cancelAnimationFrame(id);
    }
  }, [renaming]);

  // A stored first message may be an SDK-expanded <skill> block; collapse it
  // back to the compact /skill:name args command the user typed before using
  // it as the auto-name fallback, mirroring MessageView's rendering.
  const displayFirstMessage = skillExpansionToCommand(session.firstMessage) ?? session.firstMessage;
  const title = session.name || displayFirstMessage.slice(0, 50) || session.id.slice(0, 12);

  const startRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (session.transient) return;
    setRenameValue(session.name || displayFirstMessage.slice(0, 50) || session.id.slice(0, 12));
    setRenaming(true);
  }, [session.name, session.transient, displayFirstMessage, session.id]);

  const commitRename = useCallback(async () => {
    const name = renameValue.trim();
    setRenaming(false);
    // No-op when unchanged: the fallback title (first message / id) isn't a
    // real stored name, so don't persist it as one. (The rename input seeds
    // from the same collapsed displayFirstMessage, so an untouched rename of
    // a skill-invoked session stays a no-op instead of persisting raw XML.)
    if (renameValue === title || name === (session.name ?? "")) return;
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      onRenamed?.();
    } catch {
      // ignore
    }
  }, [renameValue, session.id, session.name, onRenamed, title]);

  const performDelete = useCallback(async () => {
    if (session.transient) return;
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
      onDeleted?.(session.id);
    } catch {
      setDeleting(false);
    }
  }, [session.id, session.transient, onDeleted]);

  const togglePinned = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (session.transient) return;
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !session.pinned }),
      });
      onRenamed?.();
    } catch {
      // ignore
    }
  }, [session.id, session.pinned, session.transient, onRenamed]);

  const toggleArchived = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (session.transient) return;
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !session.archived }),
      });
      onRenamed?.();
    } catch {
      // ignore
    }
  }, [session.id, session.archived, session.transient, onRenamed]);

  // Collapsed "more actions" menu (pin/archive/rename/delete) — a shadcn
  // DropdownMenu (Radix), which owns its own positioning, outside-click and
  // Escape handling instead of the row hand-rolling them.
  const [menuOpen, setMenuOpen] = useState(false);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey) {
      void performDelete();
    } else {
      setConfirmDelete(true);
    }
  }, [performDelete]);

  const handleDeleteConfirm = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    void performDelete();
  }, [performDelete]);

  const handleDeleteCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const handled = dispatchSessionRowContextMenu({
      id: session.id,
      path: session.path,
      cwd: session.cwd,
      name: session.name,
      clientX: e.clientX,
      clientY: e.clientY,
      refresh: () => { onRenamed?.(); },
    });
    if (!handled) return;
    e.preventDefault();
    e.stopPropagation();
  }, [onRenamed, session.cwd, session.id, session.name, session.path]);

  // Fixed-height outer wrapper — content swaps in place so the list never reflows
  return (
    <div
      onClick={confirmDelete || renaming ? undefined : onClick}
      onContextMenu={confirmDelete || renaming ? undefined : handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
      style={{
        height: SIDEBAR_SESSION_ROW_HEIGHT,
        paddingLeft: depth > 0 ? depth * 12 + 14 : 14,
        opacity: deleting ? 0.5 : 1,
      }}
      className={cn(
        "flex items-center gap-1.5 overflow-hidden border-l-2 pr-2 transition-colors",
        confirmDelete || renaming ? "cursor-default" : "cursor-pointer",
        confirmDelete
          ? "border-l-destructive bg-destructive/[0.06]"
          : isSelected
            ? "border-l-primary bg-accent"
            : hovered
              ? "border-l-transparent bg-accent"
              : "border-l-transparent bg-transparent",
      )}
    >
      {confirmDelete ? (
        /* ── Delete confirmation: same height, two flat buttons ── */
        <>
          <div className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-foreground">
            {t("sidebar.deleteSession", { title: title.slice(0, 22) + (title.length > 22 ? "…" : "") })}
          </div>
          <div className="flex shrink-0 gap-[5px]">
            <button
              onClick={handleDeleteConfirm}
              className="flex h-[30px] cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md border-none bg-destructive px-[11px] text-xs font-semibold text-destructive-foreground"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              {t("sidebar.delete")}
            </button>
            <button
              onClick={handleDeleteCancel}
              className="flex h-[30px] cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-border bg-background px-[11px] text-xs font-medium text-muted-foreground"
            >
              {t("sidebar.cancel")}
            </button>
          </div>
        </>
      ) : renaming ? (
        /* ── Rename: input fills the same row ── */
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          autoFocus
          className="h-[30px] flex-1 rounded-[5px] border border-primary bg-background px-2 py-[5px] text-xs text-foreground outline-none"
        />
      ) : (
        /* ── Normal view ── */
        <>
          {/* Subagent indicator for child sessions */}
          {depth > 0 && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <rect x="5" y="7" width="14" height="11" rx="2" />
              <path d="M9 11h.01M15 11h.01M9 15h6M12 7V4M10 4h4" />
            </svg>
          )}
          <div className="min-w-0 flex-1">
            {sectionLabel && (
              <div className="mb-px text-[10px] font-semibold uppercase tracking-[0.3px] text-muted-foreground/70">
                {sectionLabel}
              </div>
            )}
            {/* One-line row (decision 5): status dot (if any) + title + branch
                chip/pinned-project-label — relative-time and message-count text
                are dropped, recency now comes purely from sort order. */}
            <div
              className={cn("flex min-w-0 items-center gap-1.5 text-xs leading-[1.4] text-foreground", isSelected ? "font-medium" : "font-normal")}
              title={title}
            >
              {isRunning ? (
                <RunningSessionIndicator />
              ) : isUnread ? (
                <UnreadSessionIndicator />
              ) : null}
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {title}
              </span>
              {pinnedProjectLabel && (
                <span
                  title={pinnedProjectLabel}
                  className="shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted-foreground/70"
                >
                  {pinnedProjectLabel}
                </span>
              )}
              {session.isWorktree && session.branch && (
                <span
                  title={`Worktree: ${session.cwd}`}
                  className="flex min-w-0 shrink-0 items-center gap-[3px] overflow-hidden text-[11px] text-primary"
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{session.branch}</span>
                </span>
              )}
            </div>
          </div>

          {/* Collapse toggle — always visible when has children */}
          {hasChildren && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
              title={t(collapsed ? "sidebar.expandSubagents" : "sidebar.collapseSubagents")}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center border-none bg-transparent p-0 text-muted-foreground/70 cursor-pointer transition-transform duration-150",
                collapsed ? "-rotate-90" : "",
              )}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2 3.5 5 6.5 8 3.5" />
              </svg>
            </button>
          )}

          {/* Collapsed "more actions" menu — shown on hover (or while open) */}
          {(hovered || menuOpen) && !session.transient && (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  title={t("sidebar.moreActions")}
                  aria-label={t("sidebar.moreActions")}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors",
                    menuOpen ? "bg-accent text-primary" : "bg-accent/60 hover:bg-accent",
                  )}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="19" cy="12" r="1.8" />
                  </svg>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                  onSelect={(e) => togglePinned(e as unknown as React.MouseEvent)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22" />
                    <path d="M5 17h14l-1.5-7.5a3 3 0 0 0-1.2-1.9L15 6V4a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1v2l-1.3 1.6a3 3 0 0 0-1.2 1.9L5 17z" />
                  </svg>
                  {t(session.pinned ? "sidebar.unpin" : "sidebar.pin")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => toggleArchived(e as unknown as React.MouseEvent)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="4" rx="1" />
                    <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                  {t(session.archived ? "sidebar.unarchive" : "sidebar.archive")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => startRename(e as unknown as React.MouseEvent)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                  {t("sidebar.rename")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => handleDeleteClick(e as unknown as React.MouseEvent)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                  {t("sidebar.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}
    </div>
  );
}
