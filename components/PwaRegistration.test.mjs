import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./PwaRegistration.tsx", import.meta.url), "utf8");
const sw = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

test("production still registers the worker", () => {
  assert.match(source, /process\.env\.NODE_ENV !== "production"/);
  assert.match(source, /navigator\.serviceWorker\.register\(scriptUrl/);
  assert.match(source, /updateViaCache: "none"/);
});

test("development clears a worker left behind by a production run", () => {
  assert.match(source, /async function unregisterStaleWorker/);
  assert.match(source, /getRegistrations\(\)/);
  assert.match(source, /registration\.unregister\(\)/);
  assert.match(source, /const CACHE_PREFIX = "pi-web-"/);
  assert.match(source, /keys\.filter\(\(key\) => key\.startsWith\(CACHE_PREFIX\)\)/);
  assert.match(source, /caches\.delete\(key\)/);
});

test("the reload happens once, and only for a page the worker was controlling", () => {
  assert.match(source, /const wasControlled = Boolean\(navigator\.serviceWorker\.controller\)/);
  assert.match(source, /if \(!wasControlled\) return;/);
  assert.match(source, /if \(window\.sessionStorage\.getItem\(RESET_FLAG\)\) return;/);
  assert.match(source, /window\.sessionStorage\.setItem\(RESET_FLAG, "1"\)/);
  assert.match(source, /window\.location\.reload\(\)/);
});

test("the deleted cache prefix is the one the worker actually uses", () => {
  const workerPrefix = /const CACHE_PREFIX = "([^"]+)"/.exec(sw)?.[1];
  const clientPrefix = /const CACHE_PREFIX = "([^"]+)"/.exec(source)?.[1];
  assert.ok(workerPrefix, "public/sw.js should declare its cache prefix");
  assert.equal(clientPrefix, `${workerPrefix}-`, "the dev reset must target exactly the worker's caches");
  assert.match(sw, /`\$\{CACHE_PREFIX\}-static-\$\{CACHE_VERSION\}`/, "worker cache names must keep the prefix");
});

test("a blocked unregister cannot break the app", () => {
  assert.match(source, /\.catch\(\(\) => \{/);
  assert.match(source, /try \{[\s\S]*sessionStorage[\s\S]*\} catch \{/);
});
