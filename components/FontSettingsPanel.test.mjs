import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const settingsPanel = await readFile(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");
const settingsCss = await readFile(new URL("../app/settings.css", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url);
const { UI_FONT_PRESETS, MONO_FONT_PRESETS } = await jiti.import("../lib/fonts.ts");

const FONT_KEYS = [
  "settings.uiFont",
  "settings.monoFont",
  "settings.resetUiFont",
  "settings.resetMonoFont",
  "settings.fontPlaceholder",
  "settings.fontHint",
];

const locales = Object.fromEntries(await Promise.all(
  ["en", "zh-CN", "zh-TW"].map(async (locale) => [
    locale,
    await readFile(new URL(`../lib/i18n/messages/${locale}.ts`, import.meta.url), "utf8"),
  ]),
));

test("General settings render one labelled field per font role", () => {
  assert.match(settingsPanel, /useFontPreferences\(\)/);
  assert.match(settingsPanel, /role="ui"/);
  assert.match(settingsPanel, /role="mono"/);
  assert.match(settingsPanel, /label=\{t\("settings\.uiFont"\)\}/);
  assert.match(settingsPanel, /label=\{t\("settings\.monoFont"\)\}/);
  assert.match(settingsPanel, /resetLabel=\{t\("settings\.resetUiFont"\)\}/);
  assert.match(settingsPanel, /resetLabel=\{t\("settings\.resetMonoFont"\)\}/);
  assert.match(settingsPanel, /onReset=\{\(\) => resetFont\("ui"\)\}/);
  assert.match(settingsPanel, /onReset=\{\(\) => resetFont\("mono"\)\}/);
  assert.match(settingsPanel, /onChange=\{setUiFont\}/);
  assert.match(settingsPanel, /onChange=\{setMonoFont\}/);
});

test("each field is a free-text input backed by a datalist of presets", () => {
  assert.match(settingsPanel, /const inputId = `settings-\$\{role\}-font`/);
  assert.match(settingsPanel, /list=\{presetListId\}/);
  assert.match(settingsPanel, /<datalist id=\{presetListId\}>/);
  assert.match(settingsPanel, /fontPresets\(role\)\.map/);
  assert.match(settingsPanel, /value=\{preset\.family\} label=\{preset\.label\}/);
  assert.match(settingsPanel, /type="text"/);
  assert.match(settingsPanel, /disabled=\{value === ""\}/);
  assert.match(settingsPanel, /spellCheck=\{false\}/);
  assert.match(settingsPanel, /autoComplete="off"/);
  assert.ok(UI_FONT_PRESETS.length >= 5 && MONO_FONT_PRESETS.length >= 5);
});

test("the hint explains fallback and the monospace blast radius", () => {
  assert.match(settingsPanel, /t\("settings\.fontHint"\)/);
  assert.match(locales.en, /falls back to the built-in stack/);
  assert.match(locales.en, /workspace terminal/);
});

test("the field styles exist and reuse the settings row layout", () => {
  assert.match(settingsCss, /\.settings-font-option-header \{/);
  assert.match(settingsCss, /\.settings-font-input \{/);
  assert.match(settingsCss, /font-family: var\(--font-mono\)/);
});

test("every locale carries all six font keys", () => {
  for (const [locale, source] of Object.entries(locales)) {
    for (const key of FONT_KEYS) {
      const pattern = new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]+)"`);
      const match = pattern.exec(source);
      assert.ok(match, `${locale} is missing ${key}`);
      assert.ok(match[1].length > 0, `${locale} has an empty value for ${key}`);
    }
  }
});

test("the reset control keeps its accessible name for the browser drives", () => {
  assert.match(settingsPanel, /aria-label=\{resetLabel\}/);
  assert.match(locales.en, /"settings\.resetUiFont": "Reset interface font"/);
  assert.match(locales.en, /"settings\.resetMonoFont": "Reset monospace font"/);
  assert.match(locales.en, /"settings\.uiFont": "Interface font"/);
  assert.match(locales.en, /"settings\.monoFont": "Monospace font"/);
});

test("the stored fonts are applied before hydration", () => {
  assert.match(layout, /import \{ FONT_INIT_SCRIPT \} from "@\/lib\/fonts"/);
  assert.match(layout, /FONT_INIT_SCRIPT[\s\S]{0,200}THEME_INIT_SCRIPT|THEME_INIT_SCRIPT[\s\S]{0,400}FONT_INIT_SCRIPT/);
  assert.match(layout, /<head>[\s\S]*__html: FONT_INIT_SCRIPT[\s\S]*<\/head>/);
});
