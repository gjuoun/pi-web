import assert from "node:assert/strict";

/**
 * The chat status row's two display states.
 *
 * Covers the row only: `e2e/minimal-chrome.mjs` owns the composer's geometry, the rail and the
 * toggles. The row's states are:
 *
 *   fresh      `[model] ⟷ [project]`, no name, no tokens, no fold control
 *   ongoing    `[model] [project] [session name]` left, `[token cluster]` right, foldable
 *
 * Model *content* is deliberately not asserted: this suite runs against a temp agent dir with no
 * models configured, so the cluster legitimately renders its "No models" placeholder. The session
 * name is not asserted either — the fixtures are nameless.
 */

const snapshot = (page) => page.evaluate(() => {
  const bar = document.querySelector(".chat-status-bar");
  const textarea = document.querySelector("textarea.chat-input-textarea");
  const fieldset = textarea ? textarea.closest("fieldset") : null;
  let frame = null;
  if (fieldset) {
    const style = getComputedStyle(fieldset);
    const rect = fieldset.getBoundingClientRect();
    const left = rect.left + Number.parseFloat(style.paddingLeft);
    const right = rect.right - Number.parseFloat(style.paddingRight);
    frame = { left, width: right - left };
  }
  const rect = bar ? bar.getBoundingClientRect() : null;
  return {
    hasBar: Boolean(bar),
    className: bar ? bar.className : null,
    hasStats: Boolean(bar && bar.querySelector(".chat-status-stats")),
    hasName: Boolean(bar && bar.querySelector(".chat-status-name")),
    hasFold: Boolean(bar && bar.querySelector('[data-chrome-toggle="status-fold"]')),
    borderTopWidth: bar ? getComputedStyle(bar).borderTopWidth : null,
    segments: bar ? Array.from(bar.children).map((child) => child.className) : null,
    text: bar ? (bar.innerText || "").replace(/\s+/g, " ").trim() : null,
    bar: rect ? { left: rect.left, width: rect.width } : null,
    frame,
  };
});

const near = (a, b) => Math.abs(a - b) <= 1;
const at = (segments, cls) => segments.findIndex((value) => value.split(/\s+/).includes(cls));

export async function checkStatusBar(page, { base, cwd, sessionId }) {
  await page.goto(`${base}/?session=${sessionId}`, { waitUntil: "domcontentloaded" });
  await page.locator(".chat-status-bar").waitFor();
  await page.waitForFunction(() => (document.querySelector(".chat-status-bar")?.innerText ?? "").trim().length > 0);

  const ongoing = await snapshot(page);
  assert.ok(ongoing.hasBar, "the status row renders");
  assert.doesNotMatch(ongoing.className, /is-fresh/, "a session in progress is not fresh");
  // [model][project][name][stats] — the name only when the session has one, which these fixtures do not.
  const order = ["chat-status-model", "chat-status-project", "chat-status-stats"].map((cls) => at(ongoing.segments, cls));
  assert.ok(
    order.every((index) => index >= 0) && order[0] < order[1] && order[1] < order[2],
    `the ongoing row must be [model][project]([name])[stats], got ${ongoing.segments}`,
  );
  assert.ok(ongoing.hasStats, "the ongoing row carries the token cluster");
  assert.equal(ongoing.hasFold, false, "the row offers no fold control — it is always fully displayed");
  // The row draws no line of its own — the input's bottom rule separates it.
  assert.equal(ongoing.borderTopWidth, "0px", `the row must not draw its own line, got ${ongoing.borderTopWidth}`);
  // Full width now, matching the composer above it rather than a reading-width cap. It shares its line
  // with the composer-hide control, so it spans the content width *apart from that control*.
  assert.ok(
    ongoing.frame !== null && ongoing.bar !== null && near(ongoing.bar.left, ongoing.frame.left, 2),
    `the row must start on the content edge: bar=${ongoing.bar?.left} frame=${ongoing.frame?.left}`,
  );
  assert.ok(
    ongoing.frame !== null && ongoing.bar !== null
      && ongoing.bar.width > ongoing.frame.width - 40 && ongoing.bar.width <= ongoing.frame.width,
    `the row must span the content width apart from its own controls: bar=${ongoing.bar?.width} frame=${ongoing.frame?.width}`,
  );
  console.log("PASS: status row — ongoing state spans the content width and is always fully displayed");

  await page.goto(`${base}/?cwd=${encodeURIComponent(cwd)}`, { waitUntil: "domcontentloaded" });
  await page.locator(".chat-status-bar.is-fresh").waitFor();
  await page.waitForTimeout(1000);
  const fresh = await snapshot(page);
  assert.match(fresh.className, /is-fresh/, "a new session shows the fresh state");
  assert.equal(fresh.hasStats, false, "the fresh row shows no token cluster");
  assert.equal(fresh.hasName, false, "the fresh row shows no session name");
  assert.equal(fresh.hasFold, false, "the row never offers a fold control");
  const freshOrder = ["chat-status-model", "chat-status-project"].map((cls) => at(fresh.segments, cls));
  assert.ok(
    freshOrder.every((index) => index >= 0) && freshOrder[0] < freshOrder[1],
    `the fresh row must be exactly [model][project], got ${fresh.segments}`,
  );
  assert.ok(
    fresh.frame !== null && fresh.bar !== null && near(fresh.bar.left, fresh.frame.left, 2)
      && fresh.bar.width > fresh.frame.width - 40,
    `the fresh row must span the content width apart from its own controls: bar=${fresh.bar?.left}/${fresh.bar?.width} frame=${fresh.frame?.left}/${fresh.frame?.width}`,
  );
  console.log("PASS: status row — fresh state is [model][project] at full width with no fold control");
}
