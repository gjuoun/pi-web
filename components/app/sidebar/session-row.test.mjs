import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { SessionRow } = await jiti.import("./session-row.tsx");
const { ProjectGroup } = await jiti.import("./project-group.tsx");
const { ExplorerPanel } = await jiti.import("./explorer-panel.tsx");
const { AppSidebar } = await jiti.import("./app-sidebar.tsx");
const { projects } = await jiti.import("../../../app/ui/preview/_fixtures/sessions.ts");
const { explorerRows } = await jiti.import("../../../app/ui/preview/_fixtures/explorer.ts");

const render = (el) => renderToStaticMarkup(el);
const row = (props) => render(React.createElement(SessionRow, { id: "s", title: "A title", time: "1h", ...props }));

test("a session row marks only the active one with aria-current", () => {
  assert.match(row({ active: true }), /aria-current="page"/);
  assert.doesNotMatch(row({}), /aria-current/);
});

test("pinned and running rows carry their indicators; plain rows carry neither", () => {
  assert.match(row({ pinned: true }), /data-slot="session-pin-indicator"/);
  assert.match(row({ running: true }), /data-slot="session-running-indicator"/);
  const plain = row({});
  assert.doesNotMatch(plain, /session-pin-indicator|session-running-indicator/);
});

test("a subagent child row is indented and shows the agent glyph", () => {
  const child = row({ depth: 1 });
  assert.match(child, /data-depth="1"/);
  assert.match(child, /data-slot="session-agent-glyph"/);
  assert.doesNotMatch(row({}), /session-agent-glyph/);
});

test("a project group shows name (count) and renders rows only when expanded", () => {
  const sessions = projects[0].sessions;
  const open = render(React.createElement(ProjectGroup, { ...projects[0], expanded: true }));
  assert.match(open, new RegExp(`${projects[0].name} \\(${projects[0].count}\\)`));
  assert.equal((open.match(/data-slot="session-row"/g) ?? []).length, sessions.length);
  assert.match(open, /aria-expanded="true"/);
  const closed = render(React.createElement(ProjectGroup, { ...projects[1], expanded: false }));
  assert.match(closed, /aria-expanded="false"/);
  assert.doesNotMatch(closed, /data-slot="session-row"/);
});

test("the explorer shows its header, every row, and a status letter or dot per git status", () => {
  const html = render(React.createElement(ExplorerPanel, { rows: explorerRows }));
  assert.match(html, /EXPLORER/);
  assert.equal((html.match(/data-slot="explorer-row"/g) ?? []).length, explorerRows.length);
  assert.ok((html.match(/data-status="modified"/g) ?? []).length >= 3);
  assert.match(html, /data-status="untracked"/);
});

test("the sidebar stacks the action row, the groups, the explorer and the settings footer at 260px, stateless", () => {
  const html = render(React.createElement(AppSidebar, { projects, explorerRows }));
  for (const slot of ["sidebar-actions", "sidebar-groups", "explorer-panel", "sidebar-footer"]) assert.match(html, new RegExp(`data-slot="${slot}"`));
  assert.match(html, /w-\[260px\]/);
  assert.match(html, /New/);
  assert.doesNotMatch(html, /onclick|<input|<textarea|<button/i);
  // The only inline styles are the file icons' CSS variables.
  const styled = [...html.matchAll(/<[^>]*\sstyle="[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.ok(styled.every((tag) => tag.includes("catppuccin-file-icon")), "inline styles only on file icons");
});
