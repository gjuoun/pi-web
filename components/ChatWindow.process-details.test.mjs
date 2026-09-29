import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("expands process details when a completed turn has no final answer", () => {
  assert.match(source, /const \[expanded, setExpanded\] = useState\(defaultExpanded\)/);
  assert.match(
    source,
    /<ProcessDetailsGroup[\s\S]*?defaultExpanded=\{!finalAnswerMessage\}/,
  );
});

test("folds only tool-call machinery: standalone text replies flush the group and render inline", () => {
  assert.match(source, /isStandaloneTextMessage\(processMessage as AssistantMessage\)/);
  assert.match(source, /processIdx !== finalAssistantIdx && isStandaloneTextMessage[\s\S]*?flushProcessGroup\(\);\s*rendered\.push\(renderMessage\(processIdx\)\);/);
  // Each group reports its own counts, not the whole turn's.
  assert.match(source, /<ProcessDetailsGroup messageCount=\{groupViews\.length\} toolCallCount=\{groupToolCount\}/);
});
