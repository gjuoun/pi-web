import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { projects } = await jiti.import("./sessions.ts");
const { explorerRows } = await jiti.import("./explorer.ts");
const { turns, minimapNodes } = await jiti.import("./conversation.ts");

const sessions = projects.flatMap((project) => project.sessions);

test("sessions: unique ids, one active, none running, at least two pinned, roots only", () => {
  assert.equal(projects.length, 6);
  assert.equal(sessions.length, 11);
  assert.equal(new Set(sessions.map((s) => s.id)).size, sessions.length);
  assert.equal(sessions.filter((s) => s.active).length, 1);
  assert.equal(sessions.filter((s) => s.running).length, 0, "a running state needs a live agent, which the seeded real app cannot have");
  assert.ok(sessions.filter((s) => s.pinned).length >= 2);
  assert.ok(sessions.every((s) => !s.depth), "the real list shows only a family's root");
  assert.equal(projects.filter((p) => p.expanded).length, 1, "exactly one expanded group, as in the real sidebar");
  for (const project of projects) assert.equal(project.count, project.sessions.length, `${project.name}: header count is the number of sessions, as the real sidebar counts`);
});

test("conversation: user, assistant and notice turns, with every kind of block", () => {
  assert.ok(turns.some((t) => t.kind === "user"));
  assert.ok(turns.some((t) => t.kind === "assistant"));
  assert.deepEqual(new Set(turns.filter((t) => t.kind === "notice").map((t) => t.tone)), new Set(["error", "compaction"]));
  const blocks = turns.filter((t) => t.kind === "assistant").flatMap((t) => t.blocks.map((b) => b.kind));
  for (const kind of ["p", "h", "list", "code", "table", "process"]) assert.ok(blocks.includes(kind), `a ${kind} block`);
});

test("conversation: every tool call has a name, a summary and a duration; every assistant turn has usage", () => {
  const steps = turns.filter((t) => t.kind === "assistant").flatMap((t) => t.blocks).filter((b) => b.kind === "process").flatMap((b) => b.run.steps);
  const tools = steps.filter((s) => s.kind === "tool");
  assert.ok(tools.length >= 4);
  for (const tool of tools) {
    assert.ok(tool.name && tool.summary && tool.duration, `tool ${JSON.stringify(tool)}`);
  }
  assert.ok(steps.some((s) => s.kind === "thinking"));
  for (const turn of turns.filter((t) => t.kind === "assistant")) assert.ok(turn.usage && turn.usage.cost > 0);
});

test("minimap: one node per user turn and compaction entry, in order, exactly one active", () => {
  const entries = turns.filter((t) => t.kind === "user" || (t.kind === "notice" && t.tone === "compaction"));
  assert.equal(minimapNodes.length, entries.length);
  for (const node of minimapNodes) assert.ok(node.text.length > 0);
  assert.ok(minimapNodes.some((n) => n.outline.some((o) => o.level)), "a heading outline");
  assert.ok(minimapNodes.some((n) => n.outline.some((o) => !o.level)), "a first-line outline");
  assert.equal(minimapNodes.filter((n) => n.active).length, 1);
});

test("explorer: a 14-row tree whose statuses are modified, added or untracked", () => {
  assert.equal(explorerRows.length, 14);
  for (const row of explorerRows) assert.ok([undefined, "modified", "added", "untracked"].includes(row.status));
  assert.ok(explorerRows.some((r) => r.kind === "folder") && explorerRows.some((r) => r.kind === "file"));
});
