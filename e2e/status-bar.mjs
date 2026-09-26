import assert from "node:assert/strict";

/**
 * The chat bottom bar: its two display states and the one scroll surface they share.
 *
 * Covers the bar only: `e2e/minimal-chrome.mjs` owns the composer's geometry, the rail and the
 * toggles. The bar's states are:
 *
 *   fresh      one line   `[workspace] ⟷ [model + thinking]`
 *   ongoing    line 1     `[workspace] ⟷ [session name]`
 *              line 2     `[token cluster] ⟷ [model + thinking]`
 *              line 3     the extension status line, when an extension publishes one
 *
 * Everything rides `.chat-bottom-bar`, the single horizontal scroll surface: at a phone width the
 * lines overflow and travel together rather than each strip scrolling on its own.
 *
 * Model *content* is deliberately not asserted: this suite runs against a temp agent dir with no
 * models configured, so the cluster legitimately renders its "No models" placeholder. The session
 * name is not asserted either — the fixtures are nameless.
 */

const snapshot = (page) => page.evaluate(() => {
  const surface = document.querySelector(".chat-bottom-bar");
  const inner = document.querySelector(".chat-bottom-bar-inner");
  const bar = document.querySelector('[data-slot="chat-status-bar"]');
  const textarea = document.querySelector('textarea[data-slot="chat-input-textarea"]');
  const fieldset = textarea ? textarea.closest("fieldset") : null;
  const rectOf = (el) => {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { left: rect.left, width: rect.width };
  };
  let frame = null;
  if (fieldset) {
    const style = getComputedStyle(fieldset);
    const rect = fieldset.getBoundingClientRect();
    const left = rect.left + Number.parseFloat(style.paddingLeft);
    const right = rect.right - Number.parseFloat(style.paddingRight);
    frame = { left, width: right - left };
  }
  const lineEls = Array.from(document.querySelectorAll('[data-slot="chat-status-line"]'));
  return {
    hasSurface: Boolean(surface),
    hasBar: Boolean(bar),
    isFresh: bar ? bar.getAttribute("data-state") === "fresh" : false,
    hasStats: Boolean(bar && bar.querySelector('[data-slot="chat-status-stats"]')),
    hasName: Boolean(bar && bar.querySelector('[data-slot="chat-status-name"]')),
    hasFold: Boolean(surface && surface.querySelector('[data-chrome-toggle="status-fold"]')),
    borderTopWidth: bar ? getComputedStyle(bar).borderTopWidth : null,
    // Nothing inside the surface may scroll on its own, or the lines would move independently.
    // The extension strip only exists when an extension publishes a status; the unit suite pins it.
    innerOverflowX: [bar, document.querySelector('[data-slot="chat-status-ext"]')]
      .filter(Boolean)
      .map((el) => getComputedStyle(el).overflowX),
    lines: lineEls.map((line) => Array.from(line.children).map((child) => child.getAttribute("data-slot") ?? child.className)),
    lineLefts: lineEls.map((line) => (line.firstElementChild ? line.firstElementChild.getBoundingClientRect().left : null)),
    surface: surface
      ? { ...rectOf(surface), clientWidth: surface.clientWidth, scrollWidth: surface.scrollWidth, scrollLeft: surface.scrollLeft }
      : null,
    // The inset lives on the inner block, so the composer's frame is that block's *content* box:
    // its border box starts one inline padding to the left of it.
    inner: rectOf(inner),
    innerContent: inner
      ? (() => {
          const style = getComputedStyle(inner);
          const rect = inner.getBoundingClientRect();
          const left = rect.left + Number.parseFloat(style.paddingLeft);
          const right = rect.right - Number.parseFloat(style.paddingRight);
          return { left, width: right - left };
        })()
      : null,
    frame,
  };
});

const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;
const has = (line, slot) => line.some((value) => value === slot || value.split(/\s+/).includes(slot));

