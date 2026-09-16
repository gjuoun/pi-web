import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { POST: postCommand, GET: getAgentState } = await jiti.import("./[id]/route.ts");

const unknownId = "00000000-0000-4000-8000-000000000000";

function post(id, body) {
  return postCommand(
    new Request(`http://x/api/agent/${id}`, {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) },
  );
}

test("POST unknown session returns 404 with the error envelope", async () => {
  const res = await post(unknownId, JSON.stringify({ type: "get_state" }));
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "Session not found");
  assert.equal(body.code, undefined);
});

test("POST unknown session with a prompt marks it rejected", async () => {
  const res = await post(unknownId, JSON.stringify({ type: "prompt", message: "hi" }));
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    error: "Session not found",
    code: "prompt_rejected",
    accepted: false,
  });
});

test("POST malformed JSON returns 400 with an error message", async () => {
  const res = await post(unknownId, "not json at all");
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(typeof body.error === "string" && body.error.length > 0);
});

test("POST set_tools is rejected with 400", async () => {
  const res = await post(unknownId, JSON.stringify({ type: "set_tools", tools: ["read"] }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /set_tools/);
});

test("GET unknown session reports not running", async () => {
  const res = await getAgentState(new Request(`http://x/api/agent/${unknownId}`), {
    params: Promise.resolve({ id: unknownId }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { running: false });
});
