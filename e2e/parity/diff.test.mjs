import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { chromium } from "playwright";
import { diffImages } from "./diff.mjs";

let browser;
let page;
before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});
after(async () => { await browser?.close(); });

/** A solid-colour PNG with optional single-pixel overrides: [[x, y, [r, g, b]], ...]. */
async function png(width, height, fill, pixels = []) {
  const base64 = await page.evaluate(([w, h, f, px]) => {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = `rgb(${f.join(",")})`;
    ctx.fillRect(0, 0, w, h);
    for (const [x, y, c] of px) { ctx.fillStyle = `rgb(${c.join(",")})`; ctx.fillRect(x, y, 1, 1); }
    return canvas.toDataURL("image/png").split(",")[1];
  }, [width, height, fill, pixels]);
  return Buffer.from(base64, "base64");
}

test("identical images differ in zero pixels", async () => {
  const a = await png(20, 10, [200, 30, 30]);
  const r = await diffImages(page, a, a);
  assert.equal(r.different, 0);
  assert.equal(r.ratio, 0);
  assert.equal(r.sizeMismatch, false);
});

test("one flipped pixel is counted once, with its bounding box", async () => {
  const a = await png(20, 10, [200, 30, 30]);
  const b = await png(20, 10, [200, 30, 30], [[7, 3, [0, 0, 0]]]);
  const r = await diffImages(page, a, b);
  assert.equal(r.different, 1);
  assert.deepEqual(r.box, [7, 3, 7, 3]);
  assert.equal(r.ratio, 1 / 200);
});

test("a flipped pixel inside a mask is excluded and counted as masked", async () => {
  const a = await png(20, 10, [200, 30, 30]);
  const b = await png(20, 10, [200, 30, 30], [[7, 3, [0, 0, 0]], [15, 8, [0, 0, 0]]]);
  const r = await diffImages(page, a, b, { masks: [{ x: 5, y: 2, width: 4, height: 3, reason: "clock" }] });
  assert.equal(r.different, 1, "only the unmasked pixel counts");
  assert.equal(r.masked, 1);
  assert.deepEqual(r.box, [15, 8, 15, 8]);
});

test("a size mismatch is a hard failure, not a resize", async () => {
  const a = await png(20, 10, [1, 2, 3]);
  const b = await png(21, 10, [1, 2, 3]);
  const r = await diffImages(page, a, b);
  assert.equal(r.sizeMismatch, true);
  assert.deepEqual([r.width, r.height], [20, 10]);
  assert.deepEqual(r.other, [21, 10]);
});

test("the tolerance is per channel: a 5/255 shift passes at 6 and fails at 4", async () => {
  const a = await png(10, 10, [100, 100, 100]);
  const b = await png(10, 10, [105, 100, 100]);
  assert.equal((await diffImages(page, a, b, { tolerance: 6 })).different, 0);
  assert.equal((await diffImages(page, a, b, { tolerance: 4 })).different, 100);
  assert.equal((await diffImages(page, a, b)).different, 100, "default tolerance is exact");
});

test("a diff image is returned on request: red where pixels differ", async () => {
  const a = await png(10, 10, [10, 10, 10]);
  const b = await png(10, 10, [10, 10, 10], [[2, 2, [255, 255, 255]]]);
  const r = await diffImages(page, a, b, { image: true });
  assert.ok(Buffer.isBuffer(r.diffPng) && r.diffPng.length > 50);
  const red = await page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = `data:image/png;base64,${b64}`; });
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(2, 2, 1, 1).data.slice(0, 3));
  }, r.diffPng.toString("base64"));
  assert.deepEqual(red, [255, 0, 0]);
});
