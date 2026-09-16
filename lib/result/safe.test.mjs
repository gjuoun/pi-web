import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const { safeJsonParse, safeSync, safeReadFileText, safeRequestJson, safeAsync } = await createJiti(
  import.meta.url,
).import("./safe.ts");

test("safeJsonParse returns ok for valid JSON and err for invalid", () => {
  const good = safeJsonParse('{"a":1}');
  assert.equal(good.isOk(), true);
  assert.deepEqual(green(good), { a: 1 });
  const bad = safeJsonParse("{not json");
  assert.equal(bad.isErr(), true);
  assert.equal(typeof red(bad), "string");
  assert.ok(red(bad).length > 0);
});

test("safeSync absorbs throws from sync functions", () => {
  assert.equal(green(safeSync(() => 7)), 7);
  const err = safeSync(() => {
    throw new Error("kaboom");
  });
  assert.equal(red(err), "kaboom");
});

test("safeReadFileText reads an existing file and errs on a missing one", async () => {
  const dir = await mkdtemp(join(tmpdir(), "safe-read-"));
  try {
    const path = join(dir, "f.txt");
    await writeFile(path, "hello", "utf8");
    assert.equal(green(await safeReadFileText(path)), "hello");
    const missing = await safeReadFileText(join(dir, "nope.txt"));
    assert.equal(missing.isErr(), true);
    assert.match(red(missing), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("safeAsync absorbs async throws", async () => {
  assert.equal(green(await safeAsync(() => Promise.resolve("done"))), "done");
  const failed = await safeAsync(() => Promise.reject(new Error("async boom")));
  assert.equal(red(failed), "async boom");
});

test("safeRequestJson parses a request body and errs on malformed JSON", async () => {
  const good = await safeRequestJson(new Request("http://x/", {
    method: "POST",
    body: '{"b":2}',
    headers: { "content-type": "application/json" },
  }));
  assert.deepEqual(green(good), { b: 2 });
  const bad = await safeRequestJson(new Request("http://x/", {
    method: "POST",
    body: "not json",
    headers: { "content-type": "application/json" },
  }));
  assert.equal(bad.isErr(), true);
  assert.equal(typeof red(bad), "string");
});

function green(result) {
  assert.equal(result.isOk(), true);
  return result.isOk() ? result.value : undefined;
}

function red(result) {
  assert.equal(result.isErr(), true);
  return result.isErr() ? result.error : undefined;
}
