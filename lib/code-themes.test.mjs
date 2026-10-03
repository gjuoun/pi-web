import assert from "node:assert/strict";
import test from "node:test";
import { THEMES } from "./themes.ts";

async function loadSubject() {
  return import("./code-themes.ts");
}

const hex = /^#[0-9a-f]{6}$/i;

test("every theme has a Prism style", async () => {
  const { getPrismStyle } = await loadSubject();
  for (const { id } of THEMES) {
    const style = getPrismStyle(id);
    assert.ok(style && typeof style === "object", `missing Prism style for ${id}`);
  }
  assert.notEqual(getPrismStyle("default"), getPrismStyle("broismypro"), "the dark theme gets its own Prism style");
});

test("every theme has a Mermaid config with literal hex colours", async () => {
  const { getMermaidTheme } = await loadSubject();
  for (const { id } of THEMES) {
    const config = getMermaidTheme(id);
    assert.equal(config.theme, "base");
    assert.match(config.themeVariables.background, hex, `${id}: background`);
    assert.match(config.themeVariables.primaryTextColor, hex, `${id}: text`);
  }
  assert.notEqual(getMermaidTheme("default").themeVariables.background, getMermaidTheme("broismypro").themeVariables.background);
});

test("every theme has a complete xterm ITheme of hex colours", async () => {
  const { getXtermTheme } = await loadSubject();
  const requiredKeys = [
    "background", "foreground", "cursor", "selectionBackground",
    "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
    "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
  ];
  for (const { id } of THEMES) {
    const xtermTheme = getXtermTheme(id);
    for (const key of requiredKeys) assert.match(xtermTheme[key], hex, `${id}.${key} is not a hex colour`);
  }
});

test("the dark theme's Mermaid and terminal canvases are the theme's own background", async () => {
  const { getMermaidTheme, getXtermTheme } = await loadSubject();
  assert.equal(getMermaidTheme("broismypro").themeVariables.background, "#0d0033");
  assert.equal(getXtermTheme("broismypro").background, "#0d0033");
});
