import assert from "node:assert/strict";
import { join } from "node:path";

/**
 * /ui/lib — the component library page renders with the one palette and its overlays open.
 *
 * Static markup cannot see a portaled overlay (AGENTS.md test policy), so each overlay specimen is
 * opened in the browser and the browser is asked what owns the pixel at the centre of its content.
 */
const OVERLAYS = [
  { demo: "ui-dialog", content: "dialog-content" },
  { demo: "ui-alert-dialog", content: "alert-dialog-content" },
  { demo: "ui-dropdown-menu", content: "dropdown-menu-content" },
  { demo: "ui-popover", content: "popover-content" },
  { demo: "ui-select", content: "select-content" },
];

export async function checkUiLib(page, { base, artifacts }) {
  const problems = [];
  const onPageError = (error) => problems.push(String(error));
  const onConsole = (message) => message.type() === "error" && problems.push(message.text());
  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  await page.goto(`${base}/ui/lib`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-slot="ui-lib"]').waitFor();

  const palette = await page.evaluate(() => {
    const root = document.documentElement;
    const swatch = document.querySelector('[data-swatch="primary"] > div');
    return {
      primary: getComputedStyle(root).getPropertyValue("--primary").trim(),
      swatchBackground: swatch ? getComputedStyle(swatch).backgroundColor : null,
      dark: root.classList.contains("dark"),
      themeAttribute: root.getAttribute("data-theme"),
    };
  });
  assert.equal(palette.primary, "#00337c", "the raw --primary variable is the palette navy");
  assert.equal(palette.swatchBackground, "rgb(0, 51, 124)", "the primary swatch paints with bg-primary");
  assert.equal(palette.dark, false, "the default theme is light: no dark class");
  assert.equal(palette.themeAttribute, "default", "the pre-paint script sets the default theme");

  await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-slot="ui-lib"]').evaluate((node) => node.scrollTop), 0, "hydration must not scroll the page (cmdk scrollIntoView)");
  const scroll = await page.locator('[data-slot="ui-lib"]').evaluate(async (node) => {
    const scrollable = node.scrollHeight > node.clientHeight;
    node.scrollTop = node.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const moved = node.scrollTop > 0;
    node.scrollTop = 0;
    return { scrollable, moved };
  });
  assert.deepEqual(scroll, { scrollable: true, moved: true }, "the library page scrolls (html/body are overflow:hidden in the app shell)");

  const sections = await page.locator("[data-section]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-section")));
  assert.deepEqual(sections, ["foundations", "primitives", "components", "themes"]);

  // Each theme scope resolves its own variables, whatever theme the page is in.
  const scopes = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-theme-scope]")].map((scope) => {
    const button = scope.querySelector('[data-slot="button"]');
    const input = scope.querySelector('[data-slot="input"]');
    return [scope.getAttribute("data-theme-scope"), {
      background: getComputedStyle(scope).backgroundColor,
      color: getComputedStyle(scope).color,
      primary: button ? getComputedStyle(button).backgroundColor : null,
      inputBackground: input ? getComputedStyle(input).backgroundColor : null,
    }];
  })));
  assert.equal(scopes.default.background, "rgb(255, 255, 255)", "default scope canvas");
  assert.equal(scopes.default.primary, "rgb(0, 51, 124)", "default scope primary button");
  assert.equal(scopes.broismypro.background, "rgb(13, 0, 51)", "broismypro scope canvas");
  assert.equal(scopes.broismypro.color, "rgb(232, 235, 255)", "broismypro scope text");
  assert.equal(scopes.broismypro.primary, "rgb(77, 179, 223)", "broismypro scope primary button");
  assert.notEqual(scopes.broismypro.inputBackground, scopes.default.inputBackground, "dark: utilities apply inside the dark scope only");

  for (const { demo, content } of OVERLAYS) {
    await page.locator(`[data-demo="${demo}"]`).scrollIntoViewIfNeeded();
    await page.locator(`[data-demo="${demo}"]`).click();
    const panel = page.locator(`[data-slot="${content}"]`).first();
    await panel.waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    // A modal Radix overlay sets `pointer-events: none` on <body>, which hides everything from hit
    // testing; restore it so the probe asks about paint order only.
    const probe = await page.addStyleTag({ content: "* { pointer-events: auto !important; }" });
    const covered = await panel.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return !hit || !node.contains(hit);
    });
    await probe.evaluate((tag) => tag.remove());
    assert.equal(covered, false, `${demo}: its content must paint above the page`);
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached" });
  }

  await page.screenshot({ path: join(artifacts, "ui-lib.png"), fullPage: true });
  page.off("pageerror", onPageError);
  page.off("console", onConsole);
  assert.deepEqual(problems, [], "no browser errors on /ui/lib");
  console.log("PASS: /ui/lib renders the palette, every section, and its overlays open above the page");
}
