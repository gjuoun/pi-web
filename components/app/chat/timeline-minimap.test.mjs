import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { TimelineMinimap } = await jiti.import("./timeline-minimap.tsx");
const { minimapNodes } = await jiti.import("../../../app/ui/preview/_fixtures/conversation.ts");

const render = (el) => renderToStaticMarkup(el);

test("one node per fixture entry, exactly one active, 50px apart from 12px down", () => {
  const html = render(React.createElement(TimelineMinimap, { nodes: minimapNodes }));
  assert.match(html, /data-slot="timeline-minimap"/);
  assert.equal((html.match(/data-slot="timeline-node"/g) ?? []).length, minimapNodes.length);
  assert.equal((html.match(/data-active="true"/g) ?? []).length, 1);
  const tops = [...html.matchAll(/data-slot="timeline-node"[^>]*style="top:([\d.]+)%;height:50px"/g)].map((m) => Number(m[1]));
  assert.deepEqual(tops.map((t) => Math.round((t / 100) * 686)), minimapNodes.map((_, i) => 12 + i * 50));
});

test("the column is 36px wide and carries a track line", () => {
  const html = render(React.createElement(TimelineMinimap, { nodes: minimapNodes }));
  assert.match(html, /w-9/);
  assert.match(html, /bg-muted/);
  assert.match(html, /data-slot="timeline-track"/);
});

test("the hover preview lists every turn with its number and outline, only when open", () => {
  const closed = render(React.createElement(TimelineMinimap, { nodes: minimapNodes }));
  assert.doesNotMatch(closed, /data-slot="timeline-preview"/);
  const open = render(React.createElement(TimelineMinimap, { nodes: minimapNodes, open: true, locatedIndex: 1 }));
  assert.equal((open.match(/data-slot="timeline-preview"/g) ?? []).length, 1);
  assert.equal((open.match(/data-slot="minimap-number"/g) ?? []).length, minimapNodes.length);
  assert.match(open, />01</);
  assert.match(open, /Restatement/);
  assert.equal((open.match(/data-located="true"/g) ?? []).length, 1, "the turn under the pointer is the located row");
  assert.match(open, /data-level="3"/);
});

test("the minimap is stateless: no handlers, buttons or inputs", () => {
  const html = render(React.createElement(TimelineMinimap, { nodes: minimapNodes, open: true, locatedIndex: 1 }));
  assert.doesNotMatch(html, /onclick|<button|<input|<textarea/i);
});
