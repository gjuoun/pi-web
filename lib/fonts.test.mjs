import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const fonts = await jiti.import("./fonts.ts");

const {
  UI_FONT_STORAGE_KEY,
  MONO_FONT_STORAGE_KEY,
  UI_FONT_DEFAULT,
  MONO_FONT_DEFAULT,
  UI_FONT_FALLBACK_TAIL,
  MONO_FONT_FALLBACK_TAIL,
  UI_FONT_PRESETS,
  MONO_FONT_PRESETS,
  FONT_INIT_SCRIPT,
  sanitizeFontFamily,
  quoteFontFamily,
  composeFontStack,
  isDefaultFont,
} = fonts;

/** Run the pre-hydration script against a stub DOM so it can be compared with composeFontStack. */
function runInitScript(stored) {
  const written = {};
  const document = { documentElement: { style: { setProperty: (key, value) => { written[key] = value; } } } };
  const localStorage = { getItem: (key) => (key in stored ? stored[key] : null) };
  new Function("document", "localStorage", FONT_INIT_SCRIPT)(document, localStorage);
  return written;
}

test("defaults describe the stacks the stylesheet already carries", () => {
  assert.match(UI_FONT_DEFAULT, /^-apple-system, BlinkMacSystemFont/);
  assert.ok(UI_FONT_DEFAULT.endsWith("sans-serif"));
  assert.ok(MONO_FONT_DEFAULT.includes("var(--font-noto-mono)"));
  assert.ok(MONO_FONT_DEFAULT.endsWith("monospace"));
  assert.notEqual(UI_FONT_DEFAULT, MONO_FONT_DEFAULT);
});

test("both fallback tails keep CJK families and a generic family", () => {
  for (const tail of [UI_FONT_FALLBACK_TAIL, MONO_FONT_FALLBACK_TAIL]) {
    assert.match(tail, /'PingFang SC'/);
    assert.match(tail, /'Microsoft YaHei'/);
  }
  assert.ok(UI_FONT_FALLBACK_TAIL.endsWith("sans-serif"));
  assert.ok(MONO_FONT_FALLBACK_TAIL.endsWith("monospace"));
});

test("storage keys are stable and distinct", () => {
  assert.equal(UI_FONT_STORAGE_KEY, "pi-font-ui");
  assert.equal(MONO_FONT_STORAGE_KEY, "pi-font-mono");
});

test("sanitize keeps real family names and rejects nothing-shaped input", () => {
  assert.equal(sanitizeFontFamily("Inter"), "Inter");
  assert.equal(sanitizeFontFamily("IBM Plex Sans"), "IBM Plex Sans");
  assert.equal(sanitizeFontFamily("  JetBrains   Mono  "), "JetBrains Mono");
  assert.equal(sanitizeFontFamily("Helvetica Neue, Arial"), "Helvetica Neue, Arial");
  for (const value of [undefined, null, 42, {}, [], "", "   ", "\n\t "]) {
    assert.equal(sanitizeFontFamily(value), null);
  }
});

test("sanitize strips every character that could break the declaration", () => {
  assert.equal(sanitizeFontFamily("Foo; color: red"), "Foo color red");
  assert.equal(sanitizeFontFamily("url(https://evil.example/x)"), "url https //evil.example/x");
  assert.equal(sanitizeFontFamily('"} body { color: red }'), "body color red");
  assert.equal(sanitizeFontFamily("Foo\nBar"), "Foo Bar");
  assert.equal(sanitizeFontFamily("Foo@import"), "Foo import");
  assert.equal(sanitizeFontFamily("Foo\\Bar"), "Foo Bar");
  for (const hostile of [";", "{}", "()", ":", "@", '"', "'"]) {
    assert.equal(sanitizeFontFamily(hostile), null);
  }
});

test("sanitize caps absurdly long input", () => {
  assert.equal(sanitizeFontFamily("a".repeat(500)).length, 200);
});

test("quoting wraps a multi-word family exactly once", () => {
  assert.equal(quoteFontFamily("Inter"), "Inter");
  assert.equal(quoteFontFamily("JetBrains Mono"), '"JetBrains Mono"');
  assert.equal(quoteFontFamily('"JetBrains Mono"'), '"JetBrains Mono"');
  assert.equal(quoteFontFamily("Noto Sans Mono"), '"Noto Sans Mono"');
  assert.equal(quoteFontFamily("IBM-Plex-Mono"), "IBM-Plex-Mono");
});

