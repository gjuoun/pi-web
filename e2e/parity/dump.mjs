/**
 * Print the real app's DOM for a region, so a replica can be ported from the real markup and classes.
 *   node e2e/parity/dump.mjs <scenario: session|new|settings-general|settings-models|settings-skills|settings-plugins> <css selector> [--reuse is implied] [--depth N]
 * Needs the app started by hold.mjs. Inline <svg> bodies are collapsed to their path data.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const [scenario, selector] = process.argv.slice(2);
const app = JSON.parse(readFileSync(process.env.PARITY_HOLD_FILE || "/tmp/jun/ui-parity/hold.json", "utf8"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, timezoneId: "UTC", locale: "en-US" });
await page.clock.setFixedTime(new Date("2026-10-02T09:00:00Z"));
const url = scenario === "new" ? `${app.base}/?cwd=${encodeURIComponent(app.projectDir)}` : `${app.base}/?session=${app.activeSessionId}`;
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.locator(scenario === "new" ? "[data-chat-composer-box]" : "[data-entry-id]").first().waitFor();
await page.locator("#session-sidebar").getByText(/^pi-web \(\d+\)$/).click();
await page.waitForTimeout(2000);
if (scenario?.startsWith("settings-")) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator('[data-slot="settings-section-tab"]', { hasText: new RegExp(scenario.slice(9), "i") }).click();
  await page.waitForTimeout(2000);
}
const html = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return `no match for ${sel}`;
  const clone = el.cloneNode(true);
  clone.querySelectorAll("svg").forEach((svg) => { const d = [...svg.querySelectorAll("path,circle,rect,line,polyline")].map((n) => `${n.tagName}${n.getAttribute("d") ? `[${n.getAttribute("d")}]` : ""}`).join(" "); svg.replaceWith(Object.assign(document.createElement("svg-"), { textContent: `${svg.getAttribute("width")}x${svg.getAttribute("height")} ${svg.getAttribute("class") || ""} ${d.slice(0, 160)}` })); });
  return clone.outerHTML.replace(/ (style="[^"]*")/g, (m, s) => ` ${s}`).replace(/></g, ">\n<");
}, selector);
console.log(html);
await browser.close();
