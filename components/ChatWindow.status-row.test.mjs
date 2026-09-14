import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("renders the widget shelf on its own row above the status row", () => {
  const shelfAt = source.indexOf("<ExtensionStatusBar");
  const rowAt = source.indexOf("<ChatStatusBar");

  assert.ok(shelfAt >= 0, "ExtensionStatusBar is not rendered");
  assert.ok(rowAt >= 0, "ChatStatusBar is not rendered");
  assert.ok(
    shelfAt < rowAt,
    `the widget shelf must render before the status row: shelf=${shelfAt} row=${rowAt}`,
  );
  // The shelf carries widgets only; status text gets its own bar below.
  assert.match(source, /<ExtensionStatusBar widgets=\{extensionWidgets\} \/>/);
});

test("renders the extension status line as its own bar below the status row", () => {
  assert.match(
    source,
    /import \{ ExtensionStatusBar, ExtensionStatusLine \} from "\.\/ExtensionStatusBar"/,
  );

  const rowAt = source.indexOf("<ChatStatusBar");
  const extAt = source.indexOf("<ExtensionStatusLine");
  assert.ok(extAt > rowAt, `the status bar must be its own bar after the row: row=${rowAt} ext=${extAt}`);
  assert.match(source, /<ExtensionStatusLine statuses=\{extensionStatuses\} \/>/);

  // Line 3 is not injected into the row any more — the row stays one line.
  assert.doesNotMatch(source, /rowSlot/);
});
