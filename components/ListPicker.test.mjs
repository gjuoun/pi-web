import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { filterPickerItems } = await jiti.import("./ListPicker.tsx");

/**
 * ListPicker is now `Popover` + `Command` (shadcn/Radix), so its overlay content never renders under
 * `renderToStaticMarkup` (Radix portal content is SSR-invisible — see the plan's test policy). The
 * open-overlay behaviour (focus, filtering, Escape, selection) is proven in `e2e/model-picker.mjs`
 * instead. What stays unit-tested here is the one piece of pure logic ListPicker still owns:
 * `filterPickerItems`, which deliberately overrides cmdk's own fuzzy filter (`shouldFilter={false}`).
 */

const ITEMS = [
  { key: "anthropic:claude-sonnet-5", label: "Claude Sonnet 5", description: "anthropic" },
  { key: "openai:gpt-5.6-sol", label: "GPT-5.6 Sol", description: "openai" },
  { key: "zai:glm-5.3", label: "GLM 5.3", description: "zai" },
];

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

test("an empty result returns no rows", () => {
  assert.deepEqual(filterPickerItems(ITEMS, "nothing-here"), []);
});
