import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { DEFAULT_THEME, THEMES, THEME_INIT_SCRIPT, THEME_STORAGE_KEY, applyTheme, isDarkTheme, isThemeId } from "./themes.ts";

function stubRoot() {
  const root = { dataset: {}, classes: new Set(), classList: { toggle: (name, force) => { force ? root.classes.add(name) : root.classes.delete(name); } } };
  return root;
}

test("the registry is exactly default and broismypro; default is light, broismypro is dark", () => {
  assert.deepEqual(THEMES.map(({ id }) => id), ["default", "broismypro"]);
  assert.equal(DEFAULT_THEME, "default");
  assert.equal(isDarkTheme("default"), false);
  assert.equal(isDarkTheme("broismypro"), true);
  assert.equal(isThemeId("broismypro"), true);
  assert.equal(isThemeId("dracula"), false);
  assert.equal(THEME_STORAGE_KEY, "pi-theme");
});

test("applyTheme sets data-theme and toggles the dark class from the registry", () => {
  const root = stubRoot();
  applyTheme(root, "broismypro");
  assert.equal(root.dataset.theme, "broismypro");
  assert.equal(root.classes.has("dark"), true);
  applyTheme(root, "default");
  assert.equal(root.dataset.theme, "default");
  assert.equal(root.classes.has("dark"), false);
});

test("first paint restores each theme and falls back to the default for invalid or blocked storage", () => {
  for (const stored of [...THEMES.map(({ id }) => id), null, "", "unknown", "dracula", new Error("Blocked")]) {
    const root = stubRoot();
    runInNewContext(THEME_INIT_SCRIPT, {
      localStorage: { getItem: (key) => { assert.equal(key, THEME_STORAGE_KEY); if (stored instanceof Error) throw stored; return stored; } },
      document: { documentElement: root },
    });
    const expected = isThemeId(stored) ? stored : DEFAULT_THEME;
    assert.equal(root.dataset.theme, expected);
    assert.equal(root.classes.has("dark"), isDarkTheme(expected));
  }
});

test("the init script and applyTheme agree on which themes are dark", () => {
  for (const { id, dark } of THEMES) {
    const root = stubRoot();
    runInNewContext(THEME_INIT_SCRIPT, { localStorage: { getItem: () => id }, document: { documentElement: root } });
    assert.equal(root.classes.has("dark"), dark);
  }
});
