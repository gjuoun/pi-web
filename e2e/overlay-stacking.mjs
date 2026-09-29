import assert from "node:assert/strict";

/**
 * Portaled overlays must paint above the sidebar (JW-159).
 *
 * shadcn's DropdownMenu/Popover/Select/Tooltip render through a Radix Portal, so their content is a
 * child of <body>, not of the sidebar. With `z-50` on the content and `z-[200]` on the sidebar the
 * menu was open, in the DOM and clickable — but painted underneath, i.e. invisible. State and DOM
 * assertions cannot see that; only asking the browser what owns a menu pixel can.
 */
export async function checkOverlayStacking(page, { base, sessionId }) {
  await page.goto(`${base}/?session=${sessionId}`, { waitUntil: "domcontentloaded" });
  const group = page.locator("#session-sidebar").getByText(/^project/).first();
  await group.waitFor();
  const row = page.locator('#session-sidebar [title="Render **E2E markdown**"]').first();
  if ((await row.count()) === 0) await group.click();
  await row.waitFor();
  await row.hover();
  await page.getByRole("button", { name: "More actions" }).first().click();
  const items = page.locator('[data-slot="dropdown-menu-content"] [data-slot="dropdown-menu-item"]');
  await items.first().waitFor();
  // Let the open animation finish so bounding boxes are final.
  await page.waitForTimeout(400);

  // A modal Radix menu sets `pointer-events: none` on <body>, and hit testing skips those elements —
  // so the sidebar would be "transparent" to elementFromPoint and the bug invisible to it. Restore
  // hit testing everywhere for the probe; paint order is what is being asked about.
  const probeStyle = await page.addStyleTag({ content: "* { pointer-events: auto !important; }" });

  const count = await items.count();
  assert.ok(count >= 3, `the row menu must offer its actions, got ${count}`);
  for (let i = 0; i < count; i++) {
    const owner = await items.nth(i).evaluate((item) => {
      const rect = item.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        covered: !hit || !item.contains(hit),
        by: hit ? `${hit.tagName.toLowerCase()}${hit.id ? "#" + hit.id : ""}[${hit.getAttribute("data-slot") ?? ""}]` : "nothing",
      };
    });
    assert.equal(owner.covered, false, `menu item ${i} is covered by ${owner.by}`);
  }
  await probeStyle.evaluate((node) => node.remove());
  await page.keyboard.press("Escape");
  await page.locator('[data-slot="dropdown-menu-content"]').waitFor({ state: "hidden" });
  console.log("PASS: overlay stacking — the sidebar row menu paints above the sidebar");
}
