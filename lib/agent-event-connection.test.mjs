import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { AgentEventConnection } = await jiti.import("./agent-event-connection.ts");

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

class FakeEventSource {
  readyState = CONNECTING;
  onmessage = null;
  onerror = null;
  closeCount = 0;

  open() { this.readyState = OPEN; }
  message(event) { this.onmessage?.({ data: JSON.stringify(event) }); }
  error() {
    this.readyState = CLOSED;
    this.onerror?.(new Event("error"));
  }
  close() {
    this.readyState = CLOSED;
    this.closeCount += 1;
  }
}

function createHarness({ readinessTimeoutMs = 100, reconnectDelayMs = 5 } = {}) {
  const sources = [];
  const events = [];
  const unexpectedErrors = [];
  let activeSession = "session-a";
  let demand = false;
  const connection = new AgentEventConnection({
    createSource(sessionId) {
      const source = new FakeEventSource();
      source.sessionId = sessionId;
      sources.push(source);
      return source;
    },
    onEvent(event) { events.push(event); },
    shouldMaintain: (sessionId) => demand && sessionId === activeSession,
    readinessTimeoutMs,
    reconnectDelayMs,
    onUnexpectedError(error) { unexpectedErrors.push(error); },
  });
  return {
    connection,
    sources,
    events,
    unexpectedErrors,
    setActiveSession(sessionId) { activeSession = sessionId; },
    setDemand(value) { demand = value; },
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("shares one source and waits past the former transport deadline", async () => {
  const { connection, sources, events } = createHarness();
  const first = connection.ensureConnected("session-a");
  const second = connection.ensureConnected("session-a");

  assert.equal(sources.length, 1);
  sources[0].open();
  await wait(20);
  sources[0].message({ type: "connected" });
  await Promise.all([first, second]);

  sources[0].message({ type: "agent_start" });
  assert.deepEqual(events.map((event) => event.type), ["connected", "agent_start"]);
});

test("times out all waiters and closes the stalled source", async () => {
  const { connection, sources } = createHarness({ readinessTimeoutMs: 10 });
  const first = connection.ensureConnected("session-a");
  const second = connection.ensureConnected("session-a");

  await assert.rejects(first, (error) => error.status === "ready_timeout");
  await assert.rejects(second, (error) => error.status === "ready_timeout");
  assert.equal(sources[0].closeCount, 1);
});

test("manual close rejects waiters and isolates late events", async () => {
  const { connection, sources, events } = createHarness();
  const abandoned = connection.ensureConnected("session-a");
  const oldSource = sources[0];
  connection.close();
  await assert.rejects(abandoned, (error) => error.status === "closed");

  const replacement = connection.ensureConnected("session-a");
  oldSource.open();
  oldSource.message({ type: "connected" });
  await nextTurn();
  assert.deepEqual(events, []);

  sources[1].open();
  sources[1].message({ type: "connected" });
  await replacement;
});

test("surfaces startup errors without retrying or dispatching them", async () => {
  const { connection, sources, events } = createHarness();
  const ready = connection.ensureConnected("session-a");
  sources[0].open();
  sources[0].message({ type: "startup_error", errorMessage: "broken config" });

  await assert.rejects(ready, (error) => (
    error.status === "startup_error" && error.message === "broken config"
  ));
  await wait(10);
  assert.equal(sources.length, 1);
  assert.deepEqual(events, []);
});

test("replaces a previously connected CONNECTING source only once", async () => {
  const { connection, sources } = createHarness();
  const initial = connection.ensureConnected("session-a");
  sources[0].open();
  sources[0].message({ type: "connected" });
  await initial;

  sources[0].readyState = CONNECTING;
  const first = connection.ensureConnected("session-a");
  const second = connection.ensureConnected("session-a");
  await nextTurn();
  assert.equal(sources.length, 2);

  sources[1].open();
  sources[1].message({ type: "connected" });
  await Promise.all([first, second]);
});

test("passive maintenance retries a transient failure once", async () => {
  const { connection, sources, setDemand } = createHarness();
  setDemand(true);
  connection.maintain("session-a");
  sources[0].error();
  await wait(10);
  assert.equal(sources.length, 2);

  sources[1].open();
  sources[1].message({ type: "connected" });
  await wait(10);
  assert.equal(sources.length, 2);
});

test("an explicit startup error cancels a pending passive retry", async () => {
  const { connection, sources, setDemand } = createHarness();
  setDemand(true);
  connection.maintain("session-a");
  sources[0].error();

  const explicit = connection.ensureConnected("session-a");
  sources[1].open();
  sources[1].message({ type: "startup_error", errorMessage: "terminal" });
  await assert.rejects(explicit, (error) => error.status === "startup_error");
  await wait(10);
  assert.equal(sources.length, 2);
});

test("dropped demand, session switches, and close cannot revive an old retry", async () => {
  const first = createHarness();
  first.setDemand(true);
  first.connection.maintain("session-a");
  first.sources[0].error();
  first.setDemand(false);
  await wait(10);
  assert.equal(first.sources.length, 1);

  const second = createHarness();
  second.setDemand(true);
  second.connection.maintain("session-a");
  second.sources[0].error();
  second.setActiveSession("session-b");
  const ready = second.connection.ensureConnected("session-b");
  second.sources[1].open();
  second.sources[1].message({ type: "connected" });
  await ready;
  await wait(10);
  assert.equal(second.sources.length, 2);

  const closed = createHarness();
  closed.setDemand(true);
  closed.connection.maintain("session-a");
  closed.sources[0].error();
  closed.connection.close();
  await wait(10);
  assert.equal(closed.sources.length, 1);
});

// ── acquire/release: the ownership contract the hook uses ─────────────────────────────────────
// React StrictMode double-mounts an effect as acquire → release → acquire. The manager must treat
// that as churn and keep one live source, because effect/cleanup ordering is not specified and no
// sibling flag may decide whether a reconnect happens (docs/adr, prospector research 2026-09-14).

test("a StrictMode acquire/release/acquire cycle keeps one live source", async () => {
  const harness = createHarness();
  const releaseFirst = harness.connection.acquire("session-a");
  await nextTurn();
  harness.sources[0].open();
  harness.sources[0].message({ type: "connected" });

  releaseFirst();
  const releaseSecond = harness.connection.acquire("session-a");
  await wait(40);

  assert.equal(harness.sources.length, 1, "no second EventSource was constructed");
  assert.equal(harness.sources[0].closeCount, 0, "the live source survived the cycle");

  harness.sources[0].message({ type: "message_update", value: 1 });
  assert.equal(harness.events.filter((e) => e.type === "message_update").length, 1);
  releaseSecond();
});

test("the last release closes the source only after the grace window", async () => {
  const harness = createHarness();
  const release = harness.connection.acquire("session-a");
  await nextTurn();
  harness.sources[0].open();
  harness.sources[0].message({ type: "connected" });

  release();
  assert.equal(harness.sources[0].closeCount, 0, "closing is deferred, not immediate");
  await wait(60);
  assert.equal(harness.sources[0].closeCount, 1, "the idle source is closed after the grace");
});

test("a release is idempotent and cannot close a stream another holder still needs", async () => {
  const harness = createHarness();
  const releaseA = harness.connection.acquire("session-a");
  const releaseB = harness.connection.acquire("session-a");
  await nextTurn();
  harness.sources[0].open();
  harness.sources[0].message({ type: "connected" });

  releaseA();
  releaseA();
  releaseA();
  await wait(60);

  assert.equal(harness.sources[0].closeCount, 0, "a double release must not drop the other holder");
  releaseB();
  await wait(60);
  assert.equal(harness.sources[0].closeCount, 1);
});

test("acquiring another session switches immediately and a stale release is inert", async () => {
  const harness = createHarness();
  const releaseOld = harness.connection.acquire("session-a");
  await nextTurn();
  harness.sources[0].open();
  harness.sources[0].message({ type: "connected" });

  const releaseNew = harness.connection.acquire("session-b");
  await nextTurn();
  harness.sources[1].open();
  harness.sources[1].message({ type: "connected" });

  assert.equal(harness.sources[0].closeCount, 1, "the previous session's source closed at once");
  assert.equal(harness.sources[1].sessionId, "session-b");

  releaseOld();
  await wait(60);
  assert.equal(harness.sources[1].closeCount, 0, "a stale release cannot close the new session");
  releaseNew();
  await wait(60);
  assert.equal(harness.sources[1].closeCount, 1);
});

test("a held connection retries a transient failure without any external predicate", async () => {
  const harness = createHarness();
  const release = harness.connection.acquire("session-a");
  await nextTurn();
  harness.sources[0].error();
  await wait(40);

  assert.equal(harness.sources.length, 2, "the manager reconnected on its own");
  harness.sources[1].open();
  harness.sources[1].message({ type: "connected" });
  release();
});
