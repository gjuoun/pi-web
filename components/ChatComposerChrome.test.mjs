import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { ChatInput } = await jiti.import("./ChatInput.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

/** Split a rendered element's `style="a:1;b:2"` into a map, tolerating a space after the colon. */
function styleMap(html, marker = "data-chat-composer-box") {
  const start = html.indexOf(marker);
  assert.ok(start >= 0, `the composer must be marked with ${marker}`);
  const raw = html.slice(start, html.indexOf(">", start)).match(/style="([^"]*)"/)?.[1] ?? "";
  const map = new Map();
  for (const declaration of raw.split(";")) {
    const at = declaration.indexOf(":");
    if (at < 0) continue;
    map.set(declaration.slice(0, at).trim(), declaration.slice(at + 1).trim());
  }
  return map;
}

/** The opening tag of the element carrying `marker`, so attributes can be asserted without parsing. */
function tagOf(html, marker) {
  const start = html.indexOf(marker);
  assert.ok(start >= 0, `no element carries ${marker}`);
  return html.slice(start, html.indexOf(">", start));
}

/** The `className` of the element carrying `marker`. */
function classesOf(html, marker) {
  return tagOf(html, marker).match(/class="([^"]*)"/)?.[1] ?? "";
}

const renderComposer = (props = {}) =>
  renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(ChatInput, { onSend() {}, onAbort() {}, ...props })),
  );

test("the rail is framed by a rule above and below, and nothing on the sides", () => {
  const railClass = classesOf(renderComposer(), "data-chat-rail");
  assert.match(railClass, /\bborder-t\b/, `rail class was ${railClass}`);
  assert.match(railClass, /\bborder-b\b/);
  assert.doesNotMatch(railClass, /\bborder-l\b/);
  assert.doesNotMatch(railClass, /\bborder-r\b/);
  // The rules must not be declared inline: an inline declaration outranks a Tailwind class, which is
  // exactly how the :focus-within colour override got silently swallowed.
  const inline = styleMap(renderComposer(), "data-chat-rail");
  for (const side of ["border-top", "border-bottom", "border-left", "border-right", "box-shadow"]) {
    assert.equal(inline.get(side), undefined, `${side} must not be set inline on the rail`);
  }
});

test("the input box inside the rail is no longer a card", () => {
  const railClass = classesOf(renderComposer(), "data-chat-rail");
  assert.doesNotMatch(railClass, /\brounded-/, "the 14px radius must go");
  assert.doesNotMatch(railClass, /(?<!focus-within:)shadow-(?!none)/, "the two-layer drop shadow must go outside focus");
  assert.match(railClass, /\bbg-transparent\b/, "the fill must be transparent");
});

test("the quoted-selection mini composer stays completely unchromed", () => {
  // The `compact` composer is a different component surface; the redesign must not put rules on it.
  const compactClass = classesOf(renderComposer({ compact: true }), "data-chat-rail");
  assert.match(compactClass, /data-\[compact=true\]:border-t-0/);
  assert.match(compactClass, /data-\[compact=true\]:border-b-0/);
  assert.match(tagOf(renderComposer({ compact: true }), "data-chat-rail"), /data-compact="true"/);
});

test("the rail names a state when there is one, and stays silent when there is not", () => {
  // At rest there is nothing to announce, and a live region that never says anything is worse than
  // none — so the role and label are simply absent.
  const idleTag = tagOf(renderComposer(), "data-chat-rail");
  assert.match(idleTag, /data-state="idle"/);
  const idleStatus = tagOf(renderComposer(), "data-chat-rail-status");
  assert.doesNotMatch(idleStatus, /aria-label/, "an idle rail must not claim a state");
  assert.doesNotMatch(idleStatus, /role=/, "an idle rail must not open a live region");

  // A run in flight does have something to say, in words as well as colour.
  const busy = renderComposer({ isStreaming: true, onSteer() {} });
  assert.match(tagOf(busy, "data-chat-rail"), /data-state="working"/);
  const busyStatus = tagOf(busy, "data-chat-rail-status");
  assert.match(busyStatus, /role="status"/);
  assert.match(busyStatus, /aria-label="Working"/);
});

test("the rail's colour is the state channel, and never the only signal", () => {
  const railClass = classesOf(renderComposer(), "data-chat-rail");
  assert.match(railClass, /color-mix\(in_srgb,var\(--border\)_70%,transparent\)/, `expected the resting hairline, got ${railClass}`);
  assert.match(railClass, /data-\[state=working\]:border-warning\/40/, `expected the working tint, got ${railClass}`);
  assert.match(railClass, /data-\[state=shell\]:border-muted/, `expected the shell tint, got ${railClass}`);
});

test("focus rides the rules, never a closed outline", () => {
  // The textarea kills its own outline, so focus has to be drawn by the rail.
  const railClass = classesOf(renderComposer(), "data-chat-rail");
  assert.match(railClass, /focus-within:shadow-/, "a focus-within shadow class must exist");
  // An `outline` is a closed rectangle: it would put edges back on the left and right, which is
  // exactly what the ruled shape removes.
  assert.doesNotMatch(railClass, /focus-within:outline/, "focus must not draw a closed outline");
  // It still has to be clearly visible: each rule gains an inset accent band.
  assert.match(railClass, /inset_0_2px_0_0_var\(--primary\)/);
  assert.match(railClass, /inset_0_-2px_0_0_var\(--primary\)/);
});

