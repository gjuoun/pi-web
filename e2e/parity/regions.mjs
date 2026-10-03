/**
 * The parity regions: for each, where the REAL app is measured and which `/ui/preview` element is
 * its replica. All coordinates are for a 1280x800 viewport with the sidebar open.
 *
 *  - `scenario`   which real-app page state the region is captured in (see `scenarios` in run.mjs)
 *  - `real`       a CSS selector, or `(page) => clip` for a region without a stable hook
 *  - `preview`    a CSS selector on /ui/preview
 *  - `masks`      rectangles (region-relative) excluded from the diff, each with a reason
 */
const FRAME = {
  conversation: '[data-shot="app-conversation"]',
  fresh: '[data-shot="app-new"]',
};

const rect = async (page, selector) => page.evaluate((s) => {
  const b = document.querySelector(s).getBoundingClientRect();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}, selector);

export const REGIONS = [
  { name: "app-conversation", scenario: "session", real: () => ({ x: 0, y: 0, width: 1280, height: 800 }), preview: FRAME.conversation },
  {
    name: "app-new",
    scenario: "new",
    real: () => ({ x: 0, y: 0, width: 1280, height: 800 }),
    preview: FRAME.fresh,
    // Right after a fresh load the real explorer's refresh glyph is drawn a few pixels off its resting shape (it is
    // mid-transition); the same glyph matches exactly once the session page has settled (see `sidebar`).
    masks: [{ x: 228, y: 414, width: 26, height: 26, reason: "explorer refresh glyph mid-transition after a fresh load" }],
  },
  { name: "sidebar", scenario: "session", real: "#session-sidebar", preview: `${FRAME.conversation} [data-slot="app-sidebar"]` },
  { name: "topbar", scenario: "session", real: () => ({ x: 260, y: 0, width: 1020, height: 36 }), preview: `${FRAME.conversation} [data-slot="top-bar"]` },
  { name: "messages-session", scenario: "session", real: async (page) => rect(page, "div.overflow-y-auto.pt-4"), preview: `${FRAME.conversation} [data-region="messages"]` },
  { name: "composer-idle", scenario: "session", real: "[data-chat-composer-box]", preview: `${FRAME.conversation} [data-slot="composer-box"]` },
  { name: "status-session", scenario: "session", real: '[data-slot="chat-status-bar"]', preview: `${FRAME.conversation} [data-slot="status-bar-view"]` },
  { name: "timeline", scenario: "session", real: "div.relative.w-9.flex-shrink-0.select-none", preview: `${FRAME.conversation} [data-slot="timeline-minimap"]` },
  // The pointer rests on the second node: the real minimap opens a full-height panel listing every turn.
  { name: "timeline-hover", scenario: "session-hover", real: "[data-minimap-preview-box]", preview: '[data-shot="app-conversation-hover"] [data-slot="timeline-preview"]' },
  { name: "messages-new", scenario: "new", real: "div.relative.shrink-0 > div.mx-auto.mb-3", preview: `${FRAME.fresh} [data-slot="new-session-view"]` },
  { name: "status-fresh", scenario: "new", real: '[data-slot="chat-status-bar"]', preview: `${FRAME.fresh} [data-slot="status-bar-view"]` },
  ...["general", "models", "skills", "plugins"].map((tab) => ({
    name: `settings-${tab}`,
    scenario: `settings-${tab}`,
    real: '[role="dialog"]',
    preview: `[data-shot="settings-${tab}"]`,
    // The dialog's rounded corners reveal what is behind it: the dimmed app in the real page, the frame in the preview.
    masks: [0, 1075].flatMap((x) => [0, 667].map((y) => ({ x, y, width: 5, height: 5, reason: "dialog corner: backdrop differs behind the rounded corner" }))),
  })),
];
