import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const settingsPanel = await readFile(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");
const picker = await readFile(new URL("./FontFamilyPicker.tsx", import.meta.url), "utf8");
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
  "settings.fontSuggestions",
  "settings.fontNoMatches",
  "settings.fontDefaultBadge",
];

const locales = Object.fromEntries(await Promise.all(
  ["en", "zh-CN", "zh-TW"].map(async (locale) => [
    locale,
    await readFile(new URL(`../lib/i18n/messages/${locale}.ts`, import.meta.url), "utf8"),
  ]),
));

test("General settings render one picker per font role", () => {
  assert.match(settingsPanel, /useFontPreferences\(\)/);
  assert.match(settingsPanel, /<FontFamilyPicker/);
  assert.match(settingsPanel, /presets=\{fontPresets\("ui"\)\}/);
  assert.match(settingsPanel, /presets=\{fontPresets\("mono"\)\}/);
  assert.match(settingsPanel, /label=\{t\("settings\.uiFont"\)\}/);
  assert.match(settingsPanel, /label=\{t\("settings\.monoFont"\)\}/);
  assert.match(settingsPanel, /resetLabel=\{t\("settings\.resetUiFont"\)\}/);
  assert.match(settingsPanel, /resetLabel=\{t\("settings\.resetMonoFont"\)\}/);
  assert.match(settingsPanel, /onReset=\{\(\) => resetFont\("ui"\)\}/);
  assert.match(settingsPanel, /onReset=\{\(\) => resetFont\("mono"\)\}/);
  assert.match(settingsPanel, /onChange=\{setUiFont\}/);
  assert.match(settingsPanel, /onChange=\{setMonoFont\}/);
});

test("each field is a combobox backed by a visible listbox, not a native datalist", () => {
  assert.match(picker, /const inputId = `settings-\$\{role\}-font`/);
  assert.match(picker, /role="combobox"/);
  assert.match(picker, /aria-expanded=\{open\}/);
  assert.match(picker, /aria-controls=\{listId\}/);
  assert.match(picker, /aria-autocomplete="list"/);
  assert.match(picker, /role="listbox"/);
  assert.match(picker, /role="option"/);
  assert.match(picker, /options\.filter/);
  assert.match(settingsCss, /\.settings-font-picker-popover \{[^}]*position: fixed/, "the settings pane clips, so the list must escape it");
  assert.match(picker, /t\("settings\.fontSuggestions"\)/);
  assert.match(picker, /t\("settings\.fontNoMatches"\)/);
  assert.match(picker, /t\("settings\.fontDefaultBadge"\)/);
  assert.match(picker, /onKeyDown=\{handleKeyDown\}/);
  assert.doesNotMatch(picker, /\blist=\{/, "a native datalist cannot be styled, revealed, or asserted");
  assert.doesNotMatch(settingsPanel, /\blist=\{/);
  assert.ok(UI_FONT_PRESETS.length >= 5 && MONO_FONT_PRESETS.length >= 5);
  // macOS does not hand a page SF Mono by name (atsutil and CoreText both return zero matches), so the
  // preset must point at the CSS generic instead of a family that silently falls back.
  assert.equal(MONO_FONT_PRESETS.some((preset) => preset.family === "SF Mono"), false);
  assert.equal(MONO_FONT_PRESETS.some((preset) => preset.family === "ui-monospace"), true);
});

test("the picker leads with the fonts installed on this machine", () => {
  assert.match(picker, /useInstalledFonts\(\)/);
  assert.match(picker, /void loadInstalledFonts\(\)/);
  assert.match(picker, /pickerFamilies\(installedFonts, role\)/);
  assert.match(picker, /id: `installed:\$\{family\}`/);
  assert.match(picker, /seen\.has\(preset\.family\)/, "a preset must not repeat an installed family");
  assert.match(picker, /const options = useMemo/);
});

test("the picker keeps free text usable and dismissable", () => {
  assert.match(picker, /type="text"/);
  assert.match(picker, /spellCheck=\{false\}/);
  assert.match(picker, /autoComplete="off"/);
  assert.match(picker, /event\.key === "ArrowDown"/);
  assert.match(picker, /event\.key === "ArrowUp"/);
  assert.match(picker, /event\.key === "Enter"/);
  assert.match(picker, /event\.key === "Escape" && open/);
  assert.match(picker, /event\.stopPropagation\(\)/, "Escape must close the list, not the settings dialog");
  assert.match(picker, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(picker, /disabled=\{isDefaultFont\(value\)\}/);
});

test("the hint explains fallback and the monospace blast radius", () => {
  assert.match(settingsPanel, /t\("settings\.fontHint"\)/);
  assert.match(locales.en, /falls back to the built-in stack/);
  assert.match(locales.en, /workspace terminal/);
});

test("the field styles exist and reuse the settings row layout", () => {
  assert.match(settingsCss, /\.settings-font-option-header \{/);
  assert.match(settingsCss, /\.settings-font-input \{/);
  assert.match(settingsCss, /\.settings-font-picker-popover \{/);
  assert.match(settingsCss, /\.settings-font-picker-option \{/);
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
  assert.match(picker, /aria-label=\{resetLabel\}/);
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
