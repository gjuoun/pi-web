import assert from "node:assert/strict";

/**
 * Settings → General → Appearance switches between the two themes, and the choice survives a reload.
 * Computed styles are read in a real browser: a stale CSS bundle or a lost selector-order race
 * would pass any source-text assertion and still paint the wrong palette.
 */
const THEMES = [
  { id: "broismypro", label: "broismypro", dark: true, background: "#0d0033", bodyRgb: "rgb(13, 0, 51)", primary: "#4db3df" },
  { id: "default", label: "Default", dark: false, background: "#ffffff", bodyRgb: "rgb(255, 255, 255)", primary: "#00337c" },
];

async function openGeneralSettings(page) {
  // Right after a reload the button can be clicked before React hydrates it; retry until the dialog is up.
  const tab = page.locator('[data-slot="settings-section-tab"]', { hasText: "General" });
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    try {
      await tab.waitFor({ timeout: 2500 });
      break;
    } catch {
      if (attempt === 5) throw new Error("the Settings dialog never opened");
    }
  }
  await tab.click();
  await page.locator('[data-slot="settings-general"]').waitFor();
}

// The CSS pipeline may shorten #ffffff to #fff; compare the expanded form.
const hex6 = (value) => (/^#[0-9a-f]{3}$/i.test(value) ? `#${[...value.slice(1)].map((c) => c + c).join("")}` : value);

const read = (page) =>
  page.evaluate(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    return {
      theme: root.dataset.theme,
      dark: root.classList.contains("dark"),
      background: style.getPropertyValue("--background").trim(),
      primary: style.getPropertyValue("--primary").trim(),
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      stored: localStorage.getItem("pi-theme"),
    };
  });

export async function checkThemes(page, { base, sessionId }) {
  const problems = [];
  const onPageError = (error) => problems.push(String(error));
  const onConsole = (message) => message.type() === "error" && problems.push(message.text());
  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  await page.goto(`${base}/?session=${sessionId}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.removeItem("pi-theme"));
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal((await read(page)).theme, "default", "no stored choice means the default theme");

  await openGeneralSettings(page);
  const group = page.getByRole("radiogroup", { name: "Appearance" });
  assert.equal(await group.getByRole("radio").count(), THEMES.length, "one radio per registry theme");

  for (const theme of THEMES) {
    await group.getByRole("radio", { name: theme.label }).click();
    await page.waitForTimeout(150);
    const now = await read(page);
    assert.equal(now.theme, theme.id, `${theme.id}: data-theme`);
    assert.equal(now.dark, theme.dark, `${theme.id}: dark class`);
    assert.equal(hex6(now.background), theme.background, `${theme.id}: --background`);
    assert.equal(hex6(now.primary), theme.primary, `${theme.id}: --primary`);
    assert.equal(now.bodyBackground, theme.bodyRgb, `${theme.id}: body paints the theme canvas`);
    assert.equal(now.stored, theme.id, `${theme.id}: persisted`);

    await page.reload({ waitUntil: "domcontentloaded" });
    const after = await read(page);
    assert.equal(after.theme, theme.id, `${theme.id}: survives a reload (pre-paint script)`);
    assert.equal(after.dark, theme.dark, `${theme.id}: dark class survives a reload`);
    assert.equal(after.bodyBackground, theme.bodyRgb, `${theme.id}: canvas survives a reload`);
    await openGeneralSettings(page);
  }

  await page.keyboard.press("Escape");
  page.off("pageerror", onPageError);
  page.off("console", onConsole);
  assert.deepEqual(problems, [], `no browser errors while switching themes: ${problems.join(" | ").slice(0, 600)}`);
  console.log("PASS: themes switch and persist");
}
