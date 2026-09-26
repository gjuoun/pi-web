import assert from "node:assert/strict";

/**
 * The minimal-chrome pass, as a regression.
 *
 * Covers the ruled composer (two rules, no side edges), focus drawn on the rules rather than as a
 * closed outline, the state rail, the contextual action set, the foldable status row and the
 * hideable input.
 *
 * Deliberately NOT asserted here: model content (the temp agent dir has no models, so the cluster
 * legitimately shows its `No models` placeholder), a session name (the fixtures are nameless), any
 * hard-coded width (the suite leaves the content-width preference non-default), and the folded row's
 * *height* — the row is a single line, so folding drops its segments and cannot change its height.
 */

const snapshot = (page) => page.evaluate(() => {
  const px = (v) => Number.parseFloat(v ?? "0") || 0;
  const textarea = document.querySelector('textarea[data-slot="chat-input-textarea"]');
  const rail = document.querySelector('[data-chat-rail]');
  const railStyle = rail ? getComputedStyle(rail) : null;
  const statusBar = document.querySelector('[data-slot="chat-status-bar"]');
  return {
    hasComposer: Boolean(textarea),
    rail: rail
      ? {
          state: rail.getAttribute('data-state'),
          border: [railStyle.borderTopWidth, railStyle.borderRightWidth, railStyle.borderBottomWidth, railStyle.borderLeftWidth].map(px),
          outlineStyle: railStyle.outlineStyle,
          shadow: railStyle.boxShadow,
          ariaLabel: document.querySelector('[data-chat-rail-status]')?.getAttribute('aria-label') ?? null,
        }
      : null,
    actions: Array.from(document.querySelectorAll('[data-chat-action]')).map((el) => el.getAttribute('data-chat-action')).sort(),
    hasFoldToggle: Boolean(document.querySelector('[data-chrome-toggle="status-fold"]')),
    hasStats: Boolean(document.querySelector('[data-slot="chat-status-stats"]')),
    hasRestore: Boolean(document.querySelector('[data-chrome-restore="composer"]')),
    hasHideToggle: Boolean(document.querySelector('[data-chrome-toggle="composer-hide"]')),
    hasActionsToggle: Boolean(document.querySelector('[data-chat-actions-toggle]')),
    statusBarPresent: Boolean(statusBar),
  };
});

export async function checkMinimalChrome(page, { base, cwd, sessionId }) {
  await page.goto(`${base}/?session=${sessionId}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-chat-rail]").waitFor();
  await page.waitForFunction(() => (document.querySelector('[data-slot="chat-status-bar"]')?.innerText ?? "").trim().length > 0);

  const base_ = await snapshot(page);

  // The input is framed by a rule above and below, and nothing on the sides.
  assert.ok(base_.rail, "the composer must carry a state rail");
  assert.deepEqual(base_.rail.border, [1, 0, 1, 0], `rules must be top+bottom only, got ${base_.rail.border}`);
  assert.equal(base_.rail.state, "idle", "a session at rest must report the idle state");
  assert.equal(base_.rail.ariaLabel, null, "an idle rail must not claim a state or open a live region");

  // Collapsed, the input is text and one disclosure control — no action icons beside the draft.
  assert.deepEqual(base_.actions, [], `a collapsed empty input offered ${base_.actions}`);
  assert.equal(base_.hasActionsToggle, true, "the input must offer a disclosure control");
  await page.locator("[data-chat-actions-toggle]").first().click();
  await page.waitForTimeout(250);
  assert.deepEqual(
    (await snapshot(page)).actions,
    ["attach", "send"],
    "opening the bar must reveal attach + send",
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  assert.deepEqual((await snapshot(page)).actions, [], "Escape must collapse the bar again");

  // Focus rides the rules — and must not be a closed outline, which would put the side edges back.
  await page.locator('textarea[data-slot="chat-input-textarea"]').focus();
  await page.waitForTimeout(250);
  const focused = await snapshot(page);
  assert.equal(focused.rail.outlineStyle, "none", "focus must not draw a closed outline");
  assert.match(focused.rail.shadow, /inset/, `focus must add inset bands, got ${focused.rail.shadow}`);
  await page.locator('textarea[data-slot="chat-input-textarea"]').blur();
  console.log("PASS: minimal chrome — two rules, no side edges, focus drawn on the rules");

  // Nothing folds and nothing is hidden by a control: the row and the input are always displayed.
  assert.equal(base_.hasFoldToggle, false, "the row must offer no fold control");
  assert.equal(base_.hasHideToggle, false, "the input must offer no hide control");
  assert.ok(base_.hasStats, "the row always carries its token cluster");

  // The input still hides by keyboard, and comes back the same way.
  await page.keyboard.press("ControlOrMeta+j");
  await page.waitForTimeout(300);
  const hidden = await snapshot(page);
  assert.equal(hidden.hasComposer, false, "the keyboard must hide the input");
  assert.ok(hidden.statusBarPresent, "the status row stays visible while the input is hidden");
  await page.keyboard.press("ControlOrMeta+j");
  await page.waitForTimeout(300);
  assert.ok((await snapshot(page)).hasComposer, "the keyboard must bring the input back");
  console.log("PASS: minimal chrome — nothing folds; the input is always shown and hides by keyboard");

  // `/` is the bare-key shortcut for "put the caret in the composer" — the web convention, and the
  // first bare key this app binds, so its guards matter as much as its happy path.
  const composer = () => page.evaluate(() => ({
    active: String((document.activeElement && document.activeElement.className) || ""),
    value: document.querySelector('textarea[data-slot="chat-input-textarea"]')?.value ?? null,
  }));
  const blur = () => page.evaluate(() => {
    const el = document.activeElement;
    if (el && typeof el.blur === "function") el.blur();
  });

  // From the page: the caret lands in the composer, and an empty one takes the `/` so the palette opens.
  await blur();
  await page.keyboard.press("/");
  await page.waitForTimeout(300);
  const fromPage = await composer();
  assert.ok(fromPage.active.includes("min-w-0"), "`/` must move the caret into the composer, got " + fromPage.active);
  assert.equal(fromPage.value, "/", "an empty composer takes the `/` with it, so the slash palette opens");

  // Already typing: `/` is just a character. The guard must not eat it or reach for focus.
  await page.keyboard.press("/");
  assert.equal((await composer()).value, "//", "a `/` pressed while the composer has focus must type normally");

  // With a draft present the shortcut only focuses — insertIfEmpty never clobbers written text.
  await blur();
  await page.keyboard.press("/");
  await page.waitForTimeout(300);
  const withDraft = await composer();
  assert.ok(withDraft.active.includes("min-w-0"), "`/` must still focus when a draft is present");
  assert.equal(withDraft.value, "//", "the shortcut must not touch a draft");
  // The composer is reloaded by the navigation below, so `//` cannot leak into the next check.
  console.log("PASS: minimal chrome — / focuses the composer and never eats a keystroke");

  // The fresh row is already only [model] [project], so it must offer no fold control.
  await page.goto(`${base}/?cwd=${encodeURIComponent(cwd)}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-chat-rail]").waitFor();
  await page.waitForTimeout(1200);
  const fresh = await snapshot(page);
  assert.equal(fresh.hasFoldToggle, false, "the row never offers a fold control");
  assert.deepEqual(fresh.rail.border, [1, 0, 1, 0], "the fresh composer is framed the same way");
  console.log("PASS: minimal chrome — the fresh row keeps its rules and offers no controls");
}
