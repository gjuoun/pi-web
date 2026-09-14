import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { PiSubagentsRunsList } = await jiti.import("./PiSubagentsRunsPanel.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

const NOW = Date.parse("2026-09-14T00:00:30.000Z");

function render(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(PiSubagentsRunsList, props)),
  );
}

const running = {
  runId: "run-1",
  parentSessionId: "parent",
  profile: "finder",
  description: "explore the repo",
  status: "running",
  startedAt: "2026-09-14T00:00:00.000Z",
  childSessionId: "child-1",
  toolUses: 3,
  tokens: 12_400,
  cost: 0.0123,
};

test("renders a running run with its status and elapsed time", () => {
  const html = render({ engineReady: true, runs: [running], selectedSessionId: "parent", onSelectSessionId: () => {}, now: NOW });
  assert.match(html, /finder/);
  assert.match(html, /explore the repo/);
  assert.match(html, /data-testid="pi-subagents-run-status"[^>]*>Running</);
  assert.match(html, /data-testid="pi-subagents-run-elapsed"[^>]*>30s</);
  assert.match(html, /3 Tools|3 tools/);
  assert.match(html, /12\.4k/);
  assert.match(html, /\$0\.0123/);
});

test("a settled run shows its measured duration instead of counting up", () => {
  const settled = {
    ...running,
    status: "completed",
    completedAt: "2026-09-14T00:01:35.000Z",
  };
  const html = render({ engineReady: true, runs: [settled], selectedSessionId: "parent", onSelectSessionId: () => {}, now: NOW });
  assert.match(html, /data-testid="pi-subagents-run-status"[^>]*>Completed</);
  assert.match(html, /data-testid="pi-subagents-run-elapsed"[^>]*>1m 35s</);
});

test("a run is openable once its child session is known, and inert before that", () => {
  const pending = { ...running, childSessionId: undefined };
  const openable = render({ engineReady: true, runs: [running], selectedSessionId: "parent", onSelectSessionId: () => {}, now: NOW });
  const inert = render({ engineReady: true, runs: [pending], selectedSessionId: "parent", onSelectSessionId: () => {}, now: NOW });
  assert.doesNotMatch(openable, /disabled=""/);
  assert.match(inert, /disabled=""/);
});

test("says the engine is unavailable rather than looking empty", () => {
  const html = render({ engineReady: false, runs: [], selectedSessionId: "parent", onSelectSessionId: () => {}, now: NOW });
  assert.match(html, /pi-subagents-panel-not-enabled/);
  assert.doesNotMatch(html, /pi-subagents-panel-empty/);
});

test("the container polls the runs route while it is open", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./PiSubagentsRunsPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /fetch\(`\/api\/pi-subagents\/runs\?sessionId=/);
  assert.match(source, /setInterval\(\(\) => \{ void load\(\); \}, POLL_MS\)/);
  assert.match(source, /clearInterval\(timer\)/);
});
