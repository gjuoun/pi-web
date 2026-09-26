import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AgentSessionPanel.tsx", import.meta.url), "utf8");

test("keeps the main session first and makes every agent session selectable", () => {
  const mainRow = source.indexOf("session={rootSession}");
  const subagentRows = source.indexOf("visibleSubagents.map");
  assert.ok(mainRow > 0);
  assert.ok(subagentRows > mainRow);
  assert.match(source, /onSelect=\{\(\) => onSelectSession\(rootSession\)\}/);
  assert.match(source, /onSelect=\{\(\) => onSelectSession\(session\)\}/);
  assert.match(source, /aria-selected=\{selected\}/);
});

test("sorts running subagents first and enables search only for larger families", () => {
  assert.match(source, /if \(aRunning !== bRunning\) return aRunning \? -1 : 1/);
  assert.match(source, /subagents\.length > 8/);
  assert.match(source, /relation\?\.description, relation\?\.profile, session\.name, session\.firstMessage/);
  assert.match(source, /max-h-\[min\(58dvh,480px\)\]/);
});

test("labels a child by the engine that ran it", () => {
  // Both engines' children carry the same `pi-web:subagent` marker, so the family panel cannot tell
  // them apart without the engine field the writer now stamps.
  assert.match(source, /relation\?\.engine === "pi-subagents" && \(/);
  assert.match(source, /t\("agentSwitcher\.enginePackage"\)/);
  assert.match(source, /data-testid="agent-engine-tag"/);
});

test("renders as a compact left-positioned dropdown without a centered inner width", () => {
  assert.match(source, /border-x border-b border-border/);
  assert.match(source, /rounded-b-md/);
  assert.doesNotMatch(source, /maxWidth: 680/);
  assert.doesNotMatch(source, /mx-auto/);
});

test("shows persisted completion states while live running state takes precedence", () => {
  assert.match(source, /const status: SubagentSessionStatus = running \? "running" : relation\?\.status \?\? "completed"/);
  assert.match(source, /t\(`agentSwitcher\.status\.\$\{status\}`\)/);
  assert.match(source, /status === "failed"/);
  assert.match(source, /status === "aborted" \|\| status === "interrupted"/);
  // Semantic colours moved from literal hex to tokens.
  assert.match(source, /text-success/);
  assert.match(source, /text-destructive/);
  assert.match(source, /text-warning/);
});

test("enriches a family row with the package run that produced it", () => {
  // One tab, fed by the engine that actually ran the child (docs/adr/0006): the live feed's
  // metrics land on the row whose session the run created.
  assert.match(source, /runs\?: readonly PiSubagentRun\[\]/);
  assert.match(source, /run\.childSessionId/);
  assert.match(source, /piSubagents\.tools/);
  assert.match(source, /piSubagents\.tokens/);
  assert.match(source, /run\.cost/);
});

test("lists a run that has no child session yet as a pending, unselectable row", () => {
  assert.match(source, /pendingRuns/);
  assert.match(source, /data-testid="agent-pending-run"/);
  assert.match(source, /disabled/);
  assert.match(source, /piSubagents\.sessionPending/);
});