test("compose falls back to the role default when nothing is stored", () => {
  assert.equal(composeFontStack("ui", null), UI_FONT_DEFAULT);
  assert.equal(composeFontStack("mono", ""), MONO_FONT_DEFAULT);
  assert.equal(composeFontStack("ui", "   "), UI_FONT_DEFAULT);
  assert.equal(composeFontStack("mono", ";{}"), MONO_FONT_DEFAULT);
});

test("compose puts the picked family first and keeps the tail behind it", () => {
  assert.equal(composeFontStack("ui", "Inter"), `Inter, ${UI_FONT_FALLBACK_TAIL}`);
  assert.equal(composeFontStack("mono", "JetBrains Mono"), `"JetBrains Mono", ${MONO_FONT_FALLBACK_TAIL}`);
  assert.equal(composeFontStack("ui", "Inter; color: red"), `"Inter color red", ${UI_FONT_FALLBACK_TAIL}`);
  assert.ok(composeFontStack("mono", "Menlo").endsWith("monospace"));
});

test("isDefaultFont is true only when no usable family is stored", () => {
  assert.equal(isDefaultFont(null), true);
  assert.equal(isDefaultFont(""), true);
  assert.equal(isDefaultFont(";;;"), true);
  assert.equal(isDefaultFont("Inter"), false);
  assert.equal(isDefaultFont("JetBrains Mono"), false);
});

test("presets survive their own sanitizer and keep unique ids", () => {
  for (const presets of [UI_FONT_PRESETS, MONO_FONT_PRESETS]) {
    assert.ok(presets.length >= 5);
    const ids = new Set();
    for (const preset of presets) {
      assert.equal(preset.family === "" ? null : sanitizeFontFamily(preset.family), preset.family === "" ? null : preset.family);
      assert.ok(preset.label.length > 0);
      assert.equal(ids.has(preset.id), false, `duplicate preset id ${preset.id}`);
      ids.add(preset.id);
    }
  }
  assert.equal(UI_FONT_PRESETS[0].family, "");
  assert.equal(MONO_FONT_PRESETS[0].family, "");
  assert.ok(MONO_FONT_PRESETS.some((preset) => preset.family === "JetBrains Mono"));
  assert.ok(UI_FONT_PRESETS.some((preset) => preset.family === "Inter"));
});

test("the pre-hydration script writes the same stacks the composer would", () => {
  assert.deepEqual(runInitScript({}), { "--font-ui": UI_FONT_DEFAULT, "--font-mono": MONO_FONT_DEFAULT });
  assert.deepEqual(runInitScript({ [UI_FONT_STORAGE_KEY]: "Inter" }), {
    "--font-ui": composeFontStack("ui", "Inter"),
    "--font-mono": MONO_FONT_DEFAULT,
  });
  assert.deepEqual(runInitScript({ [MONO_FONT_STORAGE_KEY]: "JetBrains Mono" }), {
    "--font-ui": UI_FONT_DEFAULT,
    "--font-mono": composeFontStack("mono", "JetBrains Mono"),
  });
  assert.deepEqual(runInitScript({ [UI_FONT_STORAGE_KEY]: "", [MONO_FONT_STORAGE_KEY]: "  " }), {
    "--font-ui": UI_FONT_DEFAULT,
    "--font-mono": MONO_FONT_DEFAULT,
  });
  assert.deepEqual(runInitScript({ [UI_FONT_STORAGE_KEY]: 'Inter"; } body{color:red' }), {
    "--font-ui": composeFontStack("ui", 'Inter"; } body{color:red'),
    "--font-mono": MONO_FONT_DEFAULT,
  });
});

test("the pre-hydration script survives blocked storage", () => {
  const written = {};
  const document = { documentElement: { style: { setProperty: (key, value) => { written[key] = value; } } } };
  const localStorage = { getItem: () => { throw new Error("blocked"); } };
  new Function("document", "localStorage", FONT_INIT_SCRIPT)(document, localStorage);
  assert.deepEqual(written, { "--font-ui": UI_FONT_DEFAULT, "--font-mono": MONO_FONT_DEFAULT });
});
