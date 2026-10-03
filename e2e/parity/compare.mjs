/**
 * Zoomed side-by-side of a crop of a region's real and preview screenshots (from the last run.mjs).
 *   node e2e/parity/compare.mjs <region> <x> <y> <w> <h> [scale=4] [theme=default]
 * Writes /tmp/jun/ui-parity/out/<theme>/<region>.cmp.png: real | preview | diff, nearest-neighbour scaled.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const [region, x, y, w, h, scale = "4", theme = "default"] = process.argv.slice(2);
const dir = `/tmp/jun/ui-parity/out/${theme}`;
const [real, preview, diff] = ["real", "preview", "diff"].map((k) => readFileSync(`${dir}/${region}.${k}.png`).toString("base64"));
const browser = await chromium.launch();
const page = await browser.newPage();
const out = await page.evaluate(async ({ imgs, x, y, w, h, s }) => {
  const load = (b64) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/png;base64,${b64}`; });
  const canvas = document.createElement("canvas");
  canvas.width = (w * s + 8) * 3; canvas.height = h * s;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#888"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let k = 0; k < 3; k++) { const img = await load(imgs[k]); ctx.drawImage(img, x, y, w, h, k * (w * s + 8), 0, w * s, h * s); }
  return canvas.toDataURL("image/png").split(",")[1];
}, { imgs: [real, preview, diff], x: +x, y: +y, w: +w, h: +h, s: +scale });
writeFileSync(`${dir}/${region}.cmp.png`, Buffer.from(out, "base64"));
console.log(`${dir}/${region}.cmp.png`);
await browser.close();
