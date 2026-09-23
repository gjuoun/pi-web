import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { projectIdentityKey } = await jiti.import("./project-identity.ts");
const {
  buildSidebarRenderRows,
  buildRowPrefixSums,
  getSidebarRowIndices,
  SIDEBAR_SESSION_ROW_HEIGHT,
  SIDEBAR_PROJECT_HEADER_ROW_HEIGHT,
} = await jiti.import("./sidebar-render-rows.ts");

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

function family(root, latestModified) {
  return { root, subagents: [], latestModified: latestModified ?? root.modified };
}

test("buildSidebarRenderRows: expanded project emits header + sessions, collapsed emits header only", () => {
  const a1 = session("a1", "/repo/a", "2026-08-10T00:00:00.000Z");
  const a2 = session("a2", "/repo/a", "2026-08-11T00:00:00.000Z");
  const b1 = session("b1", "/repo/b", "2026-08-12T00:00:00.000Z");

  const rows = buildSidebarRenderRows([family(a1), family(a2), family(b1)], new Set([a1.projectKey]));

  // Groups ordered by each group's own latest activity: repo/b (2026-08-12) before repo/a (2026-08-11).
  assert.equal(rows.length, 4);
  assert.equal(rows[0].kind, "project-header");
  assert.equal(rows[0].collapsed, true);
  assert.equal(rows[0].project.key, b1.projectKey);
  assert.equal(rows[0].count, 1);

  assert.equal(rows[1].kind, "project-header");
  assert.equal(rows[1].collapsed, false);
  assert.equal(rows[1].project.key, a1.projectKey);
  assert.equal(rows[1].count, 2);
  assert.equal(rows[2].kind, "session");
  assert.equal(rows[2].family.root.id, "a1");
  assert.equal(rows[3].kind, "session");
  assert.equal(rows[3].family.root.id, "a2");

  assert.equal(rows[0].height, SIDEBAR_PROJECT_HEADER_ROW_HEIGHT);
  assert.equal(rows[2].height, SIDEBAR_SESSION_ROW_HEIGHT);
});

test("buildSidebarRenderRows: empty input contributes nothing", () => {
  assert.deepEqual(buildSidebarRenderRows([], new Set()), []);
});

test("buildSidebarRenderRows: no expanded projects emits header rows only", () => {
  const a1 = session("a1", "/repo/a", "2026-08-10T00:00:00.000Z");
  const b1 = session("b1", "/repo/b", "2026-08-11T00:00:00.000Z");
  const rows = buildSidebarRenderRows([family(a1), family(b1)], new Set());
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.kind === "project-header" && row.collapsed));
});

test("buildRowPrefixSums accumulates heights with a leading zero", () => {
  assert.deepEqual(buildRowPrefixSums([32, 40, 40, 32]), [0, 32, 72, 112, 144]);
  assert.deepEqual(buildRowPrefixSums([]), [0]);
});

test("getSidebarRowIndices: visible range covers the viewport over mixed row heights", () => {
  const rowHeights = Array.from({ length: 50 }, (_, i) => (i % 5 === 0 ? 32 : 40));
  const prefixSums = buildRowPrefixSums(rowHeights);
  const indices = getSidebarRowIndices(rowHeights, 400, 300);

  // Every row whose span overlaps [400, 700] must be present.
  for (let i = 0; i < rowHeights.length; i++) {
    const top = prefixSums[i];
    const bottom = prefixSums[i + 1];
    if (bottom > 400 && top < 700) assert.ok(indices.includes(i), `expected row ${i} to be visible`);
  }
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
  assert.equal(new Set(indices).size, indices.length);
});

test("getSidebarRowIndices: keeps a scrolled-out focused row mounted", () => {
  const rowHeights = Array.from({ length: 200 }, () => SIDEBAR_SESSION_ROW_HEIGHT);
  const indices = getSidebarRowIndices(rowHeights, 0, 300, 199);
  assert.ok(indices.includes(199));
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
});

test("getSidebarRowIndices: empty list returns no indices", () => {
  assert.deepEqual(getSidebarRowIndices([], 0, 300), []);
});
