import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ImagePreview.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("renders on shadcn Dialog, controlled by local open state", () => {
  assert.match(source, /import \{ Dialog, DialogContent, DialogTrigger \} from "@\/components\/ui\/dialog"/);
  assert.match(source, /<Dialog open=\{open\} onOpenChange=\{setOpen\}>/);
  assert.match(source, /<DialogTrigger asChild>/);
  assert.doesNotMatch(source, /createPortal/);
  assert.doesNotMatch(source, /HTMLDialogElement/);
});

test("keeps a Pi-style close button that closes on click", () => {
  assert.match(source, /onClick=\{\(\) => setOpen\(false\)\}/);
  assert.match(source, /<path d="M6 6l12 12M18 6 6 18" \/>/);
});

test("full-screen overlay honours mobile safe areas", () => {
  assert.match(source, /pt-\[max\(16px,env\(safe-area-inset-top\)\)\]/);
  assert.match(source, /pr-\[max\(16px,env\(safe-area-inset-right\)\)\]/);
  assert.match(source, /pb-\[max\(16px,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(source, /pl-\[max\(16px,env\(safe-area-inset-left\)\)\]/);
  assert.match(source, /top-\[max\(12px,env\(safe-area-inset-top\)\)\]/);
  assert.match(source, /right-\[max\(12px,env\(safe-area-inset-right\)\)\]/);
});

test("no longer relies on the deleted .image-preview-* CSS rules", () => {
  assert.doesNotMatch(cssSource, /\.image-preview-(dialog|image|close)\b/);
});
