import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { resolveSessionConfig } = await createJiti(import.meta.url).import("./session-config.ts");

function red(result) {
  assert.equal(result.isErr(), true);
  return result.isErr() ? result.error : undefined;
}

test("cwd is required and must be a non-empty string", () => {
  assert.deepEqual(red(resolveSessionConfig({})), { kind: "bad_request", message: "cwd is required" });
  assert.deepEqual(red(resolveSessionConfig({ cwd: "" })), { kind: "bad_request", message: "cwd is required" });
  assert.deepEqual(red(resolveSessionConfig({ cwd: 42 })), { kind: "bad_request", message: "cwd is required" });
});

test("provider and modelId must be provided together", () => {
  assert.deepEqual(
    red(resolveSessionConfig({ cwd: "/tmp", provider: "anthropic" })),
    { kind: "internal", message: "provider and modelId must be provided together" },
  );
  assert.deepEqual(
    red(resolveSessionConfig({ cwd: "/tmp", modelId: "claude-opus-4-8" })),
    { kind: "internal", message: "provider and modelId must be provided together" },
  );
});

test("a valid full config round-trips with initialModel", () => {
  const result = resolveSessionConfig({
    cwd: "/tmp/project",
    provider: "anthropic",
    modelId: "claude-opus-4-8",
    thinkingLevel: "high",
    allowInitialModelFallback: true,
  });
  assert.equal(result.isOk(), true);
  assert.deepEqual(result._unsafeUnwrap(), {
    cwd: "/tmp/project",
    initialModel: { provider: "anthropic", modelId: "claude-opus-4-8" },
    thinkingLevel: "high",
    allowInitialModelFallback: true,
    personaPath: undefined,
    extensions: undefined,
    skills: undefined,
    uiRenderers: undefined,
  });
});

test("thinkingLevel accepts every legal level and rejects anything else", () => {
  for (const level of ["off", "minimal", "low", "medium", "high", "xhigh", "max"]) {
    const result = resolveSessionConfig({ cwd: "/tmp", thinkingLevel: level });
    assert.equal(result.isOk(), true, level);
    if (result.isOk()) assert.equal(result.value.thinkingLevel, level);
  }
  assert.deepEqual(
    red(resolveSessionConfig({ cwd: "/tmp", thinkingLevel: "ultra" })),
    { kind: "internal", message: "Invalid thinking level: ultra" },
  );
  assert.deepEqual(
    red(resolveSessionConfig({ cwd: "/tmp", thinkingLevel: 3 })),
    { kind: "internal", message: "Invalid thinking level: 3" },
  );
});

test("preset slots pass through valid values and drop invalid ones", () => {
  const good = resolveSessionConfig({
    cwd: "/tmp",
    personaPath: "/presets/stock/persona.md",
    extensions: ["jun_code"],
    skills: ["quant/primer"],
    uiRenderers: ["quote_lookup", "mkt_chart"],
  });
  assert.equal(good.isOk(), true);
  if (good.isOk()) {
    assert.equal(good.value.personaPath, "/presets/stock/persona.md");
    assert.deepEqual(good.value.extensions, ["jun_code"]);
    assert.deepEqual(good.value.skills, ["quant/primer"]);
    assert.deepEqual(good.value.uiRenderers, ["quote_lookup", "mkt_chart"]);
  }

  const bad = resolveSessionConfig({
    cwd: "/tmp",
    personaPath: 7,
    extensions: ["ok", 3],
    skills: "not-an-array",
  });
  assert.equal(bad.isOk(), true);
  if (bad.isOk()) {
    assert.equal(bad.value.personaPath, undefined);
    assert.equal(bad.value.extensions, undefined);
    assert.equal(bad.value.skills, undefined);
  }
});

test("allowInitialModelFallback only passes through an explicit true", () => {
  assert.equal(resolveSessionConfig({ cwd: "/tmp", allowInitialModelFallback: true })._unsafeUnwrap().allowInitialModelFallback, true);
  assert.equal(resolveSessionConfig({ cwd: "/tmp", allowInitialModelFallback: "yes" })._unsafeUnwrap().allowInitialModelFallback, undefined);
  assert.equal(resolveSessionConfig({ cwd: "/tmp" })._unsafeUnwrap().allowInitialModelFallback, undefined);
});
