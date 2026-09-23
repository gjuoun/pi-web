import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { projectIdentityKey } = await jiti.import("./project-identity.ts");
const {
  getProjectActivity,
  getRecentProjects,
  groupFamiliesByProject,
} = await jiti.import("./project-groups.ts");

function session(id, projectRoot, modified) {
  return {
    id,
    path: `${id}.jsonl`,
    cwd: projectRoot,
    projectRoot,
    projectKey: projectIdentityKey(projectRoot, "win32"),
    created: modified,
    modified,
    messageCount: 1,
    firstMessage: id,
  };
}

test("Windows path variants form one recent project using the newest display path", () => {
  const older = session("older", "C:\\Users\\Alex\\Project\\Study\\ELM", "2026-08-12T00:00:00.000Z");
  const newer = session("newer", "c:/users/ALEX/project/study/elm", "2026-08-13T00:00:00.000Z");

  assert.deepEqual(getRecentProjects([older, newer]), [{
    key: older.projectKey,
    root: newer.projectRoot,
  }]);
});

function family(root, latestModified) {
  return { root, subagents: [], latestModified: latestModified ?? root.modified };
}

test("groupFamiliesByProject clusters interleaved families by project, ordered by latest activity", () => {
  const a1 = session("a1", "/repo/a", "2026-08-10T00:00:00.000Z");
  const b1 = session("b1", "/repo/b", "2026-08-11T00:00:00.000Z");
  const a2 = session("a2", "/repo/a", "2026-08-12T00:00:00.000Z");
  const c1 = session("c1", "/repo/c", "2026-08-13T00:00:00.000Z");
  const b2 = session("b2", "/repo/b", "2026-08-14T00:00:00.000Z");

  const groups = groupFamiliesByProject([
    family(a1),
    family(b1),
    family(a2),
    family(c1),
    family(b2),
  ]);

  assert.deepEqual(
    groups.map((g) => g.families.map((f) => f.root.id)),
    [["b1", "b2"], ["c1"], ["a1", "a2"]],
  );
  assert.deepEqual(groups.map((g) => g.project.key), [b1.projectKey, c1.projectKey, a1.projectKey]);
});

test("groupFamiliesByProject returns one group for a single-project input", () => {
  const a1 = session("a1", "/repo/a", "2026-08-10T00:00:00.000Z");
  const a2 = session("a2", "/repo/a", "2026-08-11T00:00:00.000Z");

  const groups = groupFamiliesByProject([family(a1), family(a2)]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].families.map((f) => f.root.id), ["a1", "a2"]);
});

test("groupFamiliesByProject returns [] for empty input", () => {
  assert.deepEqual(groupFamiliesByProject([]), []);
});

test("running and unread counts aggregate under the stable project identity", () => {
  const first = session("first", "C:\\Users\\Alex\\Project", "2026-08-12T00:00:00.000Z");
  const second = session("second", "c:/users/alex/project/", "2026-08-13T00:00:00.000Z");

  const activity = getProjectActivity(
    [first, second],
    new Set(["first", "second"]),
    new Set(["second"]),
  );

  assert.deepEqual(activity.get(first.projectKey), { running: 2, unread: 1 });
  assert.equal(activity.size, 1);
});
