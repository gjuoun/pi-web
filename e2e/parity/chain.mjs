/**
 * Print the ancestor chain (tag, classes, box) of a real element, to learn the layout around it.
 *   node e2e/parity/chain.mjs <session|new> '<selector>' [levels=8]
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
const [scenario, selector, levels = "8"] = process.argv.slice(2);
const app = JSON.parse(readFileSync(process.env.PARITY_HOLD_FILE || "/tmp/jun/ui-parity/hold.json", "utf8"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, timezoneId: "UTC", locale: "en-US" });
await page.clock.setFixedTime(new Date("2026-10-02T09:00:00Z"));
await page.goto(scenario === "new" ? `${app.base}/?cwd=${encodeURIComponent(app.projectDir)}` : `${app.base}/?session=${app.activeSessionId}`, { waitUntil: "domcontentloaded" });
await page.locator(scenario === "new" ? "[data-chat-composer-box]" : "[data-entry-id]").first().waitFor();
await page.locator("#session-sidebar").getByText(/^pi-web \(\d+\)$/).click();
await page.waitForTimeout(2000);
console.log((await page.evaluate(([sel, n]) => {
  const out = []; let el = document.querySelector(sel);
  for (let i = 0; el && i <= n; i++, el = el.parentElement) {
    const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    out.push(`${"  ".repeat(i)}<${el.tagName.toLowerCase()}> [${Math.round(b.x * 100) / 100},${Math.round(b.y * 100) / 100},${Math.round(b.width * 100) / 100},${Math.round(b.height * 100) / 100}] pad=${cs.padding} mar=${cs.margin} disp=${cs.display} :: ${String(el.className).slice(0, 170)}`);
  }
  return out.join("\n");
}, [selector, Number(levels)])));
await browser.close();
