import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { default: UiLibPage, metadata } = await jiti.import("./page.tsx");
const { SHADCN_COLOR_TOKENS } = await jiti.import("./_sections/tokens.ts");

const { TooltipProvider } = await jiti.import("@/components/ui/tooltip");
// app/layout.tsx supplies the TooltipProvider in the real app.
const html = renderToStaticMarkup(React.createElement(TooltipProvider, null, React.createElement(UiLibPage)));

test("the page has a root marker and is kept out of search indexes", () => {
  assert.match(html, /data-slot="ui-lib"/);
  assert.equal(metadata.robots.index, false);
});

test("foundations section renders one swatch per raw shadcn colour token", () => {
  assert.match(html, /data-section="foundations"/);
  for (const token of SHADCN_COLOR_TOKENS) {
    assert.match(html, new RegExp(`data-swatch="${token}"`), `missing swatch for --${token}`);
  }
});

test("foundations shows the radius and type scales", () => {
  assert.match(html, /data-specimen="foundation-radius"/);
  assert.match(html, /data-specimen="foundation-type"/);
});

const { readdirSync } = await import("node:fs");
const stems = (dir) => readdirSync(new URL(dir, import.meta.url)).filter((f) => f.endsWith(".tsx")).map((f) => f.replace(/\.tsx$/, ""));

test("every components/ui primitive has a specimen", () => {
  assert.match(html, /data-section="primitives"/);
  const missing = stems("../../../components/ui/").filter((name) => !html.includes(`data-specimen="ui-${name}"`));
  assert.deepEqual(missing, []);
});

// Every component under components/app/** (any depth) is shown either on this page or on /ui/preview.
const { default: PreviewPage } = await jiti.import("../preview/page.tsx");
const previewHtml = renderToStaticMarkup(React.createElement(TooltipProvider, null, React.createElement(PreviewPage)));
const appStems = (dir) => readdirSync(new URL(dir, import.meta.url), { recursive: true }).filter((f) => String(f).endsWith(".tsx")).map((f) => String(f).replace(/^.*\//, "").replace(/\.tsx$/, ""));

test("every components/app file, at any depth, has a specimen on /ui/lib or /ui/preview", () => {
  assert.match(html, /data-section="components"/);
  const missing = appStems("../../../components/app/").filter((name) => !html.includes(`data-specimen="app-${name}"`) && !previewHtml.includes(`data-specimen="app-${name}"`));
  assert.deepEqual(missing, []);
});

test("component file names are unique across folders, so a specimen name identifies one file", () => {
  const stemsFound = appStems("../../../components/app/");
  assert.equal(new Set(stemsFound).size, stemsFound.length);
});

test("themes section renders one scope per registry theme", async () => {
  const { THEMES } = await jiti.import("@/lib/themes");
  assert.match(html, /data-section="themes"/);
  for (const { id, dark } of THEMES) {
    const scope = html.match(new RegExp(`<div[^>]*data-theme-scope="${id}"[^>]*>`));
    assert.ok(scope, `missing scope for theme ${id}`);
    assert.match(scope[0], new RegExp(`data-theme="${id}"`));
    assert.equal(/\bdark\b/.test(scope[0].match(/class="([^"]*)"/)?.[1] ?? ""), dark, `${id}: dark class follows the registry`);
  }
});
