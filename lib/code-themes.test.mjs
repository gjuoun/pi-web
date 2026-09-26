import assert from "node:assert/strict";
import test from "node:test";
import { THEME_OPTIONS } from "./theme.ts";

async function loadSubject() {
  return import("./code-themes.ts");
}

const RESOLVED_THEMES = THEME_OPTIONS.map(({ id }) => id).filter((id) => id !== "auto");

test("every resolved theme has a Prism style", async () => {
  const { getPrismStyle } = await loadSubject();
  for (const theme of RESOLVED_THEMES) {
    const style = getPrismStyle(theme);
    assert.ok(style && typeof style === "object", `missing Prism style for ${theme}`);
  }
});

test("every resolved theme has a Mermaid theme config", async () => {
  const { getMermaidTheme } = await loadSubject();
  for (const theme of RESOLVED_THEMES) {
    const config = getMermaidTheme(theme);
    assert.equal(config.theme, "base");
    assert.ok(config.themeVariables && typeof config.themeVariables === "object", `missing Mermaid vars for ${theme}`);
    assert.match(config.themeVariables.background, /^#[0-9a-f]{6}$/i);
  }
});

test("every resolved theme has a complete xterm ITheme", async () => {
  const { getXtermTheme } = await loadSubject();
  const requiredKeys = [
    "background", "foreground", "cursor", "selectionBackground",
    "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
    "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
  ];
  for (const theme of RESOLVED_THEMES) {
    const xtermTheme = getXtermTheme(theme);
    for (const key of requiredKeys) {
      assert.match(xtermTheme[key], /^#[0-9a-f]{6}$/i, `${theme}.${key} is not a hex colour`);
    }
  }
});

test("dracula gets its own xterm palette, distinct from the default", async () => {
  const { getXtermTheme } = await loadSubject();
  const dracula = getXtermTheme("dracula");
  const light = getXtermTheme("light");
  assert.notEqual(dracula.background, light.background);
  assert.equal(dracula.background, "#282a36");
});
