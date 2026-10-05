import assert from "node:assert/strict";
import test from "node:test";

const { loadRecentDirectories, pushRecentDirectory, RECENT_DIRECTORIES_LIMIT } =
  await import("./recent-directories.ts");

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

test("defaults to an empty recent list", () => {
  assert.deepEqual(loadRecentDirectories(createStorage()), []);
});

test("pushes most-recent-first", () => {
  const storage = createStorage();
  pushRecentDirectory("/a", storage);
  pushRecentDirectory("/b", storage);
  assert.deepEqual(loadRecentDirectories(storage), ["/b", "/a"]);
});

test("dedupes by moving an existing path back to the front", () => {
  const storage = createStorage();
  pushRecentDirectory("/a", storage);
  pushRecentDirectory("/b", storage);
  pushRecentDirectory("/a", storage);
  assert.deepEqual(loadRecentDirectories(storage), ["/a", "/b"]);
});

test("caps the list at the exported limit", () => {
  const storage = createStorage();
  for (let index = 0; index < RECENT_DIRECTORIES_LIMIT + 4; index += 1) {
    pushRecentDirectory(`/dir-${index}`, storage);
  }
  const recent = loadRecentDirectories(storage);
  assert.equal(recent.length, RECENT_DIRECTORIES_LIMIT);
  assert.equal(recent[0], `/dir-${RECENT_DIRECTORIES_LIMIT + 3}`);
});

test("ignores a blank path and an unavailable storage handle", () => {
  const storage = createStorage();
  assert.deepEqual(pushRecentDirectory("   ", storage), []);
  assert.deepEqual(pushRecentDirectory("/a", null), []);
  assert.deepEqual(loadRecentDirectories(null), []);
});

test("survives malformed JSON and non-string entries", () => {
  assert.deepEqual(loadRecentDirectories(createStorage({ "pi-web:recent-directories": "{oops" })), []);
  assert.deepEqual(loadRecentDirectories(createStorage({ "pi-web:recent-directories": '"nope"' })), []);
  assert.deepEqual(
    loadRecentDirectories(createStorage({ "pi-web:recent-directories": '["/a", 7, null, "/b"]' })),
    ["/a", "/b"],
  );
});
