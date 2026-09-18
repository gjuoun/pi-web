import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { ListPicker, filterPickerItems, nextPickerIndex, pickerHorizontalPlacement } = await jiti.import("./ListPicker.tsx");

const ITEMS = [
  { key: "anthropic:claude-sonnet-5", label: "Claude Sonnet 5", description: "anthropic" },
  { key: "openai:gpt-5.6-sol", label: "GPT-5.6 Sol", description: "openai" },
  { key: "zai:glm-5.3", label: "GLM 5.3", description: "zai" },
];

const ANCHOR = { top: 700, right: 900, bottom: 720, left: 700, width: 200 };

function render(overrides) {
  return renderToStaticMarkup(React.createElement(ListPicker, {
    ariaLabel: "Select model",
    items: ITEMS,
    anchorRect: ANCHOR,
    onSelect: () => {},
    onClose: () => {},
    ...(overrides || {}),
  }));
}

test("filterPickerItems returns every row for an empty query", () => {
  assert.equal(filterPickerItems(ITEMS, "").length, 3);
  assert.equal(filterPickerItems(ITEMS, "   ").length, 3);
});

test("filterPickerItems matches label, description and key, case-insensitively", () => {
  assert.deepEqual(filterPickerItems(ITEMS, "sonnet").map((i) => i.key), ["anthropic:claude-sonnet-5"]);
  assert.deepEqual(filterPickerItems(ITEMS, "SONNET").map((i) => i.key), ["anthropic:claude-sonnet-5"]);
  assert.deepEqual(filterPickerItems(ITEMS, "zai").map((i) => i.key), ["zai:glm-5.3"]);
  assert.deepEqual(filterPickerItems(ITEMS, "glm-5.3").map((i) => i.key), ["zai:glm-5.3"]);
});

test("filterPickerItems requires every whitespace-separated token to match", () => {
  // Both tokens live on the same row, so the AND succeeds.
  assert.deepEqual(filterPickerItems(ITEMS, "openai sol").map((i) => i.key), ["openai:gpt-5.6-sol"]);
  // One token per row, so the AND fails — a substring's OR would wrongly return two rows.
  assert.deepEqual(filterPickerItems(ITEMS, "openai glm"), []);
  assert.deepEqual(filterPickerItems(ITEMS, "nothing-here"), []);
});

test("nextPickerIndex wraps at both ends", () => {
  assert.equal(nextPickerIndex(0, 3, -1), 2);
  assert.equal(nextPickerIndex(2, 3, 1), 0);
  assert.equal(nextPickerIndex(1, 3, 1), 2);
  assert.equal(nextPickerIndex(1, 3, -1), 0);
  // A one-row or empty list must never index out of bounds.
  assert.equal(nextPickerIndex(0, 1, 1), 0);
  assert.equal(nextPickerIndex(0, 0, 1), 0);
});

test("the picker renders a listbox with one data-keyed row per item", () => {
  const html = render();
  assert.match(html, /class="list-picker"/);
  assert.match(html, /role="listbox"/);
  assert.match(html, /class="list-picker-input"/);
  const keys = [...html.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ITEMS.map((item) => item.key));
  assert.equal([...html.matchAll(/role="option"/g)].length, 3);
});

test("the highlighted row is the first item and is marked is-active", () => {
  const html = render();
  const rows = [...html.matchAll(/<button[^>]*class="([^"]*list-picker-item[^"]*)"[^>]*>/g)].map((m) => m[1]);
  assert.equal(rows.length, 3);
  assert.match(rows[0], /is-active/);
  assert.doesNotMatch(rows[1], /is-active/);
  assert.doesNotMatch(rows[2], /is-active/);
});

test("a stored active item is highlighted instead of the first row", () => {
  const items = ITEMS.map((item, index) => ({ ...item, active: index === 2 }));
  const html = render({ items });
  const rows = [...html.matchAll(/<button[^>]*class="([^"]*list-picker-item[^"]*)"[^>]*>/g)].map((m) => m[1]);
  assert.doesNotMatch(rows[0], /is-active/);
  assert.match(rows[2], /is-active/);
});

test("an initial query filters the list on first paint", () => {
  const html = render({ initialQuery: "glm" });
  const keys = [...html.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["zai:glm-5.3"]);
});

test("an empty result renders the empty label instead of a row", () => {
  const html = render({ initialQuery: "nothing-here", emptyLabel: "No matching models" });
  assert.match(html, /No matching models/);
  assert.equal([...html.matchAll(/data-key=/g)].length, 0);
});

test("the popover is anchored from the trigger rect and opens above it", () => {
  // Both triggers sit low in the window, so the inline geometry is the bottom edge of the anchor.
  assert.match(render(), /bottom:\d+px/);
  assert.doesNotMatch(render(), /top:\d+px/);
});

test("the stylesheet positions the panel fixed against the viewport", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const rule = css.match(/\.list-picker\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /position:\s*fixed/, "the panel must be fixed, not clipped by the composer");
  assert.match(rule, /z-index:\s*\d+/, "the panel must layer above the composer");
});

test("the input handles its own keys and stops them reaching the document", async () => {
  const source = await readFile(new URL("./ListPicker.tsx", import.meta.url), "utf8");
  assert.match(source, /event\.stopPropagation\(\)/, "the picker must stop propagation so useKeyboardShortcuts never sees its keys");
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) {
    assert.ok(source.includes(key), "the picker input must handle " + key);
  }
  assert.match(source, /autoFocus/, "the picker input must take focus on open so typing filters without a click");
});

test("a trigger with room to its right grows the panel rightward from its left edge", () => {
  assert.deepEqual(
    pickerHorizontalPlacement(ANCHOR, 1280),
    { align: "left", offset: 700, width: 320 },
  );
});

test("the reasoning segment at the far right right-aligns, so its right edge stays inside", () => {
  // This is the reported bug: the segment is the last thing on its line, and the panel used to grow
  // rightward from its left edge, run past the viewport, and get squeezed to the trigger's own width.
  const trigger = { top: 700, right: 1264, bottom: 720, left: 1180, width: 84 };
  const placement = pickerHorizontalPlacement(trigger, 1280);
  assert.equal(placement.align, "right");
  assert.equal(placement.offset, 16);
  assert.equal(placement.width, 320);
  const left = 1280 - placement.offset - placement.width;
  assert.ok(left >= 0 && 1280 - placement.offset <= 1280, "the whole panel sits inside the viewport");
});

test("the panel is never wider than the window on a phone", () => {
  const trigger = { top: 700, right: 318, bottom: 720, left: 300, width: 18 };
  const placement = pickerHorizontalPlacement(trigger, 320);
  const left = placement.align === "right" ? 320 - placement.offset - placement.width : placement.offset;
  assert.ok(placement.width <= 320 - 16, "width fits the viewport, got " + placement.width);
  assert.ok(left >= 0 && left + placement.width <= 320, "panel inside the viewport, got " + JSON.stringify(placement));
});

test("an anchor that would overflow renders a right-anchored panel", () => {
  const html = render({ anchorRect: { top: 700, right: 1264, bottom: 720, left: 1180, width: 84 } });
  assert.match(html, /right:\d+px/);
  assert.doesNotMatch(html, /left:\d+px/);
});
