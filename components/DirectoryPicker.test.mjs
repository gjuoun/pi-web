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
const { DirectoryPickerBody } = await jiti.import("./DirectoryPicker.tsx");

const withI18n = (props) =>
  React.createElement(I18nProvider, null, React.createElement(DirectoryPickerBody, props));

const baseProps = {
  currentPath: "/home/jun/project",
  parentDirectory: "/home/jun",
  pathInput: "/home/jun/project",
  directories: [{ name: "src", path: "/home/jun/project/src" }],
  drives: null,
  loadError: null,
  loading: false,
  busy: false,
  error: null,
  onPathInputChange: () => {},
  onPathSubmit: () => {},
  onNavigateUp: () => {},
  onNavigate: () => {},
  onCancel: () => {},
  onSelect: () => {},
};

test("DirectoryPickerBody renders directory entries", () => {
  const html = renderToStaticMarkup(withI18n(baseProps));
  assert.match(html, /src/);
});

test("DirectoryPickerBody shows the loading state instead of entries", () => {
  const html = renderToStaticMarkup(withI18n({ ...baseProps, loading: true }));
  assert.doesNotMatch(html, />src</);
});

test("DirectoryPickerBody renders drives when navigated to the drive root", () => {
  const html = renderToStaticMarkup(
    withI18n({ ...baseProps, drives: [{ name: "C:", path: "C:\\" }], directories: [] }),
  );
  assert.match(html, /C:/);
});

test("DirectoryPickerBody surfaces load errors", () => {
  const html = renderToStaticMarkup(withI18n({ ...baseProps, loadError: "boom" }));
  assert.match(html, /boom/);
});
