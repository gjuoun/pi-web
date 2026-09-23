import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { getExpandedProjects, setProjectExpanded } = await jiti.import("./sidebar-expanded-projects.ts");

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
  };
}

test("absent entries default to collapsed", () => {
  const storage = memoryStorage();
  assert.deepEqual(getExpandedProjects(storage), new Set());
});

test("setProjectExpanded persists and getExpandedProjects reflects it", () => {
  const storage = memoryStorage();
  setProjectExpanded("proj-a", true, storage);
  assert.deepEqual(getExpandedProjects(storage), new Set(["proj-a"]));

  setProjectExpanded("proj-b", true, storage);
  assert.deepEqual(getExpandedProjects(storage), new Set(["proj-a", "proj-b"]));
});

test("collapsing a project removes it from the expanded set", () => {
  const storage = memoryStorage();
  setProjectExpanded("proj-a", true, storage);
  setProjectExpanded("proj-a", false, storage);
  assert.deepEqual(getExpandedProjects(storage), new Set());
});

test("no storage available returns an empty set and is a no-op on write", () => {
  assert.deepEqual(getExpandedProjects(null), new Set());
  setProjectExpanded("proj-a", true, null); // should not throw
});

test("corrupt storage content falls back to empty", () => {
  const storage = memoryStorage();
  storage.setItem("pi-web:sidebar-expanded-projects", "not json");
  assert.deepEqual(getExpandedProjects(storage), new Set());
});
