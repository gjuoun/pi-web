import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const fontHook = await readFile(new URL("./useFontPreferences.ts", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url);
const {
  UI_FONT_DEFAULT,
  MONO_FONT_DEFAULT,
  UI_FONT_STORAGE_KEY,
  MONO_FONT_STORAGE_KEY,
  readStoredFont,
  resolveStoredFont,
  fontVariableValues,
  UI_FONT_FALLBACK_TAIL,
  MONO_FONT_FALLBACK_TAIL,
} = await jiti.import("../lib/fonts.ts");

test("the reader returns a sanitized family for each role", () => {
  const storage = { getItem: (key) => (key === MONO_FONT_STORAGE_KEY ? "JetBrains Mono" : "Inter") };
  assert.equal(readStoredFont(storage, "ui"), "Inter");
  assert.equal(readStoredFont(storage, "mono"), "JetBrains Mono");
});

test("the reader treats blocked, empty, and non-string storage as 'no preference'", () => {
  assert.equal(readStoredFont(null, "ui"), null);
  assert.equal(readStoredFont(undefined, "mono"), null);
  assert.equal(readStoredFont({ getItem: () => { throw new Error("blocked"); } }, "ui"), null);
  assert.equal(readStoredFont({ getItem: () => "  " }, "mono"), null);
  assert.equal(readStoredFont({ getItem: () => 42 }, "ui"), null);
  assert.equal(readStoredFont({ getItem: () => ";{}" }, "ui"), null);
});

test("an injection-shaped stored value is neutralised rather than trusted", () => {
  const hostile = 'Inter"; } body{color:red';
  assert.equal(readStoredFont({ getItem: () => hostile }, "ui"), "Inter body color red");
});

test("resolving both roles reports each one independently", () => {
  assert.deepEqual(resolveStoredFont(null), { ui: null, mono: null });
  assert.deepEqual(
    resolveStoredFont({ getItem: (key) => (key === MONO_FONT_STORAGE_KEY ? "Menlo" : null) }),
    { ui: null, mono: "Menlo" },
  );
  assert.deepEqual(
    resolveStoredFont({ getItem: () => "Comic Sans MS" }),
    { ui: "Comic Sans MS", mono: "Comic Sans MS" },
  );
});

test("the preference pair resolves to the two root variables", () => {
  assert.deepEqual(fontVariableValues({ ui: null, mono: null }), {
    "--font-ui": UI_FONT_DEFAULT,
    "--font-mono": MONO_FONT_DEFAULT,
  });
  assert.deepEqual(fontVariableValues({ ui: "Inter", mono: "JetBrains Mono" }), {
    "--font-ui": `Inter, ${UI_FONT_FALLBACK_TAIL}`,
    "--font-mono": `"JetBrains Mono", ${MONO_FONT_FALLBACK_TAIL}`,
  });
  assert.equal(fontVariableValues({ ui: "Inter" })["--font-ui"].startsWith("Inter, -apple-system"), true);
  assert.equal(fontVariableValues({ mono: "Menlo" })["--font-mono"].startsWith("Menlo, "), true);
  assert.equal(fontVariableValues({ mono: "Menlo" })["--font-mono"].startsWith('"Menlo"'), false);
  assert.equal(fontVariableValues({ ui: "  " })["--font-ui"], UI_FONT_DEFAULT);
});

test("the store keeps the field's draft text so spaces round-trip", () => {
  assert.match(fontHook, /normalizeFontFamilyInput/);
  assert.match(fontHook, /const draft = normalizeFontFamilyInput\(family\)/);
  assert.match(fontHook, /localStorage\.setItem\(fontStorageKey\(role\), draft\)/);
  assert.doesNotMatch(fontHook, /sanitizeFontFamily/, "a trimming sanitiser in the store is what swallowed the space in a font name");
  assert.equal(fontVariableValues({ ui: "Comic Sans " })["--font-ui"], `"Comic Sans", ${UI_FONT_FALLBACK_TAIL}`);
  assert.equal(fontVariableValues({ ui: " Comic Sans" })["--font-ui"], `"Comic Sans", ${UI_FONT_FALLBACK_TAIL}`);
});

test("the store writes both variables, persists both keys, and resets to the defaults", () => {
  assert.match(fontHook, /useSyncExternalStore/);
  assert.match(fontHook, /fontVariableValues\(state\)/);
  assert.match(fontHook, /style\.setProperty\(name, value\)/);
  assert.match(fontHook, /localStorage\.setItem\(fontStorageKey\(role\)/);
  assert.match(fontHook, /storageKey|fontStorageKey/);
  assert.match(fontHook, /export function resetFont\(role: FontRole\): void \{\n  setFont\(role, ""\);/);
  assert.match(fontHook, /export function setFont\(role: FontRole, family: string\)/);
  assert.match(fontHook, /normalizeFontFamilyInput\(family\)/);
  assert.match(fontHook, /catch \{[\s\S]{0,120}\}/);
  assert.equal(UI_FONT_STORAGE_KEY, "pi-font-ui");
  assert.equal(MONO_FONT_STORAGE_KEY, "pi-font-mono");
});
