import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
const { GET } = await jiti.import("./route.ts");
const { resetPiSubagentBridgesForTests } = await jiti.import("../../../../lib/pi-subagents-bridge.ts");

function seed(sessionId, { ready = true, runs = [] } = {}) {
  resetPiSubagentBridgesForTests();
  const registry = globalThis.__piSubagentBridges;
  registry.set(sessionId, { isReady: () => ready, list: () => runs, spawn: async () => ({ runId: "x" }) });
}

test("reports the runs of one session, newest first", async () => {
  seed("session-1", {
    runs: [
      { runId: "b", parentSessionId: "session-1", profile: "worker", description: "later", status: "running", startedAt: "2026-09-14T00:00:10.000Z" },
      { runId: "a", parentSessionId: "session-1", profile: "finder", description: "earlier", status: "completed", startedAt: "2026-09-14T00:00:00.000Z" },
    ],
  });

  const response = await GET(new Request("http://localhost/api/pi-subagents/runs?sessionId=session-1"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.engineReady, true);
  assert.deepEqual(body.runs.map((run) => run.runId), ["b", "a"]);
});

test("says the engine is not ready when the session never announced itself", async () => {
  seed("session-1", { ready: false });
  const response = await GET(new Request("http://localhost/api/pi-subagents/runs?sessionId=session-1"));
  const body = await response.json();
  assert.equal(body.engineReady, false);
  assert.deepEqual(body.runs, []);
});

test("an unknown session is not an error — it simply has no runs", async () => {
  resetPiSubagentBridgesForTests();
  const response = await GET(new Request("http://localhost/api/pi-subagents/runs?sessionId=nobody"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { engineReady: false, runs: [] });
});

test("requires a sessionId", async () => {
  const response = await GET(new Request("http://localhost/api/pi-subagents/runs"));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /sessionId is required/);
});
