import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * The package-runs tab needs a count while its panel is closed, so AppShell polls the same route the
 * panel reads. These assertions keep that wiring honest: the badge exists, it is driven by that
 * route, it is only rendered once there is something to count, and it marks a live run differently
 * from a settled one.
 */
const shell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");

test("polls the runs route for the selected session only", () => {
  assert.match(shell, /fetch\(`\/api\/pi-subagents\/runs\?sessionId=\$\{encodeURIComponent\(piSubagentSessionId\)\}`/);
  assert.match(shell, /if \(!piSubagentSessionId\) \{/);
  assert.match(shell, /setInterval\(\(\) => \{ void load\(\); \}, 3000\)/);
  assert.match(shell, /clearInterval\(timer\)/);
  assert.match(shell, /const piSubagentSessionId = selectedSession\?\.id;/);
});

test("counts runs and how many are live", () => {
  assert.match(shell, /total: runs\.length/);
  assert.match(shell, /run\.status === "running" \|\| run\.status === "starting" \|\| run\.status === "steered"/);
});

test("shows the badge only when there is something to count", () => {
  assert.match(shell, /\{piSubagentRuns\.total > 0 && \(/);
  assert.match(shell, /data-testid="pi-subagents-badge"/);
  assert.match(shell, /piSubagentRuns\.running > 0 \? "var\(--accent\)" : "var\(--bg-selected\)"/);
});

test("the tab is a sibling of the Agents tab and keeps opening its own panel", () => {
  const agentsTab = shell.indexOf('data-top-panel="pi-subagents"');
  const agentsPanel = shell.indexOf('activeTopPanel === "pi-subagents" && selectedSession');
  assert.ok(agentsTab > 0);
  assert.ok(agentsPanel > agentsTab);
  assert.match(shell, /<PiSubagentsRunsPanel/);
});
