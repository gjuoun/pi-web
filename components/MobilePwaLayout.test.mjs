import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const settingsCssSource = await readFile(new URL("../app/settings.css", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const appShellSource = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const chatWindowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const chatInputSource = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const viewportHookSource = await readFile(new URL("../hooks/useViewportHeight.ts", import.meta.url), "utf8");
// The shell chrome moved out of inline styles into the stylesheet, so read a rule by selector.
const cssRule = (selector) => {
  // lastIndexOf: the shell's own rules are appended after the responsive ones for the same class.
  const start = cssSource.lastIndexOf("." + selector + " {");
  if (start === -1) return "";
  return cssSource.slice(start + selector.length + 3, cssSource.indexOf("}", start));
};

test("configures iOS standalone mode to use the full screen", () => {
  assert.match(layoutSource, /statusBarStyle: "black-translucent"/);
  assert.match(layoutSource, /viewportFit: "cover"/);
  assert.match(layoutSource, /interactiveWidget: "resizes-content"/);
  assert.match(cssSource, /@media \(display-mode: standalone\) \{[\s\S]*?--app-viewport-height: 100vh;/);
});

test("tracks the visual viewport while the software keyboard is open", () => {
  assert.match(appShellSource, /useViewportHeight\(\)/);
  // The shell's safe-area insets and its viewport height are declared on its classes now.
  assert.match(cssRule("app-shell-root"), /height: var\(--app-viewport-height, 100dvh\)/);
  assert.match(cssRule("app-shell-root"), /padding-left: env\(safe-area-inset-left\)/);
  assert.match(cssRule("app-shell-root"), /padding-right: env\(safe-area-inset-right\)/);
  assert.match(cssRule("app-shell-topbar-row"), /padding-top: env\(safe-area-inset-top\)/);
  assert.match(cssRule("app-shell-topbar-row"), /height: calc\(36px \+ env\(safe-area-inset-top\)\)/);
  // Right panel tab bar
  assert.match(cssRule("app-shell-panel-tabbar"), /height: calc\(36px \+ env\(safe-area-inset-top\)\)/);
  assert.match(cssRule("app-shell-panel-tabbar"), /padding-top: env\(safe-area-inset-top\)/);
  assert.match(cssRule("app-shell-panel-body"), /padding-bottom: env\(safe-area-inset-bottom\)/);
  assert.match(cssRule("sidebar-container"), /padding-top: env\(safe-area-inset-top\)/);
  assert.match(appShellSource, /data-mobile-toolbar-file=\{mobile \? "true" : undefined\}/);
  assert.match(viewportHookSource, /window\.visualViewport/);
  assert.match(viewportHookSource, /window\.requestAnimationFrame\(update\)/);
  assert.match(viewportHookSource, /window\.addEventListener\("resize", scheduleUpdate\)/);
  assert.match(viewportHookSource, /window\.addEventListener\("focusout", scheduleUpdate\)/);
  assert.match(viewportHookSource, /--app-viewport-height/);
  assert.match(viewportHookSource, /window\.scrollTo\(0, 0\)/);
  assert.match(cssSource, /height: var\(--app-viewport-height, 100dvh\)/);
  assert.match(cssSource, /left: env\(safe-area-inset-left\)/);
  // The safe-area inset moved from ChatWindow's inline style into .chat-window-safe-area.
  assert.match(cssSource, /\.chat-window-safe-area \{ padding-bottom: env\(safe-area-inset-bottom\); \}/);
});

test("contains chat content and inputs within the mobile viewport", () => {
  assert.match(cssSource, /\.markdown-body \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: hidden;/);
  assert.match(cssSource, /\.markdown-code-block \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/);
  assert.match(chatWindowSource, /overflow-x-hidden overflow-y-auto/);
  // The extension panel's height cap moved into .extension-panel-panel.
  assert.match(cssSource, /\.extension-panel-panel \{[\s\S]*?max-height: min\(760px, 100%\);[\s\S]*?\}/);
  // The composer textarea's sizing moved from its inline style into .chat-input-textarea. The
  // 640px media query redefines the same class, so pick the rule that actually carries the sizing.
  const textareaRule = cssSource.match(/\.chat-input-textarea \{([^}]*flex: 1;[^}]*)\}/)?.[1] ?? "";
  assert.match(textareaRule, /flex: 1/);
  assert.match(textareaRule, /min-width: 0/);
  assert.match(textareaRule, /width: 100%/);
  const compactTextareaRule = cssSource.match(/\.chat-input-textarea\.is-compact \{([^}]*)\}/)?.[1] ?? "";
  assert.match(compactTextareaRule, /flex: none/);
});

test("prevents iOS focus zoom from widening the layout", () => {
  assert.match(cssSource, /@media \(max-width: 640px\)[\s\S]*?textarea,[\s\S]*?input,[\s\S]*?select \{\s*font-size: 16px !important;/);
});

test("keeps modal dialogs clear of the iOS status bar in standalone mode", () => {
  assert.match(settingsCssSource, /@supports \(-webkit-touch-callout: none\) \{[\s\S]*?@media \(display-mode: standalone\) \{/);
  assert.match(settingsCssSource, /padding-top: max\(59px, env\(safe-area-inset-top\)\);[\s\S]*?padding-right: max\(8px, env\(safe-area-inset-right\)\);[\s\S]*?padding-bottom: max\(24px, env\(safe-area-inset-bottom\)\);[\s\S]*?padding-left: max\(8px, env\(safe-area-inset-left\)\);/);
  assert.match(settingsCssSource, /@media \(display-mode: standalone\) and \(orientation: landscape\) \{[\s\S]*?padding-top: max\(8px, env\(safe-area-inset-top\)\);[\s\S]*?padding-right: max\(59px, env\(safe-area-inset-right\)\);[\s\S]*?padding-bottom: max\(8px, env\(safe-area-inset-bottom\)\);[\s\S]*?padding-left: max\(59px, env\(safe-area-inset-left\)\);/);
  assert.match(settingsCssSource, /\.settings-dialog-surface,[\s\S]*?\.config-panel-root\.is-modal > \.config-panel-surface \{[\s\S]*?max-width: 100%;[\s\S]*?max-height: 100%;/);
});
