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

test("puts every line of the bar inside one shared scroll surface", () => {
  const surfaceAt = source.indexOf('className="chat-bottom-bar"');
  const innerAt = source.indexOf('className="chat-bottom-bar-inner"');
  const rowAt = source.indexOf("<ChatStatusBar");
  const extAt = source.indexOf("<ExtensionStatusLine");

  assert.ok(surfaceAt >= 0 && innerAt >= 0, "the bottom bar needs its scroll surface and inner block");
  assert.ok(
    surfaceAt < innerAt,
    `the inner block must sit inside the surface: surface=${surfaceAt} inner=${innerAt}`,
  );
  // Both the status lines and the extension line ride the surface, so they scroll as one bar.
  assert.ok(
    innerAt < rowAt && rowAt < extAt,
    `the lines must ride the surface: inner=${innerAt} row=${rowAt} ext=${extAt}`,
  );

  // The inline inset belongs to the inner block, not the scroll container: a scroll container's right
  // padding is not honoured past the overflow edge, so 52px there would leave the tail of an
  // overflowing line sitting cut off at the viewport edge.
  const inner = source.slice(innerAt, source.indexOf("</div>", innerAt));
  assert.match(inner, /paddingLeft: 16/);
  assert.match(inner, /paddingRight: isMobile \? 16 : 52/);
});

test("feeds the status row the fresh predicate and the project root", () => {
  const call = source.slice(source.indexOf("<ChatStatusBar"), source.indexOf("<ExtensionStatusLine"));
  assert.ok(call.length > 0, "ChatStatusBar is not rendered before ExtensionStatusLine");

  // The fresh state is the same predicate that gates the empty-state banner, not a second definition.
  assert.match(
    source,
    /const isEmptyNew = isNew && messages\.length === 0 && !streamState\.isStreaming && !sessionBusy;/,
  );
  assert.match(call, /fresh=\{isEmptyNew\}/);

  // A linked worktree must read as its main repo, so the bar needs projectRoot, not just cwd.
  assert.match(call, /projectRoot=\{session\?\.projectRoot \?\? null\}/);
});
