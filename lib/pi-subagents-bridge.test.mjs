import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  createPiSubagentsBridgeExtension,
  isPiSubagentsEngineReady,
  listPiSubagentRuns,
  resetPiSubagentBridgesForTests,
  spawnPiSubagent,
} = await jiti.import("./pi-subagents-bridge.ts");
const { SUBAGENT_META_TYPE, SUBAGENT_RESULT_TYPE, SUBAGENT_STATUS_TYPE } = await jiti.import("./subagents.ts");

const MANAGER_KEY = Symbol.for("pi-subagents:manager");
const MANAGERS_KEY = Symbol.for("pi-subagents:managers");
const PARENT_ID = "parent-session";
const PARENT_FILE = "/tmp/parent.jsonl";

/** Minimal bus: `on`/`emit` only, which is all the package and the bridge use. */
function createBus() {
  const handlers = new Map();
  return {
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () => {};
    },
    emit(event, data) {
      for (const handler of handlers.get(event) ?? []) handler(data);
    },
  };
}

function createFixture({ legacySlot = true, perSession = true } = {}) {
  const bus = createBus();
  const records = new Map();
  const attached = [];
  const stamped = [];
  const entry = { getRecord: (id) => records.get(id) };
  // The patched package publishes one entry per session id; the unpatched one only has the slot.
  globalThis[MANAGERS_KEY] = perSession ? new Map([[PARENT_ID, entry]]) : undefined;
  if (legacySlot) globalThis[MANAGER_KEY] = entry;
  else delete globalThis[MANAGER_KEY];
  resetPiSubagentBridgesForTests();
  const extension = createPiSubagentsBridgeExtension({
    getParentSessionId: () => PARENT_ID,
    getParentSessionFile: () => PARENT_FILE,
    attachSession: (inner) => attached.push(inner),
  });
  extension.factory({ events: bus });
  return { bus, records, attached, stamped, extension };
}

/** A record as the package exposes it once the child session exists. */
function childRecord(runId, stamped) {
  return {
    sessionFile: `/tmp/${runId}.jsonl`,
    session: {
      sessionId: `child-${runId}`,
      sessionManager: {
        appendCustomEntry(type, data) {
          stamped.push({ type, data });
        },
      },
    },
  };
}

test("reports the engine as unavailable until the package announces itself", async () => {
  const { bus } = createFixture();
  assert.equal(isPiSubagentsEngineReady(PARENT_ID), false);
  await assert.rejects(() => spawnPiSubagent(PARENT_ID, "finder", "task"), /not available/);

  bus.emit("subagents:ready", {});
  assert.equal(isPiSubagentsEngineReady(PARENT_ID), true);
  assert.deepEqual(listPiSubagentRuns(PARENT_ID), []);
});