test("the status row's line moved to the rail instead of being duplicated", async () => {
  // ChatStatusBar/ExtensionStatusBar are now pure Tailwind utilities (see their own test files);
  // the rail (.chat-rail, tested above) is the only rule-based border left in this file's scope.
  const { ChatStatusBar } = await jiti.import("./ChatStatusBar.tsx");
  const html = renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(ChatStatusBar, { cwd: "/tmp/work" })),
  );
  const barClass = html.match(/data-slot="chat-status-bar"[^>]*class="([^"]*)"/)?.[1] ?? "";
  assert.doesNotMatch(barClass, /border-t/, "the bar must not draw a line of its own");
  // The 1px side border is gone, so each strip keeps the 4px inline inset that lands the footer text
  // on the composer's icons. The vertical rhythm moved to the shared scroll surface, so no strip adds
  // spacing on that axis, otherwise every added line would carry its own gap.
  assert.match(barClass, /\bpx-1\b/);
  // The fresh bar has nothing left to override: it shows one line and swaps which strips it is via
  // data-state, not a class modifier.
  assert.doesNotMatch(html, /\bis-fresh\b/);
});

// --- the chrome that had no coverage at all before this pass: icons, previews, queue, shell mode ---

const { clearDraft, setDraft } = await jiti.import("@/lib/draft-store.ts");
const actionKinds = (html) =>
  (html.match(/data-chat-action="[^"]+"/g) ?? []).map((match) => match.match(/"([^"]+)"/)[1]).sort();
const withDraft = (key, draft, props = {}) => {
  setDraft(key, draft);
  try {
    return renderComposer({ draftKey: key, ...props });
  } finally {
    clearDraft(key);
  }
};

test("the actions bar is collapsed by default and reveals the state's actions", () => {
  // Collapsed: the input is text and one disclosure control. Nothing else competes with the draft.
  assert.deepEqual(actionKinds(renderComposer()), [], "an empty idle input offers no actions");
  // Typing reveals the primary, so sending is one tap — on mobile plain Enter does not send.
  assert.deepEqual(
    actionKinds(withDraft("test:typed", { value: "hello", images: [] })),
    ["send"],
  );
  const running = { isStreaming: true, onAbort() {}, onSteer() {}, onFollowUp() {} };
  // While a run is live the primary is stop, and it must never be hidden: a phone has no Esc.
  assert.deepEqual(actionKinds(renderComposer(running)), ["stop"]);
  // Opening the bar reveals the rest.
  assert.deepEqual(
    actionKinds(withDraft("test:revealed", { value: "hello", images: [] }, { ...running, initialActionsOpen: true })),
    ["attach", "queue", "steer"],
  );
});

test("the hint row is gone, and its action lives in the revealed bar", () => {
  const running = { isStreaming: true, onAbort() {}, onSteer() {}, onFollowUp() {} };
  const collapsed = renderComposer(running);
  assert.doesNotMatch(collapsed, /chat-composer-hint/, "the hint row must be deleted, not restyled");
  assert.doesNotMatch(collapsed, /Alt\+Enter queues a follow-up/);
  assert.match(collapsed, /data-chat-actions-toggle/, "the disclosure control must be present");
  // The queue action is one click away, not unreachable.
  assert.match(renderComposer({ ...running, initialActionsOpen: true }), /aria-label="Queue follow-up"/);
});

test("shell mode announces itself on the rail instead of adding a row below the box", () => {
  const html = withDraft("test:bash", { value: "!ls", images: [] });
  // Exactly once, and that once is the rail's accessible name — not a row of its own. Counting rather
  // than matching, because the rail's label legitimately contains the same copy.
  assert.equal((html.match(/Shell · /g) ?? []).length, 1, `shell copy must appear once, in the rail's label: ${html.match(/Shell · /g)?.length}`);
  assert.match(tagOf(html, "data-chat-rail"), /data-state="shell"/);
  assert.match(html, /aria-label="Shell · output sent to model"/);
});

test("pending images are previewed above the frame, each one removable", () => {
  const html = withDraft("test:chips", {
    value: "",
    images: [{ data: "aW1hZ2U=", mimeType: "image/png" }, { data: "aW1hZ2U=", mimeType: "image/png" }],
  });
  assert.equal((html.match(/data-chat-chip=""/g) ?? []).length, 2, "every image is previewed");
  const previews = html.slice(html.indexOf("data-chat-chip"), html.indexOf("data-chat-rail"));
  assert.equal((previews.match(/<button/g) ?? []).length, 2, "one remove control per preview");
  // Above the frame, not on it — and not collapsed behind a count.
  assert.ok(html.indexOf("data-chat-chip") < html.indexOf("data-chat-rail"), "previews precede the rail");
});

test("queued messages are flat rows with a single recall action", () => {
  const html = renderComposer({
    queuedMessages: { steering: ["a steering message"], followUp: ["a follow-up message"] },
    onRecallQueue() {},
  });
  assert.equal((html.match(/data-chat-queued=/g) ?? []).length, 2, "one row per queued message");
  assert.match(html, /data-chat-queued="steer"/);
  assert.match(html, /data-chat-queued="follow-up"/);
  // Recall stays mouse-reachable: alt+up does not exist on a phone.
  assert.match(html, /data-chat-recall=""/);
  // The panel's own chrome is gone — the count header was chrome around what the rows already say.
  assert.doesNotMatch(html, /Queued · /);
});
