import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  MAX_TABS,
  emptyTabSet,
  openTab,
  closeTab,
  selectTab,
  cycleTab,
  serializeTabs,
  restoreTabs,
} = await jiti.import("./session-tabs.ts");

const tab = (sessionId, projectKey = "project:a", title = sessionId) => ({ sessionId, projectKey, title });
const ids = (set) => set.tabs.map((entry) => entry.sessionId);

test("openTab adds a tab and activates it", () => {
  const set = openTab(emptyTabSet(), tab("s1"));
  assert.deepEqual(ids(set), ["s1"]);
  assert.equal(set.activeId, "s1");
});

test("openTab focuses an already-open session instead of duplicating it", () => {
  let set = openTab(emptyTabSet(), tab("s1"));
  set = openTab(set, tab("s2"));
  set = openTab(set, tab("s1", "project:b", "renamed"));
  assert.deepEqual(ids(set), ["s1", "s2"]);
  assert.equal(set.activeId, "s1");
  assert.equal(set.tabs[0].title, "renamed");
});

test("openTab past the cap drops the oldest tab that is not active", () => {
  let set = emptyTabSet();
  for (let i = 0; i < MAX_TABS + 1; i++) set = openTab(set, tab(`s${i}`));
  assert.equal(set.tabs.length, MAX_TABS);
  assert.equal(ids(set).includes("s0"), false);
  assert.equal(set.activeId, `s${MAX_TABS}`);
});

test("closeTab activates the next tab", () => {
  let set = openTab(openTab(openTab(emptyTabSet(), tab("s1")), tab("s2")), tab("s3"));
  set = closeTab(set, "s2");
  assert.deepEqual(ids(set), ["s1", "s3"]);
  assert.equal(set.activeId, "s3");
});

test("closeTab on the last tab falls back to the previous tab", () => {
  let set = openTab(openTab(emptyTabSet(), tab("s1")), tab("s2"));
  set = closeTab(set, "s2");
  assert.deepEqual(ids(set), ["s1"]);
  assert.equal(set.activeId, "s1");
});

test("closeTab of the only tab leaves an empty set with no active tab", () => {
  const set = closeTab(openTab(emptyTabSet(), tab("s1")), "s1");
  assert.deepEqual(ids(set), []);
  assert.equal(set.activeId, null);
});

test("selectTab ignores an unknown session id", () => {
  const set = openTab(emptyTabSet(), tab("s1"));
  assert.equal(selectTab(set, "nope"), set);
});

test("cycleTab wraps in both directions", () => {
  const set = openTab(openTab(openTab(emptyTabSet(), tab("s1")), tab("s2")), tab("s3"));
  assert.equal(cycleTab(set, 1).activeId, "s1");
  assert.equal(cycleTab(set, -1).activeId, "s2");
  assert.equal(cycleTab(emptyTabSet(), 1).activeId, null);
});

test("serialize then restore round-trips the tab set", () => {
  let set = openTab(openTab(emptyTabSet(), tab("s1")), tab("s2", "project:b", "beta one"));
  set = selectTab(set, "s1");
  const restored = restoreTabs(serializeTabs(set), ["s1", "s2"]);
  assert.deepEqual(ids(restored), ["s1", "s2"]);
  assert.equal(restored.activeId, "s1");
  assert.equal(restored.tabs[1].title, "beta one");
  assert.equal(restored.tabs[1].projectKey, "project:b");
});

test("restoreTabs drops sessions the server no longer has, repairs the active tab, and survives junk", () => {
  const raw = serializeTabs(selectTab(openTab(openTab(emptyTabSet(), tab("gone")), tab("s2")), "gone"));
  const restored = restoreTabs(raw, ["s2"]);
  assert.deepEqual(ids(restored), ["s2"]);
  assert.equal(restored.activeId, "s2");

  assert.deepEqual(ids(restoreTabs(null, ["s2"])), []);
  assert.deepEqual(ids(restoreTabs("{not json", ["s2"])), []);
  assert.deepEqual(ids(restoreTabs({ version: 99, tabs: [{ sessionId: "s2" }] }, ["s2"])), []);
  assert.deepEqual(ids(restoreTabs({ version: 1, tabs: "junk" }, ["s2"])), []);
});
