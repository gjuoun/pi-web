import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { isComposerFocusKey } = await jiti.import("./useKeyboardShortcuts.ts");

/** A keydown, defaulted to a plain bare "/" on the document body. */
const key = (overrides) => ({
  key: "/",
  repeat: false,
  isComposing: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...(overrides || {}),
});

/** A target whose closest() reports a match (a text field, a dialog) or nothing. */
const target = (blocks) => ({ closest: () => (blocks ? {} : null) });

test("a bare / on the page moves the caret into the composer", () => {
  assert.equal(isComposerFocusKey(key(), null), true);
  assert.equal(isComposerFocusKey(key(), target(false)), true);
});

test("never while the user is already typing", () => {
  // Otherwise a / typed into any field would be eaten and the caret would jump away.
  assert.equal(isComposerFocusKey(key(), target(true)), false);
});

test("never from inside a dialog", () => {
  // A modal (settings, trust, directory picker, extension dialog) owns the screen while it is up.
  assert.equal(isComposerFocusKey(key(), target(true)), false);
});

test("a held key does not repeat the focus", () => {
  assert.equal(isComposerFocusKey(key({ repeat: true }), null), false);
});

test("an IME composition is not a shortcut", () => {
  assert.equal(isComposerFocusKey(key({ isComposing: true }), null), false);
});

test("every modifier chord belongs to somebody else", () => {
  // Ctrl+K is reserved for search-everything; Cmd+/ and friends are not ours either.
  for (const modifier of ["metaKey", "ctrlKey", "altKey"]) {
    assert.equal(isComposerFocusKey(key({ [modifier]: true }), null), false, modifier + " must not trigger it");
  }
});

test("only the / character triggers it, not what lives on the same key", () => {
  // Shift+/ is "?" and must type normally.
  assert.equal(isComposerFocusKey(key({ key: "?" }), null), false);
  assert.equal(isComposerFocusKey(key({ key: "Escape" }), null), false);
  assert.equal(isComposerFocusKey(key({ key: "k" }), null), false);
});

test("the app binds / next to the composer shortcut, in ChatWindow", async () => {
  const source = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
  assert.match(source, /isComposerFocusKey\(event, event\.target\)/, "ChatWindow must guard with the predicate");
  assert.match(source, /insertIfEmpty\("\/"\)/, "an empty composer opens the slash palette in the same keystroke");
  assert.match(source, /setComposerHidden\(false\)/, "a hidden composer is revealed before it is focused");
  assert.doesNotMatch(source, /metaKey \|\| event\.ctrlKey\) && event\.key\.toLowerCase\(\) === "k"/, "Ctrl+K stays reserved");
});
