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
  const raw = html.slice(start, html.indexOf(">", start)).match(/style="([^"]*)"/)?.[1];
  assert.ok(raw, `the element marked ${marker} must carry inline chrome`);
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

const renderComposer = (props = {}) =>
  renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(ChatInput, { onSend() {}, onAbort() {}, ...props })),
  );

test("the rail is framed by a rule above and below, and nothing on the sides", () => {
  const railRule = css.match(/(?:^|\n)\.chat-rail\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(railRule, /border-top:\s*1px solid var\(--chat-rail-color\)/, `rail rule was ${railRule.trim()}`);
  assert.match(railRule, /border-bottom:\s*1px solid var\(--chat-rail-color\)/);
  assert.match(railRule, /border-left:\s*none/);
  assert.match(railRule, /border-right:\s*none/);
  // The rules must not be declared inline: an inline declaration outranks a stylesheet rule, which is
  // exactly how the :focus-within colour override got silently swallowed.
  const inline = styleMap(renderComposer(), "data-chat-rail");
  for (const side of ["border-top", "border-bottom", "border-left", "border-right", "box-shadow"]) {
    assert.equal(inline.get(side), undefined, `${side} must not be set inline on the rail`);
  }
});

test("the input box inside the rail is no longer a card", () => {
  const style = styleMap(renderComposer());
  assert.equal(style.get("border-radius") ?? "0", "0", "the 14px radius must go");
  assert.equal(style.get("box-shadow") ?? "none", "none", "the two-layer drop shadow must go");
  assert.ok(
    ["transparent", "none"].includes(style.get("background") ?? "transparent"),
    `the fill must go, background was ${style.get("background")}`,
  );
});

test("the quoted-selection mini composer stays completely unchromed", () => {
  // The `compact` composer is a different component surface; the redesign must not put rules on it.
  const compactRule = css.match(/\.chat-rail\[data-compact="true"\]\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(compactRule, /border-top:\s*none/);
  assert.match(compactRule, /border-bottom:\s*none/);
  assert.match(tagOf(renderComposer({ compact: true }), "data-chat-rail"), /data-compact="true"/);
  assert.equal(styleMap(renderComposer({ compact: true })).get("padding") ?? "0", "0");
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
  const colourFor = (state) =>
    css.match(new RegExp(`\\.chat-rail\\[data-state="${state}"\\]\\s*\\{([^}]*)\\}`))?.[1]
      ?.match(/--chat-rail-color:\s*([^;]+);/)?.[1]?.trim();
  const resting = css.match(/(?:^|\n)\.chat-rail\s*\{([^}]*)\}/)?.[1]
    ?.match(/--chat-rail-color:\s*([^;]+);/)?.[1]?.trim();

  assert.match(resting ?? "", /color-mix/, `expected the resting hairline, got ${resting}`);
  assert.match(colourFor("working") ?? "", /rgba\(234,\s*179,\s*8/, `expected the working tint, got ${colourFor("working")}`);
  assert.match(colourFor("shell") ?? "", /var\(--tool-bg\)/, `expected the shell tint, got ${colourFor("shell")}`);
  // Distinct states must actually differ, or the channel says nothing.
  const seen = new Set([resting, colourFor("working"), colourFor("shell")]);
  assert.equal(seen.size, 3, `every state needs its own colour, got ${[...seen].join(" | ")}`);
});

test("focus rides the rules, never a closed outline", () => {
  // The textarea kills its own outline, so focus has to be drawn by the rail.
  const rule = css.match(/\.chat-rail:focus-within\s*\{([^}]*)\}/)?.[1];
  assert.ok(rule, "a .chat-rail:focus-within rule must exist");
  // An `outline` is a closed rectangle: it would put edges back on the left and right, which is
  // exactly what the ruled shape removes.
  assert.doesNotMatch(rule, /(^|[^-])outline\s*:/, "focus must not draw a closed outline");
  assert.doesNotMatch(rule, /outline-offset/, "no outline means no offset either");
  // It still has to be clearly visible: each rule gains an inset accent band.
  assert.match(rule, /inset\s+0\s+2px\s+0\s+0\s+var\(--accent\)/);
  assert.match(rule, /inset\s+0\s+-2px\s+0\s+0\s+var\(--accent\)/);
  // Focus must NOT recolour the rules: the rule colour is the state channel, and shell mode is entered
  // by typing, so a focus override would mask the state exactly when it applies.
  assert.doesNotMatch(rule, /--chat-rail-color/, "focus must not override the state colour");
});

test("the status row's line moved to the rail instead of being duplicated", () => {
  const barRule = css.match(/\.chat-status-bar\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(barRule, /border-top/, "the row must not draw a line of its own");
  // The 1px side border is gone, so the composer's inline inset is 14px and the footer follows it.
  assert.match(barRule, /padding:\s*4px 4px/);
  const extRule = css.match(/\.chat-status-ext\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(extRule, /padding:\s*4px 4px/);
  // The fresh row had nothing left to say, so its rule is gone entirely.
  assert.doesNotMatch(css, /\.chat-status-bar\.is-fresh\s*\{/);
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
