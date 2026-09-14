import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const {
  readSubagentRun,
  readSubagentSessionResources,
  SUBAGENT_META_TYPE,
  SUBAGENT_STATUS_TYPE,
  SUBAGENT_RESULT_TYPE,
} = await createJiti(import.meta.url).import("./subagents.ts");

test("persisted subagent metadata reconstructs the final run", () => {
  const entries = [
    {
      type: "custom",
      customType: SUBAGENT_META_TYPE,
      id: "meta",
      parentId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      data: {
        version: 1,
        parentSessionId: "parent",
        parentSessionPath: "/tmp/parent.jsonl",
        parentToolCallId: "tool-call",
        profile: "Explore",
        description: "Find the parser",
        task: "Locate parser code",
        runInBackground: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    },
    {
      type: "custom",
      customType: SUBAGENT_RESULT_TYPE,
      id: "result",
      parentId: "meta",
      timestamp: "2026-01-01T00:01:00.000Z",
      data: {
        version: 1,
        status: "completed",
        completedAt: "2026-01-01T00:01:00.000Z",
        result: "Located it.",
      },
    },
  ];

  assert.deepEqual(readSubagentRun(entries, "child", "/tmp/child.jsonl"), {
    sessionId: "child",
    sessionPath: "/tmp/child.jsonl",
    parentSessionId: "parent",
    parentToolCallId: "tool-call",
    profile: "Explore",
    description: "Find the parser",
    task: "Locate parser code",
    runInBackground: true,
    status: "completed",
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:01:00.000Z",
    result: "Located it.",
  });
});

test("persisted subagent resources restore the exact isolated prompt and tools", () => {
  const entries = [{
    type: "custom",
    customType: SUBAGENT_META_TYPE,
    id: "meta",
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    data: {
      version: 1,
      parentSessionId: "parent",
      parentSessionPath: "/tmp/parent.jsonl",
      profile: "reviewer",
      resourceSnapshot: {
        version: 1,
        appendSystemPrompt: ["Review carefully.", "Inherited parent context."],
        tools: ["read", "grep", "web_search", "read"],
        loadSkills: true,
        loadExtensions: true,
      },
    },
  }];

  assert.deepEqual(readSubagentSessionResources(entries), {
    appendSystemPrompt: ["Review carefully.", "Inherited parent context."],
    tools: ["read", "grep", "web_search"],
    loadSkills: true,
    loadExtensions: true,
  });
});

test("legacy subagent resource snapshots keep skills and extensions disabled", () => {
  const entries = [{
    type: "custom",
    customType: SUBAGENT_META_TYPE,
    data: {
      version: 1,
      parentSessionId: "parent",
      parentSessionPath: "/tmp/parent.jsonl",
      resourceSnapshot: {
        version: 1,
        appendSystemPrompt: ["Stay focused."],
        tools: ["read"],
      },
    },
  }];

  assert.deepEqual(readSubagentSessionResources(entries), {
    appendSystemPrompt: ["Stay focused."],
    tools: ["read"],
    loadSkills: false,
    loadExtensions: false,
  });
});

test("persisted runs distinguish interrupted, failed, aborted, and latest results", () => {
  const meta = {
    type: "custom",
    customType: SUBAGENT_META_TYPE,
    id: "meta",
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    data: {
      version: 1,
      parentSessionId: "parent",
      parentSessionPath: "/tmp/parent.jsonl",
      parentToolCallId: "tool-call",
      profile: "Explore",
      description: "Inspect",
      task: "Inspect files",
      runInBackground: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
  assert.equal(readSubagentRun([meta], "child", "/tmp/child.jsonl").status, "interrupted");
  // A file with no engine field predates it: absent means Pi Web's own runtime.
  assert.equal(readSubagentRun([meta], "child", "/tmp/child.jsonl").engine, undefined);

  const packageRun = {
    ...meta,
    data: { ...meta.data, engine: "pi-subagents" },
  };
  assert.equal(readSubagentRun([packageRun], "child", "/tmp/child.jsonl").engine, "pi-subagents");
  const ownRun = { ...meta, data: { ...meta.data, engine: "pi-web" } };
  assert.equal(readSubagentRun([ownRun], "child", "/tmp/child.jsonl").engine, "pi-web");

  const failed = {
    ...meta,
    id: "failed",
    customType: SUBAGENT_RESULT_TYPE,
    data: { version: 1, status: "failed", completedAt: "2026-01-01T00:01:00.000Z", error: "boom" },
  };
  const aborted = {
    ...failed,
    id: "aborted",
    data: { version: 1, status: "aborted", completedAt: "2026-01-01T00:02:00.000Z" },
  };
  assert.equal(readSubagentRun([meta, failed], "child", "/tmp/child.jsonl").status, "failed");
  assert.equal(readSubagentRun([meta, failed], "child", "/tmp/child.jsonl").error, "boom");
  assert.equal(readSubagentRun([meta, failed, aborted], "child", "/tmp/child.jsonl").status, "aborted");
  const resumed = { ...failed, id: "resumed", customType: SUBAGENT_STATUS_TYPE, data: { version: 1, status: "queued" } };
  assert.equal(readSubagentRun([meta, failed, resumed], "child", "/tmp/child.jsonl").status, "queued");
  assert.equal(readSubagentRun([{ ...meta, data: { version: 2 } }], "child", "/tmp/child.jsonl"), null);
});
