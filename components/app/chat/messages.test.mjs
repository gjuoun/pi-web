import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { UserMessage } = await jiti.import("./user-message.tsx");
const { AssistantMessage } = await jiti.import("./assistant-message.tsx");
const { ProcessDetails } = await jiti.import("./process-details.tsx");
const { CompactionCard } = await jiti.import("./notice.tsx");
const { NewSessionView } = await jiti.import("./new-session-view.tsx");
const { ChatStream } = await jiti.import("./chat-stream.tsx");
const { Prose } = await jiti.import("./prose.tsx");
const { turns } = await jiti.import("../../../app/ui/preview/_fixtures/conversation.ts");

const render = (el) => renderToStaticMarkup(el);
const assistants = turns.filter((t) => t.kind === "assistant");
const users = turns.filter((t) => t.kind === "user");
const processRun = assistants.flatMap((t) => t.blocks).find((b) => b.kind === "process").run;

test("a user message is a right-aligned bubble with one line per prompt line and its time", () => {
  const html = render(React.createElement(UserMessage, users[2]));
  assert.match(html, /data-slot="user-message"/);
  assert.match(html, /justify-end|items-end/);
  for (const line of users[2].lines) assert.ok(html.includes(line.replace(/'/g, "&#x27;")), `missing ${line}`);
  assert.ok(html.includes(users[2].time));
});

test("an assistant message renders every block kind and the usage row, zero counters left out", () => {
  const html = render(React.createElement(AssistantMessage, assistants[0]));
  for (const slot of ["assistant-message", "prose-heading", "prose-list", "prose-table", "code-block-view", "message-meta"]) assert.match(html, new RegExp(`data-slot="${slot}"`));
  assert.match(html, /Claude Sonnet 5\.5/);
  assert.match(html, /2,632 out/);
  assert.match(html, /\$0\.1180/);
  assert.match(html, /markdown-body/);
  assert.match(html, /<code[^>]*>components\/app\/\*<\/code>/, "inline code is rendered as code");
  assert.match(html, /<strong>stateful<\/strong>/, "bold is rendered as strong");
  const noCacheWrite = render(React.createElement(AssistantMessage, { ...assistants[1], usage: { ...assistants[1].usage, cacheWrite: 0 } }));
  assert.doesNotMatch(noCacheWrite, /cache W/);
});

test("a turn with a tool-using run shows the collapsed fold, then the answer with the files it wrote", () => {
  const html = render(React.createElement(AssistantMessage, assistants[1]));
  assert.match(html, /data-slot="process-details"/);
  assert.match(html, new RegExp(`${processRun.messages} messages · ${processRun.toolCalls} tool calls`));
  assert.doesNotMatch(html, /data-slot="tool-call-pill"/, "collapsed by default, as the real fold is");
  assert.match(html, /aria-label="Files changed"/);
  assert.match(html, />page\.tsx</);
});

test("the expanded fold lists the thinking lines and tool-call pills with their durations", () => {
  const html = render(React.createElement(ProcessDetails, { run: processRun, expanded: true }));
  assert.equal((html.match(/data-slot="thinking-line"/g) ?? []).length, processRun.steps.filter((s) => s.kind === "thinking").length);
  const tools = processRun.steps.filter((s) => s.kind === "tool");
  assert.equal((html.match(/data-slot="tool-call-pill"/g) ?? []).length, tools.length);
  for (const tool of tools) assert.ok(html.includes(tool.duration));
});

test("the errored reply is an assistant message with an alert; the compaction entry is its own card", () => {
  const error = turns.find((t) => t.kind === "notice" && t.tone === "error");
  const reply = render(React.createElement(AssistantMessage, { model: "Claude Sonnet 5.5", blocks: [], time: error.time, error: `Error: ${error.text}` }));
  assert.match(reply, /role="alert"/);
  assert.match(reply, /destructive/);
  const compaction = turns.find((t) => t.kind === "notice" && t.tone === "compaction");
  const card = render(React.createElement(CompactionCard, { text: compaction.text, time: compaction.time }));
  assert.match(card, /data-tone="compaction"/);
  assert.match(card, /Conversation compacted/);
  assert.doesNotMatch(card, /destructive/);
});

test("the new-session header shows the pi mark, the update link and the version pair", () => {
  const html = render(React.createElement(NewSessionView, {}));
  assert.match(html, /data-slot="new-session-view"/);
  assert.match(html, /π/);
  assert.match(html, /v0\.10\.0/);
  assert.match(html, /web <span[^>]*>v0\.9\.1<\/span>/);
  assert.match(html, /pi <span[^>]*>v0\.99\.2<\/span>/);
  assert.doesNotMatch(render(React.createElement(NewSessionView, { update: "" })), /v0\.10\.0/);
});

test("the stream renders every fixture turn in order, stateless", () => {
  const html = render(React.createElement(ChatStream, { turns }));
  const order = [...html.matchAll(/data-slot="(user-message|assistant-message|notice)"/g)].map((m) => m[1]);
  assert.deepEqual(order, turns.map((t) => (t.kind === "user" ? "user-message" : t.kind === "assistant" || t.tone === "error" ? "assistant-message" : "notice")));
  assert.doesNotMatch(html, /onclick|<button|<input|<textarea/i);
});

test("prose escapes text instead of injecting markup", () => {
  const html = render(React.createElement(Prose, { blocks: [{ kind: "p", text: "<img src=x onerror=alert(1)> and `code`" }] }));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});
