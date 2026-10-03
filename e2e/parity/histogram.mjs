/**
 * Histogram of per-pixel max-channel differences between a region's real and preview screenshots
 * (from the last run.mjs), to tell anti-aliasing noise (small deltas, many pixels) from a real
 * difference (large deltas).   node e2e/parity/histogram.mjs <region> [theme=default]
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const [region, theme = "default"] = process.argv.slice(2);
const imgs = ["real", "preview"].map((k) => readFileSync(`/tmp/jun/ui-parity/out/${theme}/${region}.${k}.png`).toString("base64"));
const browser = await chromium.launch();
const page = await browser.newPage();
const hist = await page.evaluate(async (imgs) => {
  const read = async (b64) => { const img = new Image(); await new Promise((r) => { img.onload = r; img.src = `data:image/png;base64,${b64}`; }); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
  const [a, b] = await Promise.all(imgs.map(read));
  const buckets = { "1-2": 0, "3-8": 0, "9-32": 0, "33-96": 0, "97+": 0 };
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (!d) continue;
    buckets[d <= 2 ? "1-2" : d <= 8 ? "3-8" : d <= 32 ? "9-32" : d <= 96 ? "33-96" : "97+"]++;
  }
  return buckets;
}, imgs);
console.log(JSON.stringify(hist));
await browser.close();
