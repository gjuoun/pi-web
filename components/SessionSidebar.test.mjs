import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
await jiti.import("./SessionSidebar.tsx");

const source = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const sessionItemSource = source.slice(source.indexOf("function SessionItem("));

// Row-heights-aware virtualization (getSidebarRowIndices/buildSidebarRenderRows)
// moved to lib/sidebar-render-rows.ts and is covered by
// lib/sidebar-render-rows.test.mjs; this file only asserts the component wires
// it up correctly.
test("builds a heterogeneous row list from lib/sidebar-render-rows and virtualizes via prefix sums", () => {
  assert.match(source, /import \{\s*buildSidebarRenderRows,\s*buildRowPrefixSums,\s*getSidebarRowIndices,/);
  assert.match(source, /const renderRows: SidebarRenderRow\[\] = \[/);
  assert.match(source, /const rowPrefixSums = buildRowPrefixSums\(rowHeights\)/);
  assert.match(source, /const virtualIndices = getSidebarRowIndices\(rowHeights, listScrollTop, listViewportH, focusedRowIndex\)/);
});

test("project groups fold by default and persist expand state via lib/sidebar-expanded-projects", () => {
  assert.match(source, /import \{ getExpandedProjects, setProjectExpanded \} from "@\/lib\/sidebar-expanded-projects"/);
  assert.match(source, /const \[expandedProjectKeys, setExpandedProjectKeys\] = useState<Set<string>>\(\(\) => getExpandedProjects\(\)\)/);
  assert.match(source, /const toggleProjectExpanded = useCallback\(\(projectKey: string\) => \{/);
  assert.match(source, /setProjectExpanded\(projectKey, expanded\)/);
});

test("only Shift+click bypasses session deletion confirmation", () => {
  assert.match(
    sessionItemSource,
    /const handleDeleteClick[\s\S]*?if \(e\.shiftKey\) \{\s*void performDelete\(\);\s*\} else \{\s*setConfirmDelete\(true\);/,
  );
});

test("does not register row-level session deletion shortcuts", () => {
  assert.doesNotMatch(sessionItemSource, /const handleKeyDown/);
  assert.doesNotMatch(sessionItemSource, /onKeyDown=\{handleKeyDown\}/);
  assert.doesNotMatch(sessionItemSource, /tabIndex=\{0\}/);
});

test("polls running sessions only while the tab is visible", () => {
  assert.doesNotMatch(source, /new EventSource\("\/api\/agent\/running\/events"\)/);
  assert.match(source, /fetch\("\/api\/agent\/running"/);
  assert.match(source, /document\.visibilityState !== "visible"/);
  assert.match(source, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
});

test("exposes the polled running-session set to the shell", () => {
  assert.match(source, /onRunningSessionIdsChange\?: \(ids: Set<string>\) => void/);
  assert.match(source, /onRunningSessionIdsChange\?\.\(runningSessionIds\)/);
});

test("exposes the loaded session catalog to the shell", () => {
  assert.match(source, /onSessionsChange\?: \(sessions: SessionInfo\[\]\) => void/);
  assert.match(source, /onSessionsChange\?\.\(allSessions\)/);
});

test("subagent completion stays silent and never becomes unread", () => {
  assert.match(source, /completionNotificationSuppressedSessionIds\?: string\[\]/);
  assert.match(
    source,
    /completedWithNotifications = completedInBackground\.filter\([\s\S]*?!previousSuppressedCompletionSessionIdsRef\.current\.has\(id\)[\s\S]*?!knownSubagentIds\.has\(id\)/,
  );
  assert.match(source, /completedWithNotifications\.forEach\(\(id\) => next\.add\(id\)\)/);
  assert.match(source, /if \(completedWithNotifications\.length > 0\) \{\s*onBackgroundTaskDone\?\.\(\)/);
  assert.match(
    source,
    /filter\(\(session\) => session\.relation\?\.kind !== "subagent"\)[\s\S]*?unreadEligibleIds\.has\(id\)/,
  );
});

test("drops the relative-time and message-count text from session rows (decision 5: one-line rows)", () => {
  assert.doesNotMatch(source, /formatRelativeTime/);
  assert.doesNotMatch(source, /sidebar\.messagesCount/);
});

test("does not persist an unchanged fallback title ending in whitespace", () => {
  assert.match(
    sessionItemSource,
    /const name = renameValue\.trim\(\);[\s\S]*?if \(renameValue === title \|\| name === \(session\.name \?\? ""\)\) return;/,
  );
});

test("offers the downstream context-menu hook only on a normal session row", () => {
  assert.match(sessionItemSource, /const handleContextMenu[\s\S]*?dispatchSessionRowContextMenu\(\{/);
  assert.match(
    sessionItemSource,
    /onContextMenu=\{confirmDelete \|\| renaming \? undefined : handleContextMenu\}/,
  );
});

test("lifecycle refreshes bypass the cache while cross-window polling reuses it", () => {
  assert.match(source, /force \? "\/api\/sessions\?force=1" : "\/api\/sessions"/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /loadSessions\(isFirst, !isFirst\)/);
  assert.match(source, /data\.sessionListVersion !== sessionListVersionRef\.current[\s\S]*?await loadSessions\(\)/);
  assert.doesNotMatch(source, /sessionRefreshDone|sessionRefreshTimerRef|title=\{t\("sidebar\.refresh"\)\}/);
  assert.match(source, /loadSessions\(false, true\);[\s\S]*?onBackgroundTaskDone/);
});

test("does not expose disk-backed actions for transient sessions", () => {
  assert.match(sessionItemSource, /if \(session\.transient\) return;/);
  assert.match(sessionItemSource, /\{\(hovered \|\| menuOpen\) && !session\.transient && \(/);
});

test("pin and archive actions call PATCH and refresh the list, collapsed into one menu", () => {
  assert.match(sessionItemSource, /const togglePinned = useCallback[\s\S]*?pinned: !session\.pinned[\s\S]*?onRenamed\?\.\(\);/);
  assert.match(sessionItemSource, /const toggleArchived = useCallback[\s\S]*?archived: !session\.archived[\s\S]*?onRenamed\?\.\(\);/);
  // Pin/archive/rename/delete are collapsed behind a single "more actions" trigger
  // (portaled dropdown, since the row itself is overflow:hidden) instead of four
  // separate always-rendered hover icon buttons.
  assert.match(sessionItemSource, /onClick=\{toggleMenu\}/);
  assert.match(sessionItemSource, /createPortal\(/);
  assert.match(sessionItemSource, /onClick=\{\(e\) => \{ togglePinned\(e\); setMenuOpen\(false\); \}\}/);
  assert.match(sessionItemSource, /onClick=\{\(e\) => \{ toggleArchived\(e\); setMenuOpen\(false\); \}\}/);
  assert.match(sessionItemSource, /onClick=\{\(e\) => \{ startRename\(e\); setMenuOpen\(false\); \}\}/);
  assert.match(sessionItemSource, /onClick=\{\(e\) => \{ handleDeleteClick\(e\); setMenuOpen\(false\); \}\}/);
  assert.match(sessionItemSource, /t\(session\.pinned \? "sidebar\.unpin" : "sidebar\.pin"\)/);
  assert.match(sessionItemSource, /t\(session\.archived \? "sidebar\.unarchive" : "sidebar\.archive"\)/);
});

test("more-actions menu closes on outside click and Escape", () => {
  assert.match(sessionItemSource, /document\.addEventListener\("mousedown", handleOutside\)/);
  assert.match(sessionItemSource, /if \(e\.key === "Escape"\) setMenuOpen\(false\);/);
});

test("loadSessions conditionally includes includeArchived based on showArchived state", () => {
  assert.match(source, /const url = showArchived \? `\$\{base\}\$\{force \? "&" : "\?"\}includeArchived=1` : base;/);
});

test("groups sessions pinned-first, then buildSidebarRenderRows clusters unpinned families by project", () => {
  assert.match(source, /const allFamilies = listSessionFamilies\(filteredSessions\)/);
  assert.match(source, /const pinnedFamilies = allFamilies\.filter\(\(family\) => family\.root\.pinned === true\)/);
  assert.match(source, /const unpinnedFamilies = allFamilies\.filter\(\(family\) => family\.root\.pinned !== true\)/);
  assert.match(source, /\.\.\.buildSidebarRenderRows\(unpinnedFamilies, expandedProjectKeys\),/);
  assert.doesNotMatch(source, /bucketFamilies/);
});

test("project-header rows are dedicated rows, not stacked inline inside a session row", () => {
  assert.match(source, /function ProjectHeaderRow\(/);
  assert.match(source, /row\.kind === "project-header"/);
  assert.doesNotMatch(sessionItemSource, /projectHeader/);
});

test("hides subagent rows and aggregates their state into the main session row", () => {
  assert.match(source, /const allFamilies = listSessionFamilies\(filteredSessions\)/);
  assert.match(source, /familySessions\.some\(\(session\) => session\.id === selectedSessionId\)/);
  assert.match(source, /familySessions\.some\(\(session\) => runningSessionIds\.has\(session\.id\)\)/);
  assert.doesNotMatch(source, /function SessionTreeItem/);
});