test("records a started run and attaches the live child session", async () => {
  const { bus, records, attached, stamped } = createFixture();
  bus.emit("subagents:ready", {});
  records.set("run-1", childRecord("run-1", stamped));

  bus.emit("subagents:started", { id: "run-1", type: "finder", description: "search the repo" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  const [run] = listPiSubagentRuns(PARENT_ID);
  assert.equal(run.runId, "run-1");
  assert.equal(run.status, "running");
  assert.equal(run.profile, "finder");
  assert.equal(run.description, "search the repo");
  assert.equal(run.sessionFile, "/tmp/run-1.jsonl");
  assert.equal(run.childSessionId, "child-run-1");

  // the live session is registered with pi-web (attach), and pi-web's own markers are stamped
  assert.equal(attached.length, 1);
  assert.equal(attached[0].sessionId, "child-run-1");
  const meta = stamped.find((entry) => entry.type === SUBAGENT_META_TYPE);
  assert.equal(meta.data.version, 1);
  assert.equal(meta.data.parentSessionId, PARENT_ID);
  assert.equal(meta.data.parentSessionPath, PARENT_FILE);
  assert.equal(meta.data.profile, "finder");
  // without an explicit status entry pi-web's reader can only say "interrupted" for a live run
  assert.deepEqual(stamped.find((entry) => entry.type === SUBAGENT_STATUS_TYPE).data, { version: 1, status: "running" });
});

test("a settled run keeps the package's terminal status and stamps a result", async () => {
  const { bus, records, stamped } = createFixture();
  bus.emit("subagents:ready", {});
  records.set("run-2", childRecord("run-2", stamped));
  bus.emit("subagents:started", { id: "run-2", type: "finder", description: "search" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  bus.emit("subagents:completed", {
    id: "run-2",
    type: "finder",
    description: "search",
    status: "steered",
    result: "OK",
    toolUses: 3,
    durationMs: 1500,
  });

  const [run] = listPiSubagentRuns(PARENT_ID);
  assert.equal(run.status, "steered");
  assert.equal(run.result, "OK");
  assert.equal(run.toolUses, 3);
  assert.equal(run.durationMs, 1500);
  const result = stamped.filter((entry) => entry.type === SUBAGENT_RESULT_TYPE).at(-1);
  // pi-web's reader only understands completed | failed | aborted for a settled child
  assert.equal(result.data.status, "completed");
  assert.equal(result.data.result, "OK");
});

test("a failed run is recorded as an error with the package's message", async () => {
  const { bus, records, stamped } = createFixture();
  bus.emit("subagents:ready", {});
  records.set("run-3", childRecord("run-3", stamped));
  bus.emit("subagents:started", { id: "run-3", type: "worker", description: "edit" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  bus.emit("subagents:failed", { id: "run-3", type: "worker", description: "edit", status: "error", error: "model exploded" });
  const [run] = listPiSubagentRuns(PARENT_ID);
  assert.equal(run.status, "error");
  assert.equal(run.error, "model exploded");
  assert.equal(stamped.filter((entry) => entry.type === SUBAGENT_RESULT_TYPE).at(-1).data.status, "failed");
});

test("spawn goes over the package's RPC channel and resolves with the run id", async () => {
  const { bus } = createFixture();
  bus.emit("subagents:ready", {});

  let request;
  bus.on("subagents:rpc:spawn", (payload) => { request = payload; });
  const pending = spawnPiSubagent(PARENT_ID, "finder", "find the loader", { description: "find", maxTurns: 2, runInBackground: true });

  assert.equal(request.type, "finder");
  assert.equal(request.prompt, "find the loader");
  // the bus takes the package's own option names, not the tool/frontmatter spellings
  assert.deepEqual(request.options, { description: "find", maxTurns: 2, isBackground: true });

  bus.emit(`subagents:rpc:spawn:reply:${request.requestId}`, { success: true, data: { id: "run-4" } });
  assert.deepEqual(await pending, { runId: "run-4" });
  assert.equal(listPiSubagentRuns(PARENT_ID).at(0).runId, "run-4");
});

test("a rejected spawn surfaces the package's error message", async () => {
  const { bus } = createFixture();
  bus.emit("subagents:ready", {});
  let request;
  bus.on("subagents:rpc:spawn", (payload) => { request = payload; });
  const pending = spawnPiSubagent(PARENT_ID, "nope", "task");
  bus.emit(`subagents:rpc:spawn:reply:${request.requestId}`, { success: false, error: 'Unknown or disabled agent type: "nope"' });
  await assert.rejects(() => pending, /Unknown or disabled agent type/);
});

test("resolves records through the per-session registry, not the single slot", async () => {
  // The shape a long-lived host has: the single slot belongs to another session's activation.
  const { bus, records, attached, stamped } = createFixture({ legacySlot: false });
  bus.emit("subagents:ready", {});
  records.set("run-map", childRecord("run-map", stamped));

  bus.emit("subagents:started", { id: "run-map", type: "finder", description: "per session" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  const [run] = listPiSubagentRuns(PARENT_ID);
  assert.equal(run.sessionFile, "/tmp/run-map.jsonl");
  assert.equal(attached.length, 1);
  assert.ok(stamped.some((entry) => entry.type === SUBAGENT_META_TYPE));
});

test("falls back to the single slot on an unpatched package", async () => {
  const { bus, records, attached, stamped } = createFixture({ perSession: false });
  bus.emit("subagents:ready", {});
  records.set("run-slot", childRecord("run-slot", stamped));

  bus.emit("subagents:started", { id: "run-slot", type: "finder", description: "legacy slot" });
  await new Promise((resolve) => setTimeout(resolve, 20));

  const [run] = listPiSubagentRuns(PARENT_ID);
  assert.equal(run.sessionFile, "/tmp/run-slot.jsonl");
  assert.equal(attached.length, 1);
});
