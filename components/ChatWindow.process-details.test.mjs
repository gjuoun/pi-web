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

test("folds only tool machinery: spoken runs flush the group and render inline", () => {
  assert.match(source, /const runs = splitProcessRuns\(message\)/);
  assert.match(source, /run\.kind === "inline"[\s\S]*?flushProcessGroup\(\);[\s\S]*?keyPrefix: `spoken-\$\{runIdx\}`/);
  // Each group reports its own counts, not the whole turn's.
  assert.match(source, /<ProcessDetailsGroup messageCount=\{groupViews\.length\} toolCallCount=\{groupToolCount\}/);
  // The final message's pre-answer blocks go through the same split.
  assert.match(source, /processIdx === finalAssistantIdx\s*\? withAssistantBlocks\(processMessage, finalProcessBlocks[\s\S]*?splitProcessRuns\(message\)/);
});
