import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url);
const { UI_FONT_DEFAULT, MONO_FONT_DEFAULT } = await jiti.import("../lib/fonts.ts");

const squash = (value) => value.replace(/\s+/g, " ").trim();

/** The `:root` declaration for a variable, whitespace-normalised. */
function rootDeclaration(name) {
  const match = new RegExp(`(?:^|\\n)\\s*--${name}:\\s*([^;]+);`).exec(globals);
  return match ? squash(match[1]) : null;
}

test("the stylesheet default stacks match the model byte-for-byte", () => {
  assert.equal(rootDeclaration("font-ui"), squash(UI_FONT_DEFAULT));
  assert.equal(rootDeclaration("font-mono"), squash(MONO_FONT_DEFAULT));
});

test("the UI stack is a variable, not a hard-coded element rule", () => {
  assert.match(globals, /font-family: var\(--font-ui\)/);
  assert.doesNotMatch(globals, /font-family: -apple-system/);
  assert.doesNotMatch(globals, /font-family: BlinkMacSystemFont/);
});

test("Tailwind exposes both roles as font utilities", () => {
  assert.match(globals, /--font-mono-font: var\(--font-mono\);/);
  assert.match(globals, /--font-ui-font: var\(--font-ui\);/);
});

test("both font variables are declared on :root so they resolve before hydration", () => {
  const rootBlocks = globals.match(/:root[^{]*\{[^}]*\}/g) ?? [];
  assert.ok(
    rootBlocks.some((block) => /--font-ui:/.test(block)),
    "--font-ui must be declared on :root, not only inside @theme",
  );
  assert.ok(
    rootBlocks.some((block) => /--font-mono:/.test(block)),
    "--font-mono must stay on :root",
  );
});
