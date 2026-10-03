import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { projects } = await jiti.import("./sessions.ts");
const { explorerRows } = await jiti.import("./explorer.ts");

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

test("explorer: a 14-row tree whose statuses are modified, added or untracked", () => {
  assert.equal(explorerRows.length, 14);
  for (const row of explorerRows) assert.ok([undefined, "modified", "added", "untracked"].includes(row.status));
  assert.ok(explorerRows.some((r) => r.kind === "folder") && explorerRows.some((r) => r.kind === "file"));
});
