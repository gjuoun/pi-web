/**
 * Pixel diff of two PNG buffers, computed in a browser page (canvas decode) so no image library is
 * needed. Pass any Playwright `Page`; it is only used as a canvas host.
 *
 *   diffImages(page, a, b, { tolerance, masks, image }) →
 *     { width, height, different, masked, ratio, box, sizeMismatch, other, diffPng? }
 *
 * - `tolerance`: a pixel differs when ANY of its r/g/b channels differs by more than this (default 0).
 * - `masks`: `{ x, y, width, height, reason }` rectangles excluded from the comparison and counted in
 *   `masked` (only where the two images actually differ, so an unused mask costs nothing).
 * - A size mismatch is a hard failure: `sizeMismatch: true`, `other: [w, h]`, nothing is resized.
 * - `image: true` adds `diffPng`: the faded original with every differing pixel painted red.
 */
export async function diffImages(page, a, b, { tolerance = 0, masks = [], image = false } = {}) {
  const result = await page.evaluate(async ({ a64, b64, tolerance, masks, image }) => {
    const load = (b64) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = `data:image/png;base64,${b64}`;
    });
    const [ia, ib] = await Promise.all([load(a64), load(b64)]);
    if (ia.width !== ib.width || ia.height !== ib.height) {
      return { width: ia.width, height: ia.height, other: [ib.width, ib.height], sizeMismatch: true, different: -1, masked: 0, ratio: 1, box: null };
    }
    const { width, height } = ia;
    const read = (img) => {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, width, height);
    };
    const da = read(ia);
    const db = read(ib);
    const out = image ? new ImageData(new Uint8ClampedArray(da.data.length), width, height) : null;
    let different = 0, masked = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    const inMask = (x, y) => masks.some((m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height);
    for (let i = 0, p = 0; i < da.data.length; i += 4, p++) {
      const x = p % width, y = (p - x) / width;
      const differs = Math.abs(da.data[i] - db.data[i]) > tolerance || Math.abs(da.data[i + 1] - db.data[i + 1]) > tolerance || Math.abs(da.data[i + 2] - db.data[i + 2]) > tolerance;
      if (differs && inMask(x, y)) masked++;
      else if (differs) {
        different++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (out) {
        if (differs && !inMask(x, y)) { out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 0; }
        else { out.data[i] = 255 - (255 - da.data[i]) * 0.25; out.data[i + 1] = 255 - (255 - da.data[i + 1]) * 0.25; out.data[i + 2] = 255 - (255 - da.data[i + 2]) * 0.25; }
        out.data[i + 3] = 255;
      }
    }
    let diffPng;
    if (out) {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").putImageData(out, 0, 0);
      diffPng = canvas.toDataURL("image/png").split(",")[1];
    }
    return { width, height, sizeMismatch: false, different, masked, ratio: different / (width * height), box: different ? [x0, y0, x1, y1] : null, diffPng };
  }, { a64: a.toString("base64"), b64: b.toString("base64"), tolerance, masks, image });
  if (result.diffPng) result.diffPng = Buffer.from(result.diffPng, "base64");
  else delete result.diffPng;
  return result;
}
