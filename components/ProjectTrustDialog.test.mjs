import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { ProjectTrustDialogBody } = await jiti.import("./ProjectTrustDialog.tsx");

const withI18n = (props) =>
  React.createElement(I18nProvider, null, React.createElement(ProjectTrustDialogBody, props));

const baseProps = {
  cwd: "/home/jun/project",
  busy: false,
  error: null,
  onCancel: () => {},
  onConfirm: () => {},
};

test("ProjectTrustDialogBody renders the cwd and trust/cancel actions", () => {
  const html = renderToStaticMarkup(withI18n(baseProps));
  assert.match(html, /\/home\/jun\/project/);
  assert.match(html, /data-slot="button"/);
  assert.match(html, /id="project-trust-title"/);
  assert.match(html, /id="project-trust-description"/);
});

test("ProjectTrustDialogBody surfaces an error", () => {
  const html = renderToStaticMarkup(withI18n({ ...baseProps, error: "denied" }));
  assert.match(html, /role="alert"/);
  assert.match(html, /denied/);
});

test("ProjectTrustDialogBody disables actions while busy", () => {
  const html = renderToStaticMarkup(withI18n({ ...baseProps, busy: true }));
  assert.match(html, /disabled=""/);
});
