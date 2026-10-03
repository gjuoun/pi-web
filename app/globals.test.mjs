import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { SHADCN_TOKENS } from "./ui/lib/_sections/tokens.ts";
import { THEMES } from "../lib/themes.ts";

const require = createRequire(import.meta.url);
const postcss = require("postcss");
const root = postcss.parse(readFileSync(new URL("./globals.css", import.meta.url), "utf8"));
const top = root.nodes.filter((n) => n.type !== "comment");

// The default theme is `:root` (plus its own scope selector); every other theme is `[data-theme="<id>"]`.
const themeSelector = (id) => (id === "default" ? ':root, [data-theme="default"]' : `[data-theme="${id}"]`);
const THEME_SELECTORS = THEMES.map(({ id }) => themeSelector(id));
const blockFor = (id) => top.filter((n) => n.type === "rule" && n.selector.replace(/\s+/g, " ") === themeSelector(id));

test("globals.css top level is the native shadcn + Tailwind shape", () => {
  const shape = top.map((n) => (n.type === "atrule" ? `@${n.name} ${n.params}` : n.selector.replace(/\s+/g, " ")));
  const allowed = [
    '@import "tailwindcss"',
    '@import "tw-animate-css"',
    '@import "shadcn/tailwind.css"',
    '@import "./app.css"',
    "@custom-variant dark (&:is(.dark *))",
    ...THEME_SELECTORS,
    "@theme inline",
    "@layer base",
  ];
  const extras = shape.filter((s) => !allowed.includes(s));
  assert.deepEqual(extras, []);
});

test("every theme block declares only raw shadcn variables", () => {
  for (const { id } of THEMES) {
    const blocks = blockFor(id);
    assert.equal(blocks.length, 1, `exactly one block for theme ${id}`);
    const names = blocks[0].nodes.filter((d) => d.type === "decl").map((d) => d.prop.slice(2));
    assert.deepEqual(names.filter((n) => !SHADCN_TOKENS.includes(n)), [], `${id}: extra variables`);
  }
});

test("@theme inline holds only the native colour and radius mappings", () => {
  const theme = top.find((n) => n.type === "atrule" && n.name === "theme");
  const extras = theme.nodes.filter((d) => d.type === "decl").map((d) => d.prop).filter((p) => {
    if (p === "--font-heading") return false;
    if (p.startsWith("--radius-")) return false;
    if (p.startsWith("--color-")) return SHADCN_TOKENS.includes(p.slice("--color-".length)) === false;
    return true;
  });
  assert.deepEqual(extras, []);
});

test("@layer base holds only the native rules", () => {
  const base = top.find((n) => n.type === "atrule" && n.name === "layer" && n.params === "base");
  assert.deepEqual(base.nodes.map((n) => n.selector), ["*", "body", "html"]);
});

test("every registry theme sets every raw shadcn variable, and the default keeps its values", () => {
  for (const { id } of THEMES) {
    const decls = Object.fromEntries(blockFor(id)[0].nodes.filter((d) => d.type === "decl").map((d) => [d.prop.slice(2), d.value]));
    assert.deepEqual(SHADCN_TOKENS.filter((t) => !(t in decls)), [], `${id}: missing variables`);
  }
  const base = Object.fromEntries(blockFor("default")[0].nodes.filter((d) => d.type === "decl").map((d) => [d.prop.slice(2), d.value]));
  assert.equal(base.primary, "#00337c");
  assert.equal(base.ring, "#1c82ad");
  assert.equal(base.radius, "0.375rem");
});

test("theme blocks come after the :root defaults so equal specificity resolves by order", () => {
  const order = top.map((n) => (n.type === "rule" ? n.selector.replace(/\s+/g, " ") : null));
  const defaultAt = order.indexOf(themeSelector("default"));
  for (const { id } of THEMES.filter((t) => t.id !== "default")) {
    assert.ok(order.indexOf(themeSelector(id)) > defaultAt, `${id} must follow the default block`);
  }
});

test("a dark theme is selected by data-theme only: no .dark palette block", () => {
  assert.deepEqual(top.filter((n) => n.type === "rule" && /(^|[\s,])\.dark\b/.test(n.selector)).map((n) => n.selector), []);
});

test("app.css gives every theme its success and warning colours", () => {
  const app = postcss.parse(readFileSync(new URL("./app.css", import.meta.url), "utf8"));
  for (const { id } of THEMES) {
    const names = [];
    app.walkRules((r) => {
      if (r.parent.type !== "root") return;
      if (r.selector.replace(/\s+/g, " ").includes(id === "default" ? ":root" : `[data-theme="${id}"]`)) r.walkDecls(/^--(success|warning)/, (d) => names.push(d.prop));
    });
    for (const want of ["--success", "--success-foreground", "--warning", "--warning-foreground"]) assert.ok(names.includes(want), `${id}: app.css missing ${want}`);
  }
});

test("app.css has no .dark rules (themes are data-theme blocks)", () => {
  const app = postcss.parse(readFileSync(new URL("./app.css", import.meta.url), "utf8"));
  const found = [];
  app.walkRules((r) => { if (/(^|[\s,])\.dark\b/.test(r.selector) && !/catppuccin/.test(r.selector)) found.push(r.selector); });
  assert.deepEqual(found, []);
});
