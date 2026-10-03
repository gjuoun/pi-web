/**
 * Real app vs /ui/preview, region by region, as pixels.
 *
 *   node e2e/parity/run.mjs [--theme default|broismypro] [--region <name>] [--tolerance N] [--reuse] [--out /tmp/jun/ui-parity/out]
 *
 * Seeds an agent dir from the preview fixtures, starts the REAL app on it (stop the dev server on :30141
 * first and `rm -f .next/dev/lock`), loads both in the same theme at 1280x800 (UTC, en-US, a fixed
 * clock) and diffs each region. A pixel differs when a channel differs by more than --tolerance (default 8/255: anti-aliasing and
 * alpha-blend rounding between the two pages never exceeds it; see `histogram.mjs`). Prints one `parity:` line per region and a summary; exit 1 when any
 * region is outside its tolerance (default 0) or its size differs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { diffImages } from "./diff.mjs";
import { REGIONS } from "./regions.mjs";
import { startRealApp } from "./server.mjs";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : fallback; };
const theme = arg("theme", "default");
const only = arg("region");
const outDir = join(arg("out", "/tmp/jun/ui-parity/out"), theme);
mkdirSync(outDir, { recursive: true });
const globalTolerance = Number(arg("tolerance", "8"));
const thresholds = (() => { try { return JSON.parse(arg("thresholds-json", "{}")); } catch { return {}; } })();

const NOW = new Date("2026-10-02T09:00:00Z");
const hideDevOverlay = (page) => page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

/** Put the real app in the state a scenario needs and return its page. */
const scenarios = {
  session: async (page, app) => {
    await page.goto(`${app.base}/?session=${app.activeSessionId}`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-entry-id]").first().waitFor();
    await page.locator("#session-sidebar").getByText(/^pi-web \(\d+\)$/).click();
    await page.waitForTimeout(2500);
  },
  "session-hover": async (page, app) => {
    await scenarios.session(page, app);
    const box = await page.locator('[data-minimap-node-index="1"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(800);
  },
  new: async (page, app) => {
    await page.goto(`${app.base}/?cwd=${encodeURIComponent(app.projectDir)}`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-chat-composer-box]").waitFor();
    await page.locator("#session-sidebar").getByText(/^pi-web \(\d+\)$/).click();
    await page.waitForTimeout(4500);
  },
};
for (const tab of ["General", "Models", "Skills", "Plugins"]) {
  scenarios[`settings-${tab.toLowerCase()}`] = async (page, app) => {
    await scenarios.session(page, app);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.locator('[data-slot="settings-section-tab"]', { hasText: tab }).click();
    await page.waitForTimeout(1500);
  };
}

/** The smallest integer box containing a (possibly fractional) rectangle, so both sides crop alike. */
const outer = ({ x, y, width, height }) => {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  return { x: x0, y: y0, width: Math.ceil(x + width) - x0, height: Math.ceil(y + height) - y0 };
};

/**
 * Re-mount a preview frame at the top-left of the page, so every region inside it sits at the same
 * integer pixel offset the real app's regions do (the showcase page puts frames at fractional
 * offsets, which shifts text anti-aliasing). The clone keeps the frame's own width and height, so
 * its layout is unchanged, and the page's theme variables still apply.
 */
async function stagePreview(page, selector) {
  const frame = /^\[data-shot="([^"]+)"\]/.exec(selector)?.[1];
  await page.evaluate((name) => {
    document.getElementById("parity-stage")?.remove();
    const source = document.querySelector(`[data-slot="ui-preview"] [data-shot="${name}"]`);
    const stage = document.createElement("div");
    stage.id = "parity-stage";
    stage.style.cssText = "position:fixed;left:0;top:0;z-index:99999;background:var(--background);";
    stage.appendChild(source.cloneNode(true));
    document.body.appendChild(stage);
  }, frame);
  return `#parity-stage ${selector}`;
}

const shot = async (page, target) => {
  if (typeof target === "string") {
    const locator = page.locator(target).first();
    await locator.scrollIntoViewIfNeeded();
    return page.screenshot({ clip: outer(await locator.boundingBox()) });
  }
  return page.screenshot({ clip: outer(await target(page)) });
};

const holdFile = process.env.PARITY_HOLD_FILE || "/tmp/jun/ui-parity/hold.json";
// --reuse: talk to an app started by `hold.mjs` instead of seeding and starting a new one.
const app = process.argv.includes("--reuse") && existsSync(holdFile)
  ? { ...JSON.parse(readFileSync(holdFile, "utf8")), stop: async () => {} }
  : await startRealApp();
const browser = await chromium.launch();
const lines = [];
let passed = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: "UTC", locale: "en-US" });
  await context.addInitScript((id) => localStorage.setItem("pi-theme", id), theme);
  const realPage = await context.newPage();
  const previewPage = await context.newPage();
  await realPage.clock.setFixedTime(NOW);
  // The new-session header shows an update link only when a newer release exists, which the real app asks the
  // network. Pin the answer so the comparison does not depend on it.
  await realPage.route("**/api/app-update", (route) => route.fulfill({ json: { currentVersion: "0.9.1", latestVersion: "0.10.0", updateAvailable: true, releaseUrl: "https://github.com/agegr/pi-web/releases/tag/v0.10.0" } }));
  await previewPage.setViewportSize({ width: 1700, height: 1000 });
  await previewPage.goto(`${app.base}/ui/preview`, { waitUntil: "networkidle" });
  await previewPage.waitForTimeout(800);
  const diffPage = await context.newPage();

  let loaded = null;
  for (const region of REGIONS.filter((r) => !only || r.name === only)) {
    if (loaded !== region.scenario) {
      await scenarios[region.scenario](realPage, app);
      await hideDevOverlay(realPage);
      loaded = region.scenario;
    }
    const real = await shot(realPage, region.real);
    const preview = await shot(previewPage, await stagePreview(previewPage, region.preview));
    writeFileSync(join(outDir, `${region.name}.real.png`), real);
    writeFileSync(join(outDir, `${region.name}.preview.png`), preview);
    const tolerance = thresholds[region.name]?.tolerance ?? globalTolerance;
    const r = await diffImages(diffPage, real, preview, { tolerance, masks: region.masks ?? [], image: true });
    if (r.diffPng) writeFileSync(join(outDir, `${region.name}.diff.png`), r.diffPng);
    const allowed = thresholds[region.name]?.maxDifferent ?? 0;
    const ok = !r.sizeMismatch && r.different <= allowed;
    if (ok) passed++;
    lines.push(r.sizeMismatch
      ? `parity: ${region.name} SIZE real ${r.width}x${r.height} vs preview ${r.other.join("x")}`
      : `parity: ${region.name} ${r.different}px (${(r.ratio * 100).toFixed(2)}%) masked=${r.masked}${r.box ? ` box=${JSON.stringify(r.box)}` : ""}${ok ? "" : " OUT"}`);
    console.log(lines.at(-1));
  }
  const total = lines.length;
  console.log(`parity: ${passed}/${total} regions within tolerance (${theme})`);
  process.exitCode = passed === total ? 0 : 1;
} finally {
  await browser.close();
  await app.stop();
}
