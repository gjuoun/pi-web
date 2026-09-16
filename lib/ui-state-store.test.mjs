import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { getUiState, setUiState, resetUiStateStore, useUiState } = await jiti.import("./ui-state-store.ts");
const { defaultUiState, setProjectExpanded } = await jiti.import("./ui-state.ts");
const { openTab, emptyTabSet } = await jiti.import("./session-tabs.ts");

test("starts from the defaults and exposes a hook plus a getter", () => {
  assert.equal(typeof useUiState, "function");
  assert.deepEqual(getUiState().pinned, []);
  assert.deepEqual(getUiState().tabs.tabs, []);
  assert.equal(getUiState().version, defaultUiState().version);
});

test("setUiState replaces the shared copy", () => {
  setUiState(setProjectExpanded(getUiState(), "p:a", false));
  assert.equal(getUiState().projectOverrides["p:a"], "collapsed");
});

test("a functional update sees the current state", () => {
  setUiState((current) => ({ ...current, pinned: [...current.pinned, "s1"] }));
  assert.deepEqual(getUiState().pinned, ["s1"]);
});

test("an identical object is a no-op so subscribers are not woken for nothing", () => {
  const before = getUiState();
  setUiState(before);
  assert.equal(getUiState(), before);
});

test("both halves of the state survive each other: tabs and expansion are one payload", () => {
  setUiState((current) => ({
    ...current,
    tabs: openTab(current.tabs, { sessionId: "s9", projectKey: "p:a", title: "nine" }),
  }));
  setUiState((current) => setProjectExpanded(current, "p:b", false));
  const state = getUiState();
  assert.deepEqual(state.tabs.tabs.map((tab) => tab.sessionId), ["s9"]);
  assert.equal(state.projectOverrides["p:b"], "collapsed");
  assert.equal(state.projectOverrides["p:a"], "collapsed");
});

test("resetUiStateStore restores the defaults, and unrelated sessions do not leak across a reset", () => {
  resetUiStateStore();
  const state = getUiState();
  assert.deepEqual(state.tabs, emptyTabSet());
  assert.deepEqual(state.pinned, []);
  assert.deepEqual(state.projectOverrides, {});
});
