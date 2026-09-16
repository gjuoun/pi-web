import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  UI_STATE_KEY,
  defaultUiState,
  loadUiState,
  saveUiState,
  projectExpanded,
  setProjectExpanded,
  togglePinned,
  toggleArchived,
  isPinned,
  isArchived,
  resolveTabs,
} = await jiti.import("./ui-state.ts");

const { openTab, emptyTabSet } = await jiti.import("./session-tabs.ts");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("defaultUiState starts empty with no overrides", () => {
  const state = defaultUiState();
  assert.deepEqual(state.pinned, []);
  assert.deepEqual(state.archived, []);
  assert.deepEqual(state.projectOverrides, {});
  assert.deepEqual(resolveTabs(state, []).tabs, []);
});

test("save then load round-trips tabs, overrides, pins and archive", () => {
  const storage = createStorage();
  let state = defaultUiState();
  state = { ...state, tabs: openTab(emptyTabSet(), { sessionId: "s1", projectKey: "p:a", title: "one" }) };
  state = setProjectExpanded(state, "p:b", false);
  state = togglePinned(state, "s1");
  state = toggleArchived(state, "s9");
  saveUiState(state, storage);

  const loaded = loadUiState(storage);
  assert.deepEqual(resolveTabs(loaded, ["s1"]).tabs.map((tab) => tab.sessionId), ["s1"]);
  assert.equal(resolveTabs(loaded, ["s1"]).activeId, "s1");
  assert.equal(projectExpanded(loaded, "p:b"), false);
  assert.equal(isPinned(loaded, "s1"), true);
  assert.equal(isArchived(loaded, "s9"), true);
  assert.equal(storage.values.has(UI_STATE_KEY), true);
});

test("loadUiState degrades to defaults on junk, wrong version or malformed tabs", () => {
  assert.deepEqual(loadUiState(createStorage()).pinned, []);
  assert.deepEqual(loadUiState(createStorage({ [UI_STATE_KEY]: "{not json" })).pinned, []);
  assert.deepEqual(loadUiState(createStorage({ [UI_STATE_KEY]: `"a string"` })).pinned, []);
  assert.deepEqual(loadUiState(createStorage({ [UI_STATE_KEY]: `{"version":99}` })).projectOverrides, {});
  const malformedTabs = loadUiState(createStorage({ [UI_STATE_KEY]: `{"version":1,"tabs":"junk"}` }));
  assert.deepEqual(resolveTabs(malformedTabs, ["s1"]).tabs, []);
});

test("every project is expanded by default", () => {
  const state = defaultUiState();
  assert.equal(projectExpanded(state, "p:a"), true);
  assert.equal(projectExpanded(state, "never-seen-before"), true);
});

test("an explicit collapse is the only thing that hides a project", () => {
  const collapsed = setProjectExpanded(defaultUiState(), "p:a", false);
  assert.equal(projectExpanded(collapsed, "p:a"), false);
  assert.equal(projectExpanded(collapsed, "p:b"), true);
});

test("re-expanding a collapsed project restores it", () => {
  let state = setProjectExpanded(defaultUiState(), "p:a", false);
  state = setProjectExpanded(state, "p:a", true);
  assert.equal(projectExpanded(state, "p:a"), true);
});

test("pins and archive toggle without duplicating ids", () => {
  let state = togglePinned(defaultUiState(), "s1");
  state = togglePinned(state, "s1");
  assert.deepEqual(state.pinned, []);
  state = toggleArchived(toggleArchived(state, "s2"), "s2");
  assert.deepEqual(state.archived, []);
  state = toggleArchived(state, "s3");
  assert.equal(isArchived(state, "s3"), true);
});

test("loadUiState drops non-string and empty ids from every list", () => {
  const raw = JSON.stringify({
    version: 1,
    pinned: ["s1", "", 42, null],
    archived: [null, "s2"],
    projectOverrides: { "p:a": "collapsed", "p:b": "weird", "p:c": 7 },
  });
  const state = loadUiState(createStorage({ [UI_STATE_KEY]: raw }));
  assert.deepEqual(state.pinned, ["s1"]);
  assert.deepEqual(state.archived, ["s2"]);
  assert.deepEqual(state.projectOverrides, { "p:a": "collapsed" });
});

test("storage failures never throw and never lose the in-memory state", () => {
  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(loadUiState(blocked).pinned, []);
  assert.doesNotThrow(() => saveUiState(togglePinned(defaultUiState(), "s1"), blocked));
  assert.deepEqual(togglePinned(defaultUiState(), "s1").pinned, ["s1"]);
});
