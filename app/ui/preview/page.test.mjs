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
  assert.deepEqual(sections, ["app", "sidebar", "topbar", "messages", "composer", "timeline", "settings"]);
});

test("every data-shot name is unique", () => {
  const shots = [...html.matchAll(/data-shot="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(shots).size, shots.length);
});

test("both composed app frames exist, each with the sidebar, top bar, composer and status bar", () => {
  for (const name of ["app-conversation", "app-new"]) {
    const frame = html.match(new RegExp(`data-shot="${name}"[\\s\\S]*?(?=data-shot="(?!${name})|$)`))?.[0] ?? "";
    for (const slot of ["app-sidebar", "top-bar", "composer-view", "status-bar-view"]) assert.match(frame, new RegExp(`data-slot="${slot}"`), `${name} has ${slot}`);
  }
  const conversation = html.match(/data-shot="app-conversation"[\s\S]*?data-shot="app-new"/)[0];
  assert.match(conversation, /data-slot="chat-stream"/);
  assert.match(conversation, /data-slot="timeline-minimap"/);
  const fresh = html.match(/data-shot="app-new"[\s\S]*?data-shot="sidebar-default"/)[0];
  assert.match(fresh, /data-slot="new-session-view"/);
  assert.doesNotMatch(fresh, /data-slot="timeline-minimap"/);
});

test("every region has its content: no placeholder is left", () => {
  assert.doesNotMatch(html, /Coming in this slice/);
});

test("stateless: no text fields anywhere, and no button outside the settings sections", () => {
  // Radix adds hidden form inputs to switches and radios, and the two settings sliders are native, non-interactive range inputs.
  assert.doesNotMatch(html, /<textarea|<input(?![^>]*(?:aria-hidden|type="range"))/i);
  const beforeSettings = html.slice(0, html.indexOf('data-section="settings"'));
  assert.doesNotMatch(beforeSettings, /<button/i);
  assert.doesNotMatch(html, /onclick/i);
});

test("the section order still follows the six regions after the composed frames", () => {
  const order = [...html.matchAll(/data-section="([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["app", "sidebar", "topbar", "messages", "composer", "timeline", "settings"]);
});
