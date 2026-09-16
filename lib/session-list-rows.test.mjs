import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { buildSessionListRows, projectLabel, projectActivityOf } = await jiti.import("./session-list-rows.ts");

let clock = 0;
/** A session in `project` modified at a fixed, increasing time so ordering is deterministic. */
function session(id, project, { modified, relation, name } = {}) {
  clock += 1;
  const key = project === null ? undefined : `p:${project}`;
  return {
    path: `/agent/sessions/${project ?? "none"}/${id}.jsonl`,
    id,
    cwd: project === null ? "" : `/repos/${project}`,
    name: name ?? id,
    created: "2026-09-16T00:00:00.000Z",
    modified: modified ?? `2026-09-16T00:${String(clock).padStart(2, "0")}:00.000Z`,
    messageCount: 2,
    firstMessage: id,
    ...(key ? { projectRoot: `/repos/${project}`, projectKey: key } : {}),
    ...(relation ? { relation } : {}),
  };
}

const build = (sessions, overrides = {}) =>
  buildSessionListRows({
    sessions,
    runningSessionIds: new Set(),
    unreadSessionIds: new Set(),
    expandedProjects: new Set(["p:alpha", "p:beta", "p:gamma", "standalone"]),
    ...overrides,
  });

const kinds = (rows) => rows.map((row) => (row.kind === "project-header" ? `#${row.label}` : row.session.id));

test("one header per project, ordered by most recent activity", () => {
  const rows = build([
    session("a1", "alpha", { modified: "2026-09-16T09:00:00.000Z" }),
    session("b1", "beta", { modified: "2026-09-16T11:00:00.000Z" }),
    session("g1", "gamma", { modified: "2026-09-16T10:00:00.000Z" }),
  ]);
  assert.deepEqual(
    rows.filter((row) => row.kind === "project-header").map((row) => row.label),
    ["beta", "gamma", "alpha"],
  );
});

test("each project's sessions follow its own header", () => {
  const rows = build([
    session("a1", "alpha", { modified: "2026-09-16T09:00:00.000Z" }),
    session("b1", "beta", { modified: "2026-09-16T11:00:00.000Z" }),
    session("a2", "alpha", { modified: "2026-09-16T08:00:00.000Z" }),
  ]);
  assert.deepEqual(kinds(rows), ["#beta", "b1", "#alpha", "a1", "a2"]);
});

test("a collapsed project contributes only its header", () => {
  const rows = build(
    [session("a1", "alpha"), session("b1", "beta")],
    { expandedProjects: new Set() },
  );
  assert.deepEqual(rows.map((row) => row.kind), ["project-header", "project-header"]);
  assert.ok(rows.every((row) => row.kind !== "project-header" || row.expanded === false));
});

test("a header counts every session of its project", () => {
  const rows = build([session("a1", "alpha"), session("a2", "alpha"), session("a3", "alpha")]);
  const header = rows[0];
  assert.equal(header.kind, "project-header");
  assert.equal(header.count, 3);
});

test("a header carries the running and unread rollup", () => {
  const rows = build(
    [session("a1", "alpha"), session("a2", "alpha"), session("b1", "beta")],
    { runningSessionIds: new Set(["a1"]), unreadSessionIds: new Set(["a1", "a2"]) },
  );
  const alpha = rows.find((row) => row.kind === "project-header" && row.label === "alpha");
  assert.deepEqual(projectActivityOf(rows, "p:alpha"), { running: 1, unread: 2 });
  assert.equal(alpha.running, 1);
  assert.equal(alpha.unread, 2);
});

test("a session with no resolvable project lands in the standalone bucket", () => {
  const rows = build([session("a1", "alpha"), session("x1", null)]);
  const standalone = rows.find((row) => row.kind === "project-header" && row.projectKey === "standalone");
  assert.ok(standalone, "expected a standalone header");
  assert.equal(standalone.label, "standalone");
  assert.ok(kinds(rows).includes("x1"));
});

test("the standalone bucket sorts last even when it is the most recent", () => {
  const rows = build([
    session("x1", null, { modified: "2026-09-16T23:00:00.000Z" }),
    session("a1", "alpha", { modified: "2026-09-16T01:00:00.000Z" }),
  ]);
  assert.deepEqual(rows.map((row) => row.label ?? row.session.id), ["alpha", "a1", "standalone", "x1"]);
});

test("a subagent stays attached to its root as one row", () => {
  const parent = session("a1", "alpha", { modified: "2026-09-16T10:00:00.000Z" });
  const child = session("a1-child", "alpha", {
    modified: "2026-09-16T12:00:00.000Z",
    relation: { kind: "subagent", parentSessionId: "a1", profile: "worker", description: "work", status: "done" },
  });
  const rows = build([parent, child]);
  const sessionRows = rows.filter((row) => row.kind === "session");
  assert.deepEqual(sessionRows.map((row) => row.session.id), ["a1"]);
  assert.equal(sessionRows[0].subagentCount, 1);
});

test("a query keeps matching sessions and drops headers that lose every row", () => {
  const rows = build([session("a1", "alpha"), session("b1", "beta", { name: "fix login" })], { query: "login" });
  assert.deepEqual(kinds(rows), ["#beta", "b1"]);
});

test("archived sessions are hidden unless they are asked for", () => {
  const sessions = [
    session("a1", "alpha", { modified: "2026-09-16T12:00:00.000Z" }),
    session("a2", "alpha", { modified: "2026-09-16T11:00:00.000Z" }),
  ];
  const hidden = build(sessions, { archivedSessionIds: new Set(["a2"]) });
  assert.deepEqual(kinds(hidden), ["#alpha", "a1"]);

  const shown = build(sessions, { archivedSessionIds: new Set(["a2"]), includeArchived: true });
  assert.deepEqual(kinds(shown), ["#alpha", "a1", "a2"]);
  assert.equal(shown.find((row) => row.kind === "session" && row.session.id === "a2").archived, true);
});

test("pinned sessions float to the top of their project, keeping recency inside each half", () => {
  const rows = build(
    [
      session("a1", "alpha", { modified: "2026-09-16T12:00:00.000Z" }),
      session("a2", "alpha", { modified: "2026-09-16T11:00:00.000Z" }),
      session("a3", "alpha", { modified: "2026-09-16T10:00:00.000Z" }),
    ],
    { pinnedSessionIds: new Set(["a3"]) },
  );
  assert.deepEqual(kinds(rows), ["#alpha", "a3", "a1", "a2"]);
});

test("the same input always produces the same rows and the label is the last path segment", () => {
  const sessions = [session("a1", "alpha"), session("b1", "beta")];
  assert.deepEqual(build(sessions), build(sessions));
  assert.equal(projectLabel("/Users/dev/repos/pi-web"), "pi-web");
  assert.equal(projectLabel("/Users/dev/repos/pi-web/"), "pi-web");
  assert.equal(projectLabel("C:\\dev\\pi-web"), "pi-web");
  assert.equal(projectLabel(""), "standalone");
});
