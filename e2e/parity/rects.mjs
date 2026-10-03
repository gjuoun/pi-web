/**
 * Print bounding boxes of matching elements in the real app and in a preview frame, relative to
 * their region origin, so a 1px offset can be traced to the element that causes it.
 *   node e2e/parity/rects.mjs <session|new> <frameName> <name=realSelector[::index]|previewSelector[::index]> ...
 * Example: node e2e/parity/rects.mjs session app-conversation 'new=#session-sidebar button[title^="New session"]|[data-slot="sidebar-actions"] div div div'
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const [scenario, frame, ...pairs] = process.argv.slice(2);
const app = JSON.parse(readFileSync(process.env.PARITY_HOLD_FILE || "/tmp/jun/ui-parity/hold.json", "utf8"));
const browser = await chromium.launch();
const real = await browser.newPage({ viewport: { width: 1280, height: 800 }, timezoneId: "UTC", locale: "en-US" });
await real.clock.setFixedTime(new Date("2026-10-02T09:00:00Z"));
await real.goto(scenario === "new" ? `${app.base}/?cwd=${encodeURIComponent(app.projectDir)}` : `${app.base}/?session=${app.activeSessionId}`, { waitUntil: "domcontentloaded" });
await real.locator(scenario === "new" ? "[data-chat-composer-box]" : "[data-entry-id]").first().waitFor();
await real.locator("#session-sidebar").getByText(/^pi-web \(\d+\)$/).click();
await real.waitForTimeout(2000);
const preview = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
await preview.goto(`${app.base}/ui/preview`, { waitUntil: "networkidle" });
const measure = (page, selector, index, origin) => page.evaluate(([s, i, o]) => {
  const el = [...document.querySelectorAll(s)][i];
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return [b.x - o[0], b.y - o[1], b.width, b.height].map((n) => Math.round(n * 100) / 100);
}, [selector, index, origin]);
const originOf = await preview.evaluate((f) => { const b = document.querySelector(`[data-shot="${f}"]`).getBoundingClientRect(); return [b.x, b.y]; }, frame);
for (const pair of pairs) {
  const [name, rest] = pair.split(/=(.*)/s);
  const [realSel, previewSel] = rest.split("|");
  const [ps, pi = "0"] = previewSel.split("::");
  const [rs, ri = "0"] = realSel.split("::");
  const r = await measure(real, rs, Number(ri), [0, 0]);
  const p = await measure(preview, `[data-shot="${frame}"] ${ps}`, Number(pi), originOf);
  const delta = r && p ? r.map((v, i) => Math.round((p[i] - v) * 100) / 100) : null;
  console.log(`${name.padEnd(16)} real ${JSON.stringify(r)}  preview ${JSON.stringify(p)}  delta ${JSON.stringify(delta)}`);
}
await browser.close();
