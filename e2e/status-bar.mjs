import assert from "node:assert/strict";

/**
 * The chat status row has two display states:
 *
 *   fresh    `[provider/model] ⟷ [project]`, sized to the composer's own content box
 *   ongoing  `[provider/model] [project] [session name]` left, `[token info]` right, full width
 *
 * The fresh state is asserted geometrically — the bar's border box must land on the composer's
 * `max-width`-bearing ancestor box — because that is the actual "same width as the input" claim and a
 * class-name assertion would pass on a bar that merely looks right.
 *
 * Model *content* is deliberately not asserted: this suite runs against a temp agent dir with no
 * models configured, so the cluster legitimately renders its "No models" placeholder here.
 */

const snapshot = (page) => page.evaluate(() => {
  const bar = document.querySelector(".chat-status-bar");
  const textarea = document.querySelector("textarea.chat-input-textarea");

  // The composer's own content box: the nearest ancestor of the textarea that declares a max-width.
  let composer = null;
  for (let node = textarea; node; node = node.parentElement) {
    const maxWidth = getComputedStyle(node).maxWidth;
    if (maxWidth && maxWidth !== "none" && maxWidth !== "0px") {
      const rect = node.getBoundingClientRect();
      composer = { left: rect.left, width: rect.width };
      break;
    }
  }

  const rect = bar ? bar.getBoundingClientRect() : null;
  const fieldset = textarea ? textarea.closest("fieldset") : null;

  // The full bottom-bar width: the composer frame's own content box. This — not the composer's 820px
  // box — is what "full width" means, and unlike the composer box it does not move when the
  // chat-content-width preference changes.
  let available = null;
  if (fieldset) {
    const style = getComputedStyle(fieldset);
    const frame = fieldset.getBoundingClientRect();
    const left = frame.left + parseFloat(style.paddingLeft);
    const right = frame.right - parseFloat(style.paddingRight);
    available = { left, width: right - left };
  }

  return {
    className: bar ? bar.className : null,
    segments: bar
      ? Array.from(bar.children).map((child) => child.className)
      : null,
    bar: rect ? { left: rect.left, width: rect.width } : null,
    composer,
    available,
  };
});

const near = (a, b) => Math.abs(a - b) <= 1;

export async function checkStatusBar(page, { base, cwd, sessionId }) {
  await page.goto(`${base}/?cwd=${encodeURIComponent(cwd)}`, { waitUntil: "domcontentloaded" });
  await page.locator(".chat-status-bar.is-fresh").waitFor();
  const fresh = await snapshot(page);
  assert.ok(fresh.className.split(/\s+/).includes("is-fresh"), `Fresh row must carry is-fresh: ${fresh.className}`);
  assert.deepEqual(
    fresh.segments,
    ["chat-status-model", "chat-status-project"],
    "The fresh row must be exactly [model][project] — no name and no token segment",
  );
  assert.ok(fresh.composer, "The composer's content box must be measurable");
  assert.ok(
    near(fresh.bar.left, fresh.composer.left),
    `Fresh row must start on the composer box: bar=${fresh.bar.left} composer=${fresh.composer.left}`,
  );
  assert.ok(
    near(fresh.bar.width, fresh.composer.width),
    `Fresh row must match the composer box width: bar=${fresh.bar.width} composer=${fresh.composer.width}`,
  );
  console.log("PASS: fresh status row narrows to the composer box and shows only [model][project]");

  await page.goto(`${base}/?session=${sessionId}`, { waitUntil: "domcontentloaded" });
  await page.locator(".chat-status-bar").waitFor();
  await page.waitForFunction(() => {
    const bar = document.querySelector(".chat-status-bar");
    return Boolean(bar && (bar.innerText || "").trim().length > 0);
  });
  const ongoing = await snapshot(page);
  assert.ok(
    !ongoing.className.split(/\s+/).includes("is-fresh"),
    `A session in progress must not be narrowed: ${ongoing.className}`,
  );
  // The session name is optional — these fixtures are nameless — so the contract is
  // `[model][project]([name])[stats]`: the three required segments in order, with the name, when it
  // exists, sitting between the project and the token cluster. The named variant is covered by the
  // plan's browser drive, which opens a real named session.
  assert.deepEqual(
    ongoing.segments.filter((cls) => cls !== "chat-status-name"),
    ["chat-status-model", "chat-status-project", "chat-status-stats"],
    "The ongoing row must be [model][project]([name])[stats] in that order",
  );
  const nameAt = ongoing.segments.indexOf("chat-status-name");
  if (nameAt >= 0) {
    assert.ok(
      nameAt > ongoing.segments.indexOf("chat-status-project") &&
        nameAt < ongoing.segments.indexOf("chat-status-stats"),
      `A session name must sit between the project and the token cluster: ${ongoing.segments.join(" | ")}`,
    );
  }
  assert.ok(
    ongoing.available && near(ongoing.bar.left, ongoing.available.left),
    `The ongoing row must start at the bottom-bar frame: bar=${ongoing.bar.left} available=${ongoing.available?.left}`,
  );
  assert.ok(
    ongoing.available && near(ongoing.bar.width, ongoing.available.width),
    `The ongoing row must span the full bottom-bar width: bar=${ongoing.bar.width} available=${ongoing.available?.width}`,
  );
  console.log("PASS: ongoing status row spans full width as [model][project]([name])[stats]");
}
