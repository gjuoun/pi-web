import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const hookSource = await readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8");
const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

// The chrome for these surfaces moved out of inline styles into the stylesheet, so the assertions
// read the rule body by selector instead of the JSX attribute.
const cssRule = (selector) => {
  const start = globals.indexOf("." + selector + " {");
  if (start === -1) return "";
  return globals.slice(start + selector.length + 3, globals.indexOf("}", start));
};

test("renders temporary notices once at the top right of the chat column", () => {
  const noticeShelfUsages = source.match(/<NoticeShelf notices=\{notices\}/g) ?? [];

  assert.equal(noticeShelfUsages.length, 1);
  assert.match(
    source,
    /className="chat-window-notice-rail"[\s\S]*?<NoticeShelf notices=\{notices\} floating onPauseChange=\{setNoticePaused\} \/>/,
  );
  // The rail's anchor moved into .chat-window-notice-rail; only the minimap offset stays inline.
  const rail = cssRule("chat-window-notice-rail");
  assert.match(rail, /position: absolute/);
  assert.match(rail, /top: 12px/);
  assert.match(rail, /justify-content: flex-end/);
  assert.match(source, /right: isMobile \? 0 : CHAT_MINIMAP_WIDTH/);
});

test("pauses only for a visible notice", () => {
  assert.match(
    hookSource,
    /noticeState\.visible\.some\(\(notice\) => notice\.id === pausedNoticeId\)\) return/,
  );
});

test("lets keyboard users pause and scroll long notices", () => {
  assert.match(source, /onFocus=\{\(\) => onPauseChange\?\.\(notice\.id\)\}/);
  assert.match(source, /onBlur=\{\(event\) => \{\s*if \(!event\.currentTarget\.matches\(":hover"\)\) onPauseChange\?\.\(null\)/);
  assert.match(source, /onMouseLeave=\{\(event\) => \{\s*if \(!event\.currentTarget\.contains\(document\.activeElement\)\) onPauseChange\?\.\(null\)/);
  // The toast text keeps its own scroll area, now declared in .notice-shelf-text.
  assert.match(source, /<span\s+tabIndex=\{0\}\s+className="notice-shelf-text"/);
  assert.match(cssRule("notice-shelf-text"), /overflow-y: auto/);
});
