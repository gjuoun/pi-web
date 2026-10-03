import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { default: PreviewPage, metadata } = await jiti.import("./page.tsx");
const { TooltipProvider } = await jiti.import("@/components/ui/tooltip");

const html = renderToStaticMarkup(React.createElement(TooltipProvider, null, React.createElement(PreviewPage)));

test("the page has a root marker, is kept out of search indexes and owns its scroll", () => {
  assert.match(html, /data-slot="ui-preview"/);
  assert.equal(metadata.robots.index, false);
  assert.match(html.match(/<div[^>]*data-slot="ui-preview"[^>]*>/)[0], /overflow-y-auto/);
});

test("the sections follow the order of the six regions", () => {
  const sections = [...html.matchAll(/data-section="([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, ["sidebar", "topbar", "messages", "composer", "timeline"]);
});

test("every data-shot name is unique", () => {
  const shots = [...html.matchAll(/data-shot="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(shots).size, shots.length);
});

test("every region has its content: no placeholder is left", () => {
  assert.doesNotMatch(html, /Coming in this slice/);
});

test("stateless: no text fields anywhere, and no button", () => {
  assert.doesNotMatch(html, /<textarea|<input/i);
  assert.doesNotMatch(html, /<button/i);
  assert.doesNotMatch(html, /onclick/i);
});
