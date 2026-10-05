import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const dialogSource = source.slice(source.indexOf("function ExtensionDialog"));
const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

// The chrome for these surfaces moved out of inline styles into the stylesheet, so the assertions
// read the rule body by selector instead of the JSX attribute.
const cssRule = (selector) => {
  const start = globals.indexOf("." + selector + " {");
  if (start === -1) return "";
  return globals.slice(start + selector.length + 3, globals.indexOf("}", start));
};
const customSource = source.slice(source.indexOf("function ExtensionCustomPanel"));

test("confines extension overlays to the content region above the composer", () => {
  assert.doesNotMatch(source, /function ExtensionRequestSheet/);
  assert.match(
    source,
    /className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"[\s\S]*?<ExtensionDialog[\s\S]*?<ExtensionCustomPanel[\s\S]*?className="relative shrink-0"[\s\S]*?\{!composerHidden && chatInputElement\}/,
  );
  assert.match(dialogSource, /className=\{"extension-dialog-overlay"/);
  assert.match(cssRule("extension-dialog-overlay"), /position: absolute/);
  assert.match(cssRule("extension-dialog-overlay"), /inset: 0/);
  assert.match(cssRule("extension-dialog-overlay"), /pointer-events: none/);
  assert.match(cssRule("extension-dialog-panel"), /pointer-events: auto/);
  assert.match(customSource, /className=\{"extension-panel-overlay"/);
  assert.match(cssRule("extension-panel-overlay"), /position: absolute/);
  assert.match(cssRule("extension-panel-overlay"), /inset: 0/);
  assert.match(cssRule("extension-panel-overlay"), /pointer-events: none/);
  assert.doesNotMatch(source, /z-\[100\]|zIndex: 100/);
  assert.match(cssRule("extension-panel-panel"), /max-height: min\(760px, 100%\)/);
});

test("adds collapse without replacing cancel", () => {
  assert.match(dialogSource, /setCollapsed\(true\)/);
  assert.match(dialogSource, /chat\.extensionCollapse/);
  assert.match(dialogSource, /chat\.cancel/);
  assert.doesNotMatch(dialogSource, /chat\.extensionSkip/);
});

test("renders extension confirmation and options as markdown", () => {
  assert.match(source, /import \{ MarkdownBody \} from "\.\/MarkdownBody"/);
  assert.match(dialogSource, /<MarkdownBody>\{request\.message\}<\/MarkdownBody>/);
  assert.match(dialogSource, /role="button"[\s\S]*?data-extension-option[\s\S]*?<div inert>[\s\S]*?<MarkdownBody>\{option\}<\/MarkdownBody>/);
  assert.match(dialogSource, /ref=\{index === 0 \? focusFirstOption : undefined\}/);
});

test("resets collapse state when a new extension request arrives", () => {
  assert.match(source, /<ExtensionDialog key=\{extensionDialog.id\}/);
  assert.match(source, /<ExtensionCustomPanel key=\{extensionCustomUi.id\}/);
  assert.match(customSource, /if \(!collapsed\) inputRef.current\?\.focus\(\);\s*}, \[collapsed\]\)/);
});
