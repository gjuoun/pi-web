import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const hookSource = await readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8");

test("renders temporary notices once at the top right of the chat column", () => {
  const noticeShelfUsages = source.match(/<NoticeShelf notices=\{notices\}/g) ?? [];

  assert.equal(noticeShelfUsages.length, 1);
  assert.match(
    source,
    /absolute top-3 left-0 z-40 flex justify-end px-4[\s\S]*?isMobile \? "right-0" : "right-9"[\s\S]*?<NoticeShelf notices=\{notices\} floating onPauseChange=\{setNoticePaused\} \/>/,
  );
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
  assert.match(source, /<span\s+tabIndex=\{0\}\s+className="[^"]*overflow-y-auto/);
});
