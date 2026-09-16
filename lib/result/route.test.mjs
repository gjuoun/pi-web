import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { ok, err } from "neverthrow";

const { respondJson, failureResponse } = await createJiti(import.meta.url).import("./route.ts");
const { fail } = await createJiti(import.meta.url).import("./failures.ts");

const req = () => new Request("http://x/api/test");

test("respondJson renders a bare success body by default", async () => {
  const res = respondJson(req(), ok({ sessions: [1, 2] }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sessions: [1, 2] });
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("respondJson wraps success as {success,data} when wrapSuccess is set", async () => {
  const res = respondJson(req(), ok({ state: 1 }), { wrapSuccess: true });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, data: { state: 1 } });
});

test("respondJson renders a failure with status, envelope, and no-store", async () => {
  const res = respondJson(req(), err(fail.notFound("Session not found")));
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Session not found" });
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("respondJson merges failure fields into the error body (prompt_rejected shape)", async () => {
  const res = respondJson(req(), err(fail.notFound("Session not found", {
    fields: { code: "prompt_rejected", accepted: false },
  })));
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    error: "Session not found",
    code: "prompt_rejected",
    accepted: false,
  });
});

test("respondJson merges failure headers on top of no-store", async () => {
  const res = respondJson(req(), err(fail.internal("x", { headers: { "X-Reason": "bug" } })));
  assert.equal(res.status, 500);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("X-Reason"), "bug");
});

test("failureResponse renders only the failure side for non-JSON-body routes", async () => {
  const res = failureResponse(fail.notFound("Session not found"));
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Session not found" });
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("respondJson is total: it never throws for any Result", () => {
  for (const result of [ok(1), ok(null), ok(undefined), err(fail.badRequest("x")), err(fail.upstream("y"))]) {
    const res = respondJson(req(), result);
    assert.ok(res instanceof Response);
  }
});
