import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { ComposerView } = await jiti.import("./composer-view.tsx");
const { StatusBarView } = await jiti.import("./status-bar-view.tsx");
const { statusBar, freshStatusBar } = await jiti.import("../../../app/ui/preview/_fixtures/conversation.ts");

const render = (el) => renderToStaticMarkup(el);

test("the idle composer shows the placeholder and the actions button, and no text field", () => {
  const html = render(React.createElement(ComposerView, {}));
  assert.match(html, /data-slot="composer-view"/);
  assert.match(html, /data-slot="composer-box"/);
  assert.match(html, /Message… Type \/ for commands, @ for files/);
  assert.match(html, /data-slot="composer-actions"/);
  assert.doesNotMatch(html, /<textarea|<input|<button|data-busy/i);
});

test("image chips and queued messages render their rows", () => {
  const html = render(React.createElement(ComposerView, {
    chips: [{ id: "a", label: "diagram.png" }, { id: "b", label: "shot.png" }],
    queued: [{ kind: "steer", text: "then run the e2e" }, { kind: "follow-up", text: "and update the docs" }],
  }));
  assert.equal((html.match(/data-slot="composer-chip"/g) ?? []).length, 2);
  assert.equal((html.match(/data-slot="composer-queued"/g) ?? []).length, 2);
  assert.match(html, /data-chat-queued="steer"/);
  assert.match(html, /data-chat-queued="follow-up"/);
  assert.match(html, /then run the e2e/);
});

test("the busy composer swaps the actions for a stop affordance", () => {
  const html = render(React.createElement(ComposerView, { busy: true }));
  assert.match(html, /data-busy="true"/);
  assert.match(html, /data-slot="composer-stop"/);
  assert.doesNotMatch(html, /data-slot="composer-actions"/);
});

test("the status bar shows project, branch and session name, then stats, model and thinking", () => {
  const html = render(React.createElement(StatusBarView, statusBar));
  assert.match(html, /data-slot="status-bar-view"/);
  assert.ok(html.includes(statusBar.project));
  assert.ok(html.includes(`(${statusBar.branch})`));
  assert.ok(html.includes(statusBar.sessionName));
  for (const segment of statusBar.stats) assert.ok(html.includes(`>${segment}<`), `missing ${segment}`);
  assert.ok(html.includes(statusBar.model));
  assert.ok(html.includes(`• ${statusBar.thinking}`));
});

test("a fresh session's status bar drops the name and stats, keeping project and model", () => {
  const html = render(React.createElement(StatusBarView, { ...freshStatusBar, fresh: true }));
  assert.ok(html.includes(freshStatusBar.project));
  assert.ok(html.includes(freshStatusBar.model));
  assert.ok(html.includes(`• ${freshStatusBar.thinking}`));
  assert.doesNotMatch(html, /status-bar-name|status-bar-stats/);
  assert.equal((html.match(/data-slot="status-bar-line"/g) ?? []).length, 1);
});
