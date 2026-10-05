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

const source = await readFile(new URL("./DirectoryPicker.tsx", import.meta.url), "utf8");

test("the typed path drives the one folder list and never a second surface", () => {
  const html = renderToStaticMarkup(withI18n({
    ...baseProps,
    pathInput: "/home/jun/project/co",
    directories: [{ name: "components", path: "/home/jun/project/components" }],
    filtering: true,
  }));
  assert.match(html, /data-slot="directory-picker-list"/);
  assert.match(html, /data-slot="directory-row"/);
  assert.match(html, />components</);
  assert.doesNotMatch(html, /id="directory-suggestions"/);
  assert.doesNotMatch(source, /directory-suggestions/);
  assert.doesNotMatch(source, /role="combobox"/);
});

test("an empty filtered result says so, while an empty browse keeps its own copy", () => {
  const filtered = renderToStaticMarkup(withI18n({ ...baseProps, directories: [], filtering: true }));
  assert.match(filtered, /No matching folders/);

  const browsing = renderToStaticMarkup(withI18n({ ...baseProps, directories: [], filtering: false }));
  assert.match(browsing, /No subdirectories/);
});

test("the highlighted row is marked for keyboard navigation", () => {
  const html = renderToStaticMarkup(withI18n({
    ...baseProps,
    directories: [
      { name: "alpha", path: "/home/jun/project/alpha" },
      { name: "beta", path: "/home/jun/project/beta" },
    ],
    highlightedIndex: 1,
  }));
  const rows = html.split('data-slot="directory-row"').slice(1);
  assert.doesNotMatch(rows[0], /data-highlighted="true"/);
  assert.match(rows[1], /data-highlighted="true"/);
});

test("the filtered list asks the completion route for at most 10 rows", () => {
  assert.match(source, /const FILTER_LIMIT = 10;/);
  assert.match(source, /limit=\$\{FILTER_LIMIT\}/);
  assert.match(source, /\/api\/cwd\/complete\?q=\$\{encodeURIComponent\(query\)\}/);
});

test("Tab accepts the highlighted row and arrows move the highlight", () => {
  assert.match(source, /event\.key === "Tab" && highlightedIndex >= 0/);
  assert.match(source, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/);
});

test("supplied recents render as a labelled group above the folders", () => {
  const html = renderToStaticMarkup(withI18n({
    ...baseProps,
    recents: [{ name: "pi-web", path: "/home/jun/pi-web" }],
    directories: [{ name: "src", path: "/home/jun/project/src" }],
  }));
  assert.match(html, /data-slot="directory-recents"/);
  assert.match(html, /Recent/);
  assert.match(html, /data-kind="recent"/);
  assert.match(html, /data-kind="folder"/);
});

test("a recent that is already a visible folder row is dropped", () => {
  assert.match(source, /\.filter\(\(path\) => !folderRows\.some\(\(row\) => row\.path === path\)\)/);
  assert.match(source, /const RECENT_ROWS = 5;/);
});

test("browse mode hides the path field and renders the current path as chips", () => {
  const html = renderToStaticMarkup(withI18n({
    ...baseProps,
    mode: "browse",
    breadcrumb: [
      { label: "/", path: "/" },
      { label: "home", path: "/home" },
      { label: "project", path: "/home/jun/project" },
    ],
  }));
  assert.doesNotMatch(html, /id="directory-path"/);
  assert.match(html, /data-slot="directory-breadcrumb"/);
  assert.match(html, />home</);
  assert.match(html, /data-slot="directory-mode-toggle"/);
});

test("type mode shows the resolved-ancestor chips only when they are handed in", () => {
  const bare = renderToStaticMarkup(withI18n({ ...baseProps, mode: "type", breadcrumb: [] }));
  assert.doesNotMatch(bare, /data-slot="directory-breadcrumb"/);
  assert.match(bare, /id="directory-path"/);

  const resolved = renderToStaticMarkup(withI18n({
    ...baseProps,
    pathInput: "/home/jun/pro",
    mode: "type",
    breadcrumb: [{ label: "jun", path: "/home/jun" }],
  }));
  assert.match(resolved, /data-slot="directory-breadcrumb"/);
  assert.match(resolved, />jun</);
});

test("an in-flight browse never clobbers text typed since it started", () => {
  assert.match(source, /const adoptPath = pathInputRef\.current === startedWith;/);
  assert.match(source, /if \(adoptPath\) setPathInput\(nextPath\);/);
});
