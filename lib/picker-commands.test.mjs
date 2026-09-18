import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { resolveModelArgument, resolveThinkingArgument } = await jiti.import("./picker-commands.ts");

const MODELS = [
  { provider: "anthropic", id: "claude-sonnet-5" },
  { provider: "openai", id: "gpt-5.6-sol" },
  { provider: "zai", id: "glm-5.3" },
];

test("resolveModelArgument matches provider/modelId exactly", () => {
  assert.deepEqual(resolveModelArgument("anthropic/claude-sonnet-5", MODELS), { provider: "anthropic", modelId: "claude-sonnet-5" });
  assert.deepEqual(resolveModelArgument("  zai/glm-5.3  ", MODELS), { provider: "zai", modelId: "glm-5.3" });
});

test("resolveModelArgument is case-insensitive on both halves", () => {
  assert.deepEqual(
    resolveModelArgument("ANTHROPIC/Claude-Sonnet-5", MODELS),
    { provider: "anthropic", modelId: "claude-sonnet-5" },
  );
});

test("resolveModelArgument returns null for anything that is not an exact provider/modelId", () => {
  // pi opens the selector pre-filled with the argument instead of guessing at a near match.
  assert.equal(resolveModelArgument("sonnet", MODELS), null);
  assert.equal(resolveModelArgument("claude-sonnet-5", MODELS), null);
  assert.equal(resolveModelArgument("anthropic/nope", MODELS), null);
  assert.equal(resolveModelArgument("/claude-sonnet-5", MODELS), null);
  assert.equal(resolveModelArgument("", MODELS), null);
  assert.equal(resolveModelArgument("anthropic/claude-sonnet-5/extra", MODELS), null);
});

test("resolveThinkingArgument accepts a level the model actually offers", () => {
  assert.equal(resolveThinkingArgument("high", ["off", "minimal", "low", "medium", "high"]), "high");
  assert.equal(resolveThinkingArgument("  OFF  ", ["off"]), "off");
  assert.equal(resolveThinkingArgument("auto", ["off", "auto"]), "auto");
});

test("resolveThinkingArgument returns null for a level the model does not offer", () => {
  // pi answers an unknown level with an error rather than silently clamping.
  assert.equal(resolveThinkingArgument("max", ["off", "low"]), null);
  assert.equal(resolveThinkingArgument("bogus", ["off", "low", "medium", "high"]), null);
  assert.equal(resolveThinkingArgument("", ["off"]), null);
});
