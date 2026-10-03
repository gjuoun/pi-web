import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { FolderIcon } = await jiti.import("./FileIcons.tsx");
const appCss = await readFile(new URL("../app/app.css", import.meta.url), "utf8");

test("file icons carry a light and a dark variant of the same Catppuccin icon", () => {
  const html = renderToStaticMarkup(React.createElement(FolderIcon, {}));
  assert.match(html, /--catppuccin-icon-light:url\(\/icons\/catppuccin\/latte\/_folder\.svg\)/);
  assert.match(html, /--catppuccin-icon-dark:url\(\/icons\/catppuccin\/mocha\/_folder\.svg\)/);
});

test("the dark class switches file icons to the dark variant, in both the mask and fallback paths", () => {
  const rules = [...appCss.matchAll(/html\.dark \.catppuccin-file-icon \{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(rules.length, 2, "one fallback rule and one @supports mask rule");
  assert.ok(rules.some((r) => /background-image:\s*var\(--catppuccin-icon-dark\)/.test(r)));
  assert.ok(rules.some((r) => /mask-image:\s*var\(--catppuccin-icon-dark\)/.test(r) && /-webkit-mask-image:\s*var\(--catppuccin-icon-dark\)/.test(r)));
});