export async function checkStatusBar(page, { base, cwd, sessionId }) {
  const restore = page.viewportSize();
  await page.goto(`${base}/?session=${sessionId}`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-slot="chat-status-bar"]').waitFor();
  await page.waitForFunction(() => (document.querySelector('[data-slot="chat-status-bar"]')?.innerText ?? "").trim().length > 0);

  const ongoing = await snapshot(page);
  assert.ok(ongoing.hasBar && ongoing.hasSurface, "the bar renders inside its scroll surface");
  assert.equal(ongoing.isFresh, false, "a session in progress is not fresh");
  assert.equal(ongoing.lines.length, 2, `an ongoing session shows two lines, got ${ongoing.lines.length}`);
  assert.ok(has(ongoing.lines[0], "chat-status-project"), `line 1 must lead with the workspace, got ${ongoing.lines[0]}`);
  assert.ok(has(ongoing.lines[1], "chat-status-stats"), `line 2 must lead with the token cluster, got ${ongoing.lines[1]}`);
  assert.ok(has(ongoing.lines[1], "chat-status-model"), `line 2 must close with the model cluster, got ${ongoing.lines[1]}`);
  assert.ok(ongoing.hasStats, "the ongoing bar carries the token cluster");
  assert.equal(ongoing.hasName, false, "these fixtures are nameless, so no name segment renders");
  assert.equal(ongoing.hasFold, false, "the bar offers no fold control — it is always fully displayed");
  // The bar draws no line of its own — the input's bottom rule separates it.
  assert.equal(ongoing.borderTopWidth, "0px", `the bar must not draw its own line, got ${ongoing.borderTopWidth}`);
  assert.ok(
    ongoing.innerOverflowX.length >= 1 && ongoing.innerOverflowX.every((value) => value === "visible"),
    `no strip may scroll on its own, got ${ongoing.innerOverflowX}`,
  );
  // The bar follows the composer's frame — same inline inset, same width — instead of a reading cap.
  assert.ok(
    ongoing.frame && ongoing.innerContent && near(ongoing.innerContent.left, ongoing.frame.left, 2),
    `the bar must start on the content edge: bar=${ongoing.innerContent?.left} frame=${ongoing.frame?.left}`,
  );
  assert.ok(
    ongoing.frame && ongoing.innerContent && ongoing.innerContent.width >= ongoing.frame.width - 1,
    `the bar must span the content width: bar=${ongoing.innerContent?.width} frame=${ongoing.frame?.width}`,
  );
  console.log("PASS: bottom bar — ongoing state is [workspace][name] over [counters][model]");

  // The surface is the bar: at a phone width the lines overflow and move together. The viewport is
  // restored in a finally, so a failure here cannot narrow every later spec in the run.
  try {
    await page.setViewportSize({ width: 320, height: restore?.height ?? 720 });
    await page.waitForTimeout(400);
    const narrow = await snapshot(page);
    assert.ok(
      narrow.surface && narrow.surface.scrollWidth > narrow.surface.clientWidth,
      `the bar must overflow at 320px: scrollWidth=${narrow.surface?.scrollWidth} clientWidth=${narrow.surface?.clientWidth}`,
    );
    const shifted = await page.evaluate(() => {
      const surface = document.querySelector(".chat-bottom-bar");
      if (surface) surface.scrollLeft = 60;
      return {
        scrollLeft: surface ? surface.scrollLeft : null,
        lefts: Array.from(document.querySelectorAll('[data-slot="chat-status-line"]')).map((line) =>
          line.firstElementChild ? line.firstElementChild.getBoundingClientRect().left : null),
      };
    });
    assert.ok(shifted.scrollLeft > 0, "the scroll surface did not move");
    const deltas = shifted.lefts.map((left, i) => left - narrow.lineLefts[i]);
    assert.ok(
      deltas.length === 2 && deltas.every((delta) => near(delta, -shifted.scrollLeft, 1.5)),
      `every line must travel with the surface: deltas=${deltas} scrollLeft=${shifted.scrollLeft}`,
    );
    console.log("PASS: bottom bar — 320px overflow scrolls both lines together");
  } finally {
    await page.setViewportSize(restore ?? { width: 1280, height: 720 });
  }

  await page.goto(`${base}/?cwd=${encodeURIComponent(cwd)}`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-slot="chat-status-bar"][data-state="fresh"]').waitFor();
  await page.waitForTimeout(1000);
  const fresh = await snapshot(page);
  assert.equal(fresh.isFresh, true, "a new session shows the fresh state");
  assert.equal(fresh.hasStats, false, "the fresh bar shows no token cluster");
  assert.equal(fresh.hasName, false, "the fresh bar shows no session name");
  assert.equal(fresh.hasFold, false, "the bar never offers a fold control");
  assert.equal(fresh.lines.length, 1, `a new session shows one line, got ${fresh.lines.length}`);
  assert.ok(
    has(fresh.lines[0], "chat-status-project") && has(fresh.lines[0], "chat-status-model"),
    `the fresh line must be [workspace][model], got ${fresh.lines[0]}`,
  );
  assert.ok(
    fresh.innerOverflowX.length >= 1 && fresh.innerOverflowX.every((value) => value === "visible"),
    `no strip may scroll on its own, got ${fresh.innerOverflowX}`,
  );
  assert.ok(
    fresh.frame && fresh.innerContent && near(fresh.innerContent.left, fresh.frame.left, 2)
      && fresh.innerContent.width >= fresh.frame.width - 1,
    `the fresh bar must span the content frame: bar=${fresh.innerContent?.left}/${fresh.innerContent?.width} frame=${fresh.frame?.left}/${fresh.frame?.width}`,
  );
  console.log("PASS: bottom bar — fresh state is one [workspace][model] line with no counters");
}
