import assert from "node:assert/strict";
import { join } from "node:path";

/**
 * /ui/preview — the stateless app preview renders every region, in both themes, with nothing to click.
 * Computed styles are read in a real browser, so a stale bundle or a lost theme block shows up here.
 */
const THEMES = [
  { id: "default", canvas: "rgb(255, 255, 255)", sidebar: "rgb(243, 246, 251)" },
  { id: "broismypro", canvas: "rgb(13, 0, 51)", sidebar: "rgb(9, 0, 42)" },
];
const SECTIONS = ["app", "sidebar", "topbar", "messages", "composer", "timeline", "settings"];

export async function checkUiPreview(page, { base, artifacts }) {
  const problems = [];
  const onPageError = (error) => problems.push(String(error));
  const onConsole = (message) => message.type() === "error" && problems.push(message.text());
  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  for (const theme of THEMES) {
    await page.addInitScript((id) => localStorage.setItem("pi-theme", id), theme.id);
    await page.goto(`${base}/ui/preview`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-slot="ui-preview"]').waitFor();
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => {
      const frame = (name) => document.querySelector(`[data-shot="${name}"]`);
      const conversation = frame("app-conversation");
      const fresh = frame("app-new");
      const scroller = document.querySelector('[data-slot="ui-preview"]');
      return {
        htmlTheme: document.documentElement.dataset.theme,
        sections: [...document.querySelectorAll("[data-section]")].map((n) => n.getAttribute("data-section")),
        conversationWidth: conversation?.getBoundingClientRect().width,
        freshWidth: fresh?.getBoundingClientRect().width,
        sidebarWidth: conversation?.querySelector('[data-slot="app-sidebar"]')?.getBoundingClientRect().width,
        canvas: conversation ? getComputedStyle(conversation).backgroundColor : null,
        sidebar: conversation ? getComputedStyle(conversation.querySelector('[data-slot="app-sidebar"]')).backgroundColor : null,
        textFields: document.querySelectorAll("textarea, input").length,
        buttonsInFrames: document.querySelectorAll('[data-shot="app-conversation"] button, [data-shot="app-new"] button').length,
        scrollable: scroller.scrollHeight > scroller.clientHeight,
        shots: [...document.querySelectorAll("[data-shot]")].map((n) => n.getAttribute("data-shot")),
      };
    });
    assert.equal(state.htmlTheme, theme.id, `${theme.id}: the page is in the theme`);
    assert.deepEqual(state.sections, SECTIONS, `${theme.id}: every region section, in order`);
    assert.equal(state.conversationWidth, 1280, `${theme.id}: the conversation frame is 1280px`);
    assert.equal(state.freshWidth, 1280, `${theme.id}: the new-session frame is 1280px`);
    assert.equal(state.sidebarWidth, 260, `${theme.id}: the sidebar is 260px`);
    assert.equal(state.canvas, theme.canvas, `${theme.id}: frame canvas`);
    assert.equal(state.sidebar, theme.sidebar, `${theme.id}: frame sidebar`);
    assert.notEqual(state.canvas, state.sidebar, `${theme.id}: canvas and sidebar are different surfaces`);
    assert.equal(state.textFields, 0, `${theme.id}: no text field on the page`);
    assert.equal(state.buttonsInFrames, 0, `${theme.id}: nothing to click inside the app frames`);
    assert.ok(state.scrollable, `${theme.id}: the page scrolls`);
    assert.equal(new Set(state.shots).size, state.shots.length, `${theme.id}: unique shot names`);
  }

  await page.locator('[data-shot="app-conversation"]').screenshot({ path: join(artifacts, "ui-preview-conversation.png") });
  page.off("pageerror", onPageError);
  page.off("console", onConsole);
  assert.deepEqual(problems, [], `no browser errors on /ui/preview: ${problems.join(" | ").slice(0, 500)}`);
  console.log("PASS: /ui/preview renders every region statelessly in both themes");
}
