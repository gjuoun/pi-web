import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { TopBar } = await jiti.import("./top-bar.tsx");
const { FileTabs } = await jiti.import("./file-tabs.tsx");
const { SessionStats } = await jiti.import("./session-stats.tsx");
const { sessionStats } = await jiti.import("../../../app/ui/preview/_fixtures/conversation.ts");

const render = (el) => renderToStaticMarkup(el);

test("the top bar is a 36px row with the sidebar toggle, four toolbar actions, the stats and the panel toggle", () => {
  const html = render(React.createElement(TopBar, { stats: sessionStats }));
  assert.match(html, /data-slot="top-bar"/);
  assert.match(html, /h-\[36px\]/);
  for (const label of ["Full history", "Generate title", "System", "Tools"]) assert.match(html, new RegExp(`>${label}<`));
  assert.equal((html.match(/data-slot="toolbar-action"/g) ?? []).length, 4);
  assert.match(html, /data-slot="top-bar-sidebar-toggle"/);
  assert.match(html, /data-slot="top-bar-panel-toggle"/);
  assert.match(html, /data-slot="session-stats"/);
});

test("a fresh session disables the history and title actions, like the real bar", () => {
  const html = render(React.createElement(TopBar, { fresh: true }));
  assert.equal((html.match(/data-disabled="true"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /data-slot="session-stats"/);
});

test("session stats show tokens in and out, cache, cost and the context share", () => {
  const html = render(React.createElement(SessionStats, sessionStats));
  for (const text of [sessionStats.up, sessionStats.down, sessionStats.cache, sessionStats.cost, `${sessionStats.contextPercent}% / ${sessionStats.contextWindow}`]) assert.ok(html.includes(text), `missing ${text}`);
});

test("file tabs are a tablist with exactly one selected tab, and a terminal tab", () => {
  const tabs = [
    { id: "a", label: "AGENTS.md", kind: "file" },
    { id: "b", label: "globals.css", kind: "file" },
    { id: "c", label: "zsh", kind: "terminal" },
  ];
  const html = render(React.createElement(FileTabs, { tabs, activeId: "b" }));
  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  assert.match(html, /data-kind="terminal"/);
  assert.doesNotMatch(html, /onclick|<button|<input/i);
});
