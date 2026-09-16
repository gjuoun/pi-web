import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { GET: getEvents } = await jiti.import("./[id]/events/route.ts");

const unknownId = "00000000-0000-4000-8000-000000000000";

test("GET events for an unknown session returns a 404 JSON envelope", async () => {
  const res = await getEvents(new Request(`http://x/api/agent/${unknownId}/events`), {
    params: Promise.resolve({ id: unknownId }),
  });
  assert.equal(res.status, 404);
  assert.ok((res.headers.get("content-type") ?? "").includes("json"));
  assert.equal((await res.json()).error, "Session not found");
});
