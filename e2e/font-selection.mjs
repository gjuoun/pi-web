import assert from "node:assert/strict";

/**
 * Selectable interface / monospace fonts (Settings → General → Appearance).
 *
 * Both fields are free-text inputs backed by a `<datalist>`, so they are exposed to the
 * accessibility tree as *comboboxes*, not textboxes — look them up by label.
 */

const UI_FONT = "Inter";
const MONO_FONT = "JetBrains Mono";

const head = (value) => String(value ?? "").split(",")[0].replace(/["']/g, "").trim();

async function openGeneralSettings(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  // Settings mounts only the section you switch to, and the last-used section is persisted.
  const generalTab = page.locator(".settings-section-tab", { hasText: "General" }).first();
  if (await generalTab.count()) await generalTab.click();
  else await page.getByRole("dialog").getByRole("combobox").first().selectOption("general");
  await page.waitForTimeout(200);
}

const closeSettings = async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
};

const readFonts = (page) => page.evaluate(() => {
  const family = (selector) => {
    const node = document.querySelector(selector);
    return node ? getComputedStyle(node).fontFamily : null;
  };
  return {
    variables: {
      ui: document.documentElement.style.getPropertyValue("--font-ui").trim(),
      mono: document.documentElement.style.getPropertyValue("--font-mono").trim(),
    },
    body: family("body"),
    statusBar: family(".chat-status-bar"),
    codeBlock: family(".markdown-code-block pre"),
    codeBlockCode: family(".markdown-code-block pre code"),
    stored: {
      ui: localStorage.getItem("pi-font-ui"),
      mono: localStorage.getItem("pi-font-mono"),
    },
  };
});

export async function checkFontSelection(page) {
  // `checkChatAppearance` runs last at 320px and leaves a mobile-chat overlay behind, which
  // intercepts pointer events over the sidebar. Reset the viewport and reload into a clean
  // desktop page before touching Settings.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".markdown-code-block pre").waitFor();
  await openGeneralSettings(page);

  // Real keystrokes, not fill(): the field is a controlled input, and a trimming round-trip once
  // swallowed the space in a multi-word font name.
  const uiField = page.getByRole("combobox", { name: "Interface font", exact: true });
  const monoField = page.getByRole("combobox", { name: "Monospace font", exact: true });
  assert.equal(await uiField.inputValue(), "", "A fresh browser starts on the built-in stacks");
  assert.equal(await monoField.inputValue(), "");
  assert.equal(await page.getByRole("button", { name: "Reset interface font", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Reset monospace font", exact: true }).isDisabled(), true);

  await uiField.click();
  await page.keyboard.type(UI_FONT);
  assert.equal(await uiField.inputValue(), UI_FONT, "Typing must keep the spaces in the font name");
  await monoField.click();
  await page.keyboard.type(MONO_FONT);
  assert.equal(await monoField.inputValue(), MONO_FONT);

  // The suggestion list must be reachable without typing, and must escape the clipped settings pane.
  await uiField.fill("");
  await page.locator("#settings-chat-content-width").click();
  await page.getByRole("button", { name: "Show font suggestions", exact: true }).first().click();
  const options = page.locator('[role="option"]:visible');
  await options.first().waitFor({ state: "visible" });
  assert.ok(await options.count() >= 6, "An empty field still offers the preset list");
  await page.getByRole("option", { name: /IBM Plex Sans/ }).first().click();
  assert.equal(await uiField.inputValue(), "IBM Plex Sans", "Choosing a suggestion inserts its family");
  assert.equal(await options.count(), 0, "Choosing a suggestion closes the list");
  await page.getByRole("button", { name: "Reset interface font", exact: true }).click();
  await uiField.click();
  await page.keyboard.type(UI_FONT);
  await closeSettings(page);

  let state = await readFonts(page);
  assert.equal(head(state.variables.ui), UI_FONT, "The UI field must drive --font-ui");
  assert.equal(head(state.variables.mono), MONO_FONT, "The mono field must drive --font-mono");
  assert.equal(head(state.body), UI_FONT, "Interface chrome must follow the UI font");
  assert.equal(head(state.statusBar), MONO_FONT, "The status bar must follow the mono font");
  assert.equal(head(state.codeBlock), MONO_FONT, "The code-block wrapper must follow the mono font");
  assert.equal(head(state.codeBlockCode), MONO_FONT, "Code text must follow the mono font");
  assert.deepEqual(state.stored, { ui: UI_FONT, mono: MONO_FONT }, "Both choices must be persisted");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".markdown-code-block pre").waitFor();
  state = await readFonts(page);
  assert.equal(head(state.body), UI_FONT, "The UI font must survive a reload");
  assert.equal(head(state.codeBlock), MONO_FONT, "The mono font must survive a reload");
  await openGeneralSettings(page);
  assert.equal(await uiField.inputValue(), UI_FONT);
  assert.equal(await monoField.inputValue(), MONO_FONT);
  await page.getByRole("button", { name: "Reset interface font", exact: true }).click();
  assert.equal(await uiField.inputValue(), "", "Resetting the UI font clears the field");
  assert.equal(await monoField.inputValue(), MONO_FONT, "Resetting one font must preserve the other");
  await page.getByRole("button", { name: "Reset monospace font", exact: true }).click();
  await closeSettings(page);

  state = await readFonts(page);
  assert.deepEqual(state.stored, { ui: "", mono: "" });
  assert.equal(head(state.body), "-apple-system", "Reset must restore the built-in UI stack");
  assert.match(state.variables.mono, /monospace$/, "Reset must restore a mono stack");
  console.log("PASS: font selection applies, persists across reloads, and resets per role");
}
