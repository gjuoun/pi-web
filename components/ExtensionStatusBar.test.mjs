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
const {
  ExtensionStatusBar,
  ExtensionStatusLine,
  formatExtensionStatusLine,
  sanitizeExtensionStatusText,
} = await jiti.import("./ExtensionStatusBar.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function renderStatusBar(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ExtensionStatusBar, props),
    ),
  );
}

function renderStatusLine(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ExtensionStatusLine, props),
    ),
  );
}

test("sorts status text by hidden key like the Pi CLI footer", () => {
  const statuses = [
    { key: "20-memory", text: "memory" },
    { key: "90-notify", text: "notify" },
    { key: "10-permissions", text: "permissions" },
    { key: "05-ponytail", text: "ponytail" },
  ];

  assert.equal(
    formatExtensionStatusLine(statuses),
    "ponytail permissions memory notify",
  );
});

test("preserves status line breaks while normalizing horizontal whitespace", () => {
  assert.equal(
    sanitizeExtensionStatusText("  first\tsecond \r\n third  "),
    "first second\nthird",
  );
});

test("keeps the status bar text unwrapped and never truncates it", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const extRule = css.match(/\.chat-status-ext\s*\{([^}]*)\}/)?.[1] ?? "";
  const statusTextRule = css.match(/\.extension-status-text\s*\{([^}]*)\}/)?.[1] ?? "";

  // The row's max-height + overflow-y: auto is the only cap; the text itself is never clipped.
  assert.match(extRule, /white-space:\s*pre\s*;/);
  // The line-3 bar keeps the same even padding as the status row, which is 14px now that the
  // composer has no side borders to add a 15th pixel of inset.
  assert.match(extRule, /padding:\s*4px 4px/);
  assert.doesNotMatch(extRule, /overflow[^:]*:\s*hidden/);
  assert.doesNotMatch(extRule, /text-overflow:\s*ellipsis/);
  assert.match(statusTextRule, /white-space:\s*pre\s*;/);
  assert.doesNotMatch(statusTextRule, /overflow[^:]*:\s*hidden/);
  assert.doesNotMatch(statusTextRule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(statusTextRule, /text-overflow:\s*ellipsis/);
});

test("renders the status text into its own bar without identifier keys", () => {
  const html = renderStatusLine({
    statuses: [
      { key: "20-memory", text: "\x1b[32mmemory\x1b[0m" },
      { key: "05-ponytail", text: "ponytail" },
    ],
  });

  assert.match(html, /aria-label="ponytail memory"/);
  assert.match(html, /class="chat-status-ext"/);
  assert.match(html, /extension-status-text/);
  assert.match(html, />ponytail <span style=/);
  assert.match(html, />memory</);
  // The old two-line shelf element is gone; line 3 is its own full-width bar now.
  assert.doesNotMatch(html, /extension-status-line/);
  assert.doesNotMatch(html, /extension-status-shelf/);
  assert.doesNotMatch(html, /05-ponytail|20-memory/);
});

test("renders nothing into the status bar when no extension publishes a status", () => {
  assert.equal(renderStatusLine({ statuses: [] }), "");
});

test("renders the widget shelf without any status text", () => {
  const html = renderStatusBar({
    widgets: [{
      key: "usage",
      lines: ["42%"],
      placement: "aboveEditor",
    }],
  });

  assert.match(html, /extension-status-shelf has-widgets/);
  assert.match(html, /extension-widget-triggers/);
  assert.match(html, /usage/);
  // Line 3 moved to the row slot: the shelf carries widgets only.
  assert.doesNotMatch(html, /extension-status-line/);
  assert.doesNotMatch(html, /chat-status-ext/);
  assert.doesNotMatch(html, /has-status/);
});

test("renders no shelf when no extension publishes a widget", () => {
  assert.equal(renderStatusBar({}), "");
  assert.equal(renderStatusBar({ widgets: [] }), "");
});
