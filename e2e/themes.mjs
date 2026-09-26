// Run against a running server: E2E_BASE_URL=http://127.0.0.1:30141 node e2e/themes.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const base = process.env.E2E_BASE_URL || "http://127.0.0.1:30141";
const artifacts = fileURLToPath(new URL("../test-results/themes/", import.meta.url));
// Settings → General → Appearance, in display order, with each radio's accessible label.
const themes = ["light", "dark", "github", "dracula", "auto"];
const labels = ["Light", "Dark", "GitHub", "Dracula", "System"];
const darkThemes = new Set(["dark", "dracula"]);
// Text roles on the surfaces the UI draws them on, and button text on its own fill (WCAG AA, 4.5:1).
const foregrounds = ["foreground", "muted-foreground", "primary"];
const surfaces = ["background", "card", "popover", "muted", "accent", "sidebar"];
const fills = [["primary-foreground", "primary"], ["accent-foreground", "accent"], ["sidebar-foreground", "sidebar"]];
const neutralInDark = ["background", "card", "popover", "muted", "accent", "border", "foreground", "muted-foreground", "sidebar"];
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch();

function luminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// Tokens resolved to sRGB bytes inside the page: a probe element resolves var() chains and color-mix(),
// and a canvas converts whatever colour space the browser reports (hex, rgb(), oklch()) into bytes.
async function tokenColors(page, names) {
  return page.evaluate((tokens) => {
    const probe = document.createElement("div");
    probe.style.display = "none";
    document.body.appendChild(probe);
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const out = {};
    for (const name of tokens) {
      probe.style.backgroundColor = "";
      probe.style.backgroundColor = `var(--${name})`;
      const css = getComputedStyle(probe).backgroundColor;
      ctx.fillStyle = "#010203";
      ctx.fillStyle = css;
      if (ctx.fillStyle === "#010203" && css !== "rgb(1, 2, 3)") throw new Error(`--${name}: canvas could not parse "${css}"`);
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      out[name] = { rgb: [r, g, b], alpha: a / 255, css };
    }
    probe.remove();
    return out;
  }, names);
}

try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "en-US", colorScheme: "light", reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Keep the check independent of the instance's session catalogue.
    await page.route(/\/api\/sessions(?:\?.*)?$/, (route) => route.fulfill({ json: { sessions: [] } }));
    await page.goto(base);
    await page.getByText("No sessions found", { exact: true }).waitFor({ state: "attached" });
    const openSettings = async () => {
      const sidebar = page.getByRole("button", { name: "Show sidebar", exact: true });
      if (width <= 640) await sidebar.waitFor();
      if (await sidebar.isVisible()) await sidebar.click();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
    };
    const expectTheme = async (theme) => {
      await page.waitForFunction((value) => document.documentElement.dataset.theme === value, theme);
      assert.equal(await page.locator("html").evaluate((root) => root.classList.contains("dark")), darkThemes.has(theme), `${theme}: html.dark`);
      assert.equal(await page.locator("html").evaluate((root) => getComputedStyle(root).colorScheme), darkThemes.has(theme) ? "dark" : "light", `${theme}: color-scheme`);
    };

    await openSettings();
    for (const [index, theme] of themes.entries()) {
      const resolved = theme === "auto" ? "light" : theme;
      const radio = page.getByRole("radio", { name: labels[index], exact: true });
      await radio.click();
      await expectTheme(resolved);
      assert.equal(await radio.isChecked(), true);
      assert.equal(await page.evaluate(() => localStorage.getItem("pi-theme")), theme);

      const colors = await tokenColors(page, [...new Set([...foregrounds, ...surfaces, ...fills.flat()])]);
      for (const foreground of foregrounds) {
        for (const surface of surfaces) {
          const ratio = contrast(colors[foreground].rgb, colors[surface].rgb);
          assert.ok(ratio >= 4.5, `${resolved}: --${foreground} on --${surface} is ${ratio.toFixed(2)}:1 (${colors[foreground].css} on ${colors[surface].css}), needs 4.5`);
        }
      }
      for (const [foreground, fill] of fills) {
        const ratio = contrast(colors[foreground].rgb, colors[fill].rgb);
        assert.ok(ratio >= 4.5, `${resolved}: --${foreground} on --${fill} is ${ratio.toFixed(2)}:1, needs 4.5`);
      }

      assert.equal(await page.locator('[data-slot="settings-theme-option"]').evaluateAll((options) => options.every((option) => {
        const label = option.querySelector('[data-slot="settings-theme-option-label"]');
        const box = option.getBoundingClientRect();
        const text = label.getBoundingClientRect();
        return option.scrollWidth <= option.clientWidth && text.right <= box.right && text.bottom <= box.bottom;
      })), true, `Theme labels must fit at ${width}px`);
      await page.screenshot({ path: `${artifacts}/${theme}-${width}.png`, animations: "disabled" });
      await page.reload();
      await expectTheme(resolved);
      await openSettings();
      assert.equal(await radio.isChecked(), true, "Selection must survive refresh");
    }

    // `auto` follows the system preference live; an explicit palette ignores it.
    await page.emulateMedia({ colorScheme: "dark" });
    await expectTheme("dark");
    await page.getByRole("radio", { name: "Light", exact: true }).click();
    await expectTheme("light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expectTheme("light");
    await page.emulateMedia({ colorScheme: "light" });

    // Native radio semantics: arrow keys move the selection.
    const light = page.getByRole("radio", { name: "Light", exact: true });
    await light.focus();
    // Radix's radio-group only treats a keydown as an "arrow key press" while its document-level
    // flag is still set: a same-tick press()'s keydown+keyup can race that flag, so hold the key briefly.
    await light.press("ArrowRight", { delay: 50 });
    await expectTheme("dark");
    assert.equal(await page.getByRole("radio", { name: "Dark", exact: true }).isChecked(), true);
    await page.keyboard.press("Escape");
    await page.reload();
    await expectTheme("dark");

    // The dark palette stays neutral grey (no tint in any channel).
    const dark = await tokenColors(page, neutralInDark);
    for (const key of neutralInDark) {
      // Semi-transparent neutrals (e.g. shadcn's `oklch(1 0 0 / 10%)` border) round-trip through the
      // canvas's premultiplied-alpha buffer with a few units of channel drift even though the
      // underlying colour has zero chroma \u2014 tolerate that, don't require byte-exact equality.
      // Measured: Chromium's canvas 2D compositor renders `oklch(1 0 0 / 10%)` as rgb(245,255,255)
      // rather than (255,255,255,26) \u2014 a ~4% single-channel drift from its oklch\u2192sRGB conversion
      // at low alpha that is invisible on screen. 12 covers that measured case with headroom.
      const [r, g, b] = dark[key].rgb;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      assert.ok(spread <= 12, `dark --${key} must be neutral grey, got rgb(${dark[key].rgb.join(",")})`);
    }

    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: palettes, contrast, persistence, system preference, keyboard selection`);
    await context.close();
  }
} finally {
  await browser.close();
}
