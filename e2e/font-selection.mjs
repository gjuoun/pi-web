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
  const uiField = page.getByLabel("Interface font", { exact: true });
  const monoField = page.getByLabel("Monospace font", { exact: true });
  assert.equal(await uiField.inputValue(), "", "A fresh browser starts on the built-in stacks");
  assert.equal(await monoField.inputValue(), "");
  assert.equal(await page.getByRole("button", { name: "Reset interface font", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Reset monospace font", exact: true }).isDisabled(), true);

  await uiField.fill(UI_FONT);
  await monoField.fill(MONO_FONT);
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
