import assert from "node:assert/strict";
import test from "node:test";
import { collapseHomePath } from "./path-display.ts";

test("collapses a home prefix to a tilde like pi's footer", () => {
  assert.equal(collapseHomePath("/Users/junguo/code/gjuoun/pi-web", "/Users/junguo"), "~/code/gjuoun/pi-web");
  assert.equal(collapseHomePath("/Users/junguo", "/Users/junguo"), "~");
});

test("leaves paths outside home, and paths without a home directory, untouched", () => {
  assert.equal(collapseHomePath("/opt/data", "/Users/junguo"), "/opt/data");
  assert.equal(collapseHomePath("/Users/junguo/code", ""), "/Users/junguo/code");
  assert.equal(collapseHomePath("/Users/junguo/code", null), "/Users/junguo/code");
  assert.equal(collapseHomePath("", "/Users/junguo"), "");
});

test("does not collapse a sibling directory that merely shares the home prefix", () => {
  // `/Users/junguo2` must not become `~2`.
  assert.equal(collapseHomePath("/Users/junguo2/code", "/Users/junguo"), "/Users/junguo2/code");
});
