import assert from "node:assert/strict";

/**
 * The composer's two picker commands.
 *
 * `/model` and `/thinking` are pi's own builtins, handled in its TUI and absent from get_commands, so
 * Pi Web has to own them: they open a picker and must never be forwarded to the model as a prompt.
 * This check pins that ownership and the keyboard path through it.
 *
 * The suite runs against a temp agent dir with no models configured, so the picker legitimately
 * renders its empty state. Row count and model text are deliberately NOT asserted — presence, focus,
 * and the absence of a posted message are.
 */

const PICKER = ".list-picker";
const COMPOSER = "textarea.chat-input-textarea";

export async function checkModelPicker(page, { base, sessionId }) {
  // get_state is a POST command; the GET route does not answer with the {success, data} envelope.
  const stateOf = async () => {
    const res = await page.request.post(base + "/api/agent/" + sessionId, { data: { type: "get_state" } });
    const body = await res.json().catch(() => null);
    return body && body.data ? body.data : null;
  };

  await page.goto(base + "/?session=" + sessionId, { waitUntil: "domcontentloaded" });
  await page.locator(".chat-status-bar").waitFor();
  const composer = page.locator(COMPOSER);
  await composer.waitFor();
  const before = await stateOf();
  assert.ok(before && typeof before.messageCount === "number", "get_state must report the session state");

  // 1. Both commands are offered by the composer's palette, as built-ins.
  await composer.click();
  await composer.fill("/");
  await page.waitForTimeout(400);
  const palette = await page.evaluate(() => document.body.innerText);
  assert.ok(palette.includes("Select model (opens selector UI)"), "the palette must offer /model");
  assert.ok(palette.includes("Set thinking level"), "the palette must offer /thinking");
  await page.keyboard.press("Escape");

  // 2. Enter on the exact command opens the picker with its own input focused.
  await composer.fill("/model");
  await page.keyboard.press("Enter");
  await page.locator(PICKER).waitFor({ timeout: 15000 });
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? String(el.className || el.tagName) : "";
  });
  assert.ok(focused.includes("list-picker-input"), "the picker's own input must take focus, got " + focused);
  const rows = await page.locator(".list-picker-item").count();
  const emptyLabel = (await page.locator(".list-picker-empty").count()) > 0
    ? (await page.locator(".list-picker-empty").innerText()).trim()
    : "";
  assert.ok(
    rows > 0 || emptyLabel.length > 0,
    "the picker must render rows or an explicit empty state, never a blank panel",
  );

  // 3. Escape closes it, and the command never reached the model.
  await page.keyboard.press("Escape");
  await page.locator(PICKER).waitFor({ state: "hidden", timeout: 10000 });
  const after = await stateOf();
  assert.ok(after, "get_state must answer after the command");
  assert.equal(after.messageCount, before.messageCount, "a picker command must not post a message");
  assert.equal(after.isStreaming, false, "a picker command must not start a run");

  // 4. /thinking takes the same path.
  await composer.fill("/thinking");
  await page.keyboard.press("Enter");
  await page.locator(PICKER).waitFor({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await page.locator(PICKER).waitFor({ state: "hidden", timeout: 10000 });
  const final = await stateOf();
  assert.ok(final, "get_state must answer after /thinking");
  assert.equal(final.messageCount, before.messageCount, "/thinking must not post a message either");

  console.log("PASS: model picker — /model and /thinking open a focused picker and never reach the model");
}
