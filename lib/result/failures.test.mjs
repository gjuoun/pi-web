import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const {
  fail,
  statusForFailure,
  errorMessage,
  API_FAILURE_STATUS,
} = await createJiti(import.meta.url).import("./failures.ts");

test("failure catalog constructs each variant with code and message", () => {
  const cases = [
    ["badRequest", "bad_request"],
    ["unauthorized", "unauthorized"],
    ["notFound", "not_found"],
    ["conflict", "conflict"],
    ["payloadTooLarge", "payload_too_large"],
    ["unsupportedMediaType", "unsupported_media_type"],
    ["upstream", "upstream"],
    ["internal", "internal"],
  ];
  for (const [factory, code] of cases) {
    const failure = fail[factory]("boom");
    assert.equal(failure.code, code);
    assert.equal(failure.message, "boom");
  }
});

test("failure options carry extra fields and headers", () => {
  const failure = fail.notFound("Session not found", {
    fields: { code: "prompt_rejected", accepted: false },
    headers: { "X-Reason": "gone" },
  });
  assert.equal(failure.fields?.code, "prompt_rejected");
  assert.equal(failure.fields?.accepted, false);
  assert.equal(failure.headers?.["X-Reason"], "gone");
});

test("statusForFailure maps every catalog code to its HTTP status", () => {
  assert.equal(statusForFailure(fail.badRequest("x")), API_FAILURE_STATUS.bad_request);
  assert.equal(statusForFailure(fail.badRequest("x")), 400);
  assert.equal(statusForFailure(fail.unauthorized("x")), 401);
  assert.equal(statusForFailure(fail.notFound("x")), 404);
  assert.equal(statusForFailure(fail.conflict("x")), 409);
  assert.equal(statusForFailure(fail.payloadTooLarge("x")), 413);
  assert.equal(statusForFailure(fail.unsupportedMediaType("x")), 415);
  assert.equal(statusForFailure(fail.upstream("x")), 502);
  assert.equal(statusForFailure(fail.internal("x")), 500);
});

test("API_FAILURE_STATUS covers exactly the catalog codes", () => {
  assert.deepEqual(
    Object.keys(API_FAILURE_STATUS).sort(),
    [
      "bad_request",
      "conflict",
      "internal",
      "not_found",
      "payload_too_large",
      "unauthorized",
      "unsupported_media_type",
      "upstream",
    ],
  );
});

test("errorMessage extracts Error messages and stringifies everything else", () => {
  assert.equal(errorMessage(new Error("nope")), "nope");
  assert.equal(errorMessage("plain"), "plain");
  assert.equal(errorMessage(42), "42");
  assert.equal(errorMessage({ toString: () => "obj" }), "obj");
});
