import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { SessionTabs } = await jiti.import("./SessionTabs.tsx");
const { createElement } = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");

const tab = (sessionId, title, projectKey = "p:a") => ({ sessionId, projectKey, title });

function render(overrides = {}) {
  const props = {
    tabs: [tab("s1", "first session"), tab("s2", "second session", "p:b")],
    activeId: "s2",
    runningSessionIds: new Set(),
    unreadSessionIds: new Set(),
    onSelect: () => {},
    onClose: () => {},
    ...overrides,
  };
  return renderToStaticMarkup(createElement(SessionTabs, props));
}

test("renders nothing when no session is open", () => {
  assert.equal(render({ tabs: [] }), "");
});

test("exposes the accessible tab contract the probe relies on", () => {
  const html = render();
  assert.match(html, /data-panel="session-tabs"/);
  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-selected="false"/g) ?? []).length, 1);
});

test("marks exactly the active tab selected and shows each session title", () => {
  const html = render();
  assert.match(html, /title="first session"/);
  assert.match(html, /title="second session"/);
  // The active tab is the only one that is focusable.
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 1);
});

test("carries the project key so a tab can be attributed to its codebase", () => {
  const html = render();
  assert.match(html, /data-project-key="p:a"/);
  assert.match(html, /data-project-key="p:b"/);
});

test("every tab gets its own close control", () => {
  const html = render();
  assert.equal((html.match(/data-action="close-session-tab"/g) ?? []).length, 2);
  assert.match(html, /aria-label="Close first session"/);
});

test("a single tab still renders its strip", () => {
  const html = render({ tabs: [tab("s1", "only one")], activeId: "s1" });
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-selected="true"/);
  assert.doesNotMatch(html, /aria-selected="false"/);
});
