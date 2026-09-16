import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const {
  registerToolRenderer,
  resolveToolRenderer,
  clearToolRenderers,
} = await jiti.import("./registry.ts");
const { MessageView } = await jiti.import("../MessageView.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function renderMessage(message, props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MessageView, { message, ...props }),
    ),
  );
}

test("registry resolves exact names, predicates, and regexes in order", () => {
  clearToolRenderers();
  const exact = () => React.createElement("div");
  const prefix = () => React.createElement("span");
  registerToolRenderer("quote_lookup", exact);
  registerToolRenderer((name) => name.startsWith("mkt_"), prefix);
  assert.equal(resolveToolRenderer("quote_lookup"), exact);
  assert.equal(resolveToolRenderer("mkt_chart"), prefix);
  assert.equal(resolveToolRenderer("bash"), undefined);
  assert.equal(resolveToolRenderer("read"), undefined);
  clearToolRenderers();
});

test("a registered renderer takes over the toolCall block inside MessageView", () => {
  clearToolRenderers();
  registerToolRenderer(
    "quote_lookup",
    (props) => React.createElement(
      "div",
      { "data-testid": "custom-render" },
      `custom:${props.block.toolName}`,
    ),
  );
  const html = renderMessage({
    role: "assistant",
    content: [
      { type: "toolCall", toolCallId: "t1", toolName: "quote_lookup", input: {} },
    ],
  });
  assert.match(html, /data-testid="custom-render"/);
  assert.match(html, /custom:quote_lookup/);
  clearToolRenderers();
});

test("built-in tools keep the default body when nothing is registered", () => {
  clearToolRenderers();
  const html = renderMessage({
    role: "assistant",
    content: [
      { type: "toolCall", toolCallId: "t2", toolName: "bash", input: { command: "ls" } },
    ],
  });
  assert.doesNotMatch(html, /custom-render/);
  assert.match(html, /bash/);
  clearToolRenderers();
});

test("a registered renderer for one tool does not affect other tools", () => {
  clearToolRenderers();
  registerToolRenderer(
    "quote_lookup",
    () => React.createElement("div", { "data-testid": "custom-render" }),
  );
  const html = renderMessage({
    role: "assistant",
    content: [
      { type: "toolCall", toolCallId: "t3", toolName: "read", input: {} },
    ],
  });
  assert.doesNotMatch(html, /custom-render/);
  clearToolRenderers();
});
