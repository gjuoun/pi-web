import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { bucketFamilies } = await jiti.import("./session-date-buckets.ts");

const NOW = Date.parse("2026-09-22T15:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function family(id, modified) {
  return {
    root: { id, path: `/${id}`, cwd: "/tmp", created: modified, modified, messageCount: 1, firstMessage: id },
    subagents: [],
    latestModified: modified,
  };
}

test("assigns families to Today/Yesterday/Previous 7 Days/Older and preserves order", () => {
  const today1 = family("today1", new Date(NOW - 1000).toISOString());
  const today2 = family("today2", new Date(NOW - 2 * 60 * 60 * 1000).toISOString());
  const yesterday1 = family("y1", new Date(NOW - DAY - 1000).toISOString());
  const prev7_1 = family("p7_1", new Date(NOW - 3 * DAY).toISOString());
  const older1 = family("older1", new Date(NOW - 30 * DAY).toISOString());

  const buckets = bucketFamilies([today1, today2, yesterday1, prev7_1, older1], NOW);

  assert.deepEqual(buckets.map((b) => b.label), ["Today", "Yesterday", "Previous 7 Days", "Older"]);
  assert.deepEqual(buckets[0].families, [today1, today2]);
  assert.deepEqual(buckets[1].families, [yesterday1]);
  assert.deepEqual(buckets[2].families, [prev7_1]);
  assert.deepEqual(buckets[3].families, [older1]);
});

test("omits empty buckets", () => {
  const today1 = family("today1", new Date(NOW - 1000).toISOString());
  const buckets = bucketFamilies([today1], NOW);
  assert.deepEqual(buckets.map((b) => b.label), ["Today"]);
});

test("preserves input order within a bucket (latest-first assumed from caller)", () => {
  const a = family("a", new Date(NOW - 500).toISOString());
  const b = family("b", new Date(NOW - 1000).toISOString());
  const buckets = bucketFamilies([a, b], NOW);
  assert.deepEqual(buckets[0].families, [a, b]);
});
