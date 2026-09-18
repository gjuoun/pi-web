import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const {
  ChatStatusBar,
  contextColor,
  formatModelLabel,
  formatProjectLine,
  formatSessionName,
  formatTokens,
  formatUsageStats,
  latestCacheHitRate,
} = await jiti.import("./ChatStatusBar.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

const USAGE = {
  sessionId: "s1",
  userMessages: 1,
  assistantMessages: 1,
  toolCalls: 0,
  toolResults: 0,
  totalMessages: 2,
  tokens: { input: 1234567, output: 143456, cacheRead: 18000000, cacheWrite: 0, total: 0 },
  cost: 0.194,
};

function renderBar(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(ChatStatusBar, props)),
  );
}

test("formats token counts with pi's exact thresholds", () => {
  // footer.js:20-30 — <1k plain, <10k one decimal k, <1M rounded k, <10M one decimal M, else rounded M.
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(1000), "1.0k");
  assert.equal(formatTokens(9999), "10.0k");
  assert.equal(formatTokens(10000), "10k");
  assert.equal(formatTokens(143456), "143k");
  assert.equal(formatTokens(999999), "1000k");
  assert.equal(formatTokens(1000000), "1.0M");
  assert.equal(formatTokens(1234567), "1.2M");
  assert.equal(formatTokens(9999999), "10.0M");
  assert.equal(formatTokens(18000000), "18M");
});

test("derives the cache hit rate from the latest assistant message, not the totals", () => {
  const usage = (input, cacheRead, cacheWrite) => ({
    input,
    cacheRead,
    cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  });

  assert.equal(
    latestCacheHitRate([
      { role: "assistant", usage: usage(1000, 0, 0) },
      { role: "user" },
      { role: "assistant", usage: usage(10, 990, 0) },
    ]),
    99,
  );
  assert.equal(latestCacheHitRate([{ role: "assistant", usage: usage(0, 0, 0) }]), null);
  assert.equal(latestCacheHitRate([{ role: "user" }]), null);
  assert.equal(latestCacheHitRate(undefined), null);
});

test("omits zero counters and keeps the context segment unconditional", () => {
  const partial = { tokens: { input: 0, output: 143000, cacheRead: 0, cacheWrite: 0, total: 0 }, cost: 0, cacheHitRate: null };
  assert.equal(formatUsageStats(partial, null, false), "↓143k");

  const full = { tokens: USAGE.tokens, cost: USAGE.cost, cacheHitRate: 99.3 };
  assert.equal(
    formatUsageStats(full, { percent: 26.6, contextWindow: 1000000, tokens: 266000 }, true),
    "↑1.2M ↓143k R18M CH99.3% $0.194 26.6%/1.0M (auto)",
  );
});

test("shows CH only with cache traffic and renders an unknown percent as ?", () => {
  const withRateNoCache = {
    tokens: { input: 1000, output: 10, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: 0,
    cacheHitRate: 99.3,
  };
  assert.equal(formatUsageStats(withRateNoCache, null, false), "↑1.0k ↓10");

  const cacheWriteOnly = {
    tokens: { input: 100, output: 10, cacheRead: 0, cacheWrite: 900, total: 0 },
    cost: 0,
    cacheHitRate: 0,
  };
  assert.equal(formatUsageStats(cacheWriteOnly, null, false), "↑100 ↓10 W900 CH0.0%");

  assert.equal(
    formatUsageStats(null, { percent: null, contextWindow: 1000000, tokens: null }, false),
    "?/1.0M",
  );
});

test("prefixes the provider only when several providers are available", () => {
  const model = { provider: "ollama-cloud", modelId: "deepseek-v4.1-flash" };

  assert.equal(
    formatModelLabel({ model, providerCount: 1, thinkingLevel: "low", supportsReasoning: true }),
    "deepseek-v4.1-flash • low",
  );
  assert.equal(
    formatModelLabel({ model, providerCount: 2, thinkingLevel: "low", supportsReasoning: true }),
    "(ollama-cloud) deepseek-v4.1-flash • low",
  );
  assert.equal(
    formatModelLabel({ model, providerCount: 1, thinkingLevel: "off", supportsReasoning: true }),
    "deepseek-v4.1-flash • thinking off",
  );
  assert.equal(
    formatModelLabel({ model, providerCount: 1, thinkingLevel: "low", supportsReasoning: false }),
    "deepseek-v4.1-flash",
  );
  assert.equal(formatModelLabel({ model: null, providerCount: 0, supportsReasoning: false }), "no-model");
});

test("composes the project line from projectRoot, falling back to cwd", () => {
  assert.equal(
    formatProjectLine({ cwd: "/Users/junguo/code/gjuoun/pi-web", home: "/Users/junguo", branch: "main" }),
    "~/code/gjuoun/pi-web (main)",
  );
  // A linked worktree reads as its main repo, not as its own path.
  assert.equal(
    formatProjectLine({
      cwd: "/Users/junguo/code/gjuoun/pi-web-worktrees/status-bar",
      projectRoot: "/Users/junguo/code/gjuoun/pi-web",
      home: "/Users/junguo",
    }),
    "~/code/gjuoun/pi-web",
  );
  // projectRoot is optional on the transient sessions the client builds before its first refresh.
  assert.equal(
    formatProjectLine({ cwd: "/tmp/work", projectRoot: null, home: "/Users/junguo" }),
    "/tmp/work",
  );
  assert.equal(formatProjectLine({ cwd: null }), "");
  // The session name is its own segment now, never part of the project line.
  assert.equal(
    formatProjectLine({ cwd: "/tmp/work", home: "/Users/junguo", sessionName: "ignored" }),
    "/tmp/work",
  );
});

test("composes the session name as its own segment", () => {
  // No leading separator: the name is the right-hand cluster of its own line now, so a bullet would
  // hang off the end of the workspace cluster with nothing left to separate it from.
  assert.equal(formatSessionName("接入 pi-subagents"), "接入 pi-subagents");
  assert.equal(formatSessionName(""), "");
  assert.equal(formatSessionName("   "), "");
  assert.equal(formatSessionName(null), "");
  assert.equal(formatSessionName(undefined), "");
});

test("tints the context segment by band and nothing else", () => {
  assert.equal(contextColor(91), "#ef4444");
  assert.equal(contextColor(80), "rgba(234,179,8,0.95)");
  assert.equal(contextColor(26.6), undefined);
  assert.equal(contextColor(null), undefined);
});

// The bar is a stack of lines, and each line is one flex row. Map every segment to the line that
// holds it, so the tests below assert the layout the user sees rather than a flat string order.
function linesOf(html) {
  const starts = [...html.matchAll(/class="chat-status-line"/g)].map((match) => match.index);
  const lineOf = (cls) => {
    const at = html.indexOf(`class="chat-status-${cls}"`);
    // A marker index points at the row's own attribute list, so a segment inside row 0 sits after
    // exactly one marker: subtract it to make the result 0-based.
    return at < 0 ? -1 : starts.filter((start) => start < at).length - 1;
  };
  return {
    count: starts.length,
    project: lineOf("project"),
    name: lineOf("name"),
    stats: lineOf("stats"),
    model: lineOf("model"),
  };
}

test("stacks two lines in [project][name] / [stats][model] order while a session is ongoing", () => {
  const html = renderBar({
    cwd: "/Users/junguo/code/gjuoun/pi-web",
    home: "/Users/junguo",
    branch: "main",
    sessionName: "接入 pi-subagents",
    usage: USAGE,
    messages: [{ role: "assistant", usage: { input: 10, cacheRead: 990, cacheWrite: 0 } }],
    contextUsage: { percent: 95, contextWindow: 1000000, tokens: 950000 },
    autoCompactionEnabled: true,
    model: { provider: "ollama-cloud", modelId: "deepseek-v4.1-flash" },
    providerCount: 2,
    thinkingLevel: "low",
    supportsReasoning: true,
    modelOptions: [{ provider: "ollama-cloud", modelId: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" }],
    onModelChange() {},
    onThinkingLevelChange() {},
  });

  assert.match(html, /class="chat-status-bar"/);
  // Only the fresh state narrows to the composer width.
  assert.doesNotMatch(html, /is-fresh/);
  // Line 3 is not injected here — it is its own strip inside the same bar in ChatWindow.
  assert.doesNotMatch(html, /chat-status-ext/);

  assert.match(html, /~/);
  assert.match(html, /\(main\)/);
  assert.match(html, /接入 pi-subagents/);
  assert.match(html, /↑1\.2M/);
  assert.match(html, /CH99\.0%/);
  assert.match(html, /\$0\.194/);
  assert.match(html, /95\.0%\/1\.0M \(auto\)/);
  assert.match(html, /color:#ef4444/);
  // pi shows the raw model id, not the display name — the status bar keeps that shape.
  assert.match(html, /\(ollama-cloud\) deepseek-v4\.1-flash/);
  assert.doesNotMatch(html, /DeepSeek V4\.1 Flash/);
  assert.match(html, /• low/);
  assert.match(html, /role="status"/);

  // The workspace leads line 1 and the session name closes it; the counters lead line 2 and the
  // model cluster closes it.
  const lines = linesOf(html);
  assert.equal(lines.count, 2, `an ongoing session shows two lines, got ${lines.count}`);
  assert.deepEqual(
    { project: lines.project, name: lines.name, stats: lines.stats, model: lines.model },
    { project: 0, name: 0, stats: 1, model: 1 },
    "line 1 must be [project][name] and line 2 [stats][model]",
  );
});

test("narrows the fresh state to one [project][model] line and drops the rest", () => {
  const html = renderBar({
    fresh: true,
    cwd: "/Users/junguo/code/gjuoun/pi-web",
    home: "/Users/junguo",
    branch: "main",
    // Supplied on purpose: the fresh state must ignore them rather than lay them out.
    sessionName: "接入 pi-subagents",
    usage: USAGE,
    contextUsage: { percent: 26, contextWindow: 1000000, tokens: 260000 },
    model: { provider: "ollama-cloud", modelId: "deepseek-v4.1-flash" },
    providerCount: 2,
  });

  assert.match(html, /class="chat-status-bar is-fresh"/);
  assert.doesNotMatch(html, /chat-status-stats/);
  assert.doesNotMatch(html, /chat-status-name/);
  assert.doesNotMatch(html, /↑1\.2M/);
  assert.doesNotMatch(html, /接入 pi-subagents/);

  const lines = linesOf(html);
  assert.equal(lines.count, 1, `a new session shows a single line, got ${lines.count}`);
  assert.equal(lines.project, 0, "the workspace must lead the fresh line");
  assert.equal(lines.model, 0, "the model cluster must close the fresh line");
  // Only those two segments share the line.
  assert.equal((html.match(/class="chat-status-(model|project)(")/g) ?? []).length, 2);
});

test("keeps the model selector visible when a model error leaves no options", () => {
  const html = renderBar({
    cwd: "/tmp/work",
    model: null,
    modelOptions: [],
    onModelChange() {},
  });

  assert.match(html, />No models</);
  assert.match(html, /title="No available models"/);
});

test("renders no tools segment", () => {
  const html = renderBar({ cwd: "/tmp/work" });

  assert.doesNotMatch(html, /tools:/i);
  assert.doesNotMatch(html, /Change tool preset/);
  assert.doesNotMatch(html, /Chat only/);
});

test("shows and locks the optimistic model while a switch is pending", () => {
  const html = renderBar({
    cwd: "/tmp/work",
    model: { provider: "deepseek", modelId: "deepseek-v4-flash" },
    providerCount: 1,
    modelOptions: [{ provider: "deepseek", modelId: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }],
    onModelChange() {},
    modelSwitching: true,
  });

  assert.match(html, /title="Switching model"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, />deepseek-v4-flash</);
  assert.match(html, /animation:spin 0\.8s linear infinite/);
});

test("disables every segment while the agent is running", () => {
  const html = renderBar({
    cwd: "/tmp/work",
    busy: true,
    model: { provider: "deepseek", modelId: "deepseek-v4-flash" },
    providerCount: 1,
    modelOptions: [{ provider: "deepseek", modelId: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }],
    onModelChange() {},
    thinkingLevel: "low",
    supportsReasoning: true,
    onThinkingLevelChange() {},
  });

  // model + reasoning
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
});

test("renders nothing when there is neither a cwd nor usage data", () => {
  assert.equal(renderBar({}), "");
  assert.equal(renderBar({ cwd: null, usage: null, contextUsage: null }), "");
});

test("never synthesises the extension status line it does not own", async () => {
  const source = await readFile(new URL("./ChatStatusBar.tsx", import.meta.url), "utf8");
  // Comments may name these tokens while explaining who owns them; the code must not.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // Decision 2: tok/s, ttft and the task timer belong to extensions, not to pi-web.
  assert.doesNotMatch(code, /tok\/s|ttft|⏳|⚡|tokensPerSecond/);
  // Line 3 stays with ExtensionStatusBar.
  assert.doesNotMatch(code, /extension-status|formatExtensionStatusLine/);
});

test("closes a segment menu on Escape like the model selector", async () => {
  const source = await readFile(new URL("./ChatStatusBar.tsx", import.meta.url), "utf8");

  // Keyboard users must be able to dismiss a menu without clicking outside.
  assert.match(
    source,
    /onKeyDown=\{\(event\) => \{\s*if \(event\.key !== "Escape" \|\| !open\) return;\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/,
  );
  // The composer's own Escape shortcut must not also fire while a menu is open.
  assert.match(source, /event\.stopPropagation\(\);[\s\S]{0,80}onOpenChange\(null\)/);
});

test("styles the bar as one scroll surface of stacked mono lines with a fixed popover", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const surfaceRule = css.match(/\.chat-bottom-bar\s*\{([^}]*)\}/)?.[1] ?? "";
  const innerRule = css.match(/\.chat-bottom-bar-inner\s*\{([^}]*)\}/)?.[1] ?? "";
  const barRule = css.match(/\.chat-status-bar\s*\{([^}]*)\}/)?.[1] ?? "";
  const lineRule = css.match(/\.chat-status-line\s*\{([^}]*)\}/)?.[1] ?? "";
  const statsRule = css.match(/\.chat-status-stats\s*\{([^}]*)\}/)?.[1] ?? "";
  const modelRule = css.match(/\.chat-status-model\s*\{([^}]*)\}/)?.[1] ?? "";
  const projectRule = css.match(/\.chat-status-project\s*\{([^}]*)\}/)?.[1] ?? "";
  const nameRule = css.match(/\.chat-status-name\s*\{([^}]*)\}/)?.[1] ?? "";
  const freshRule = css.match(/\.chat-status-bar\.is-fresh\s*\{([^}]*)\}/)?.[1] ?? "";
  const segmentRule = css.match(/\.chat-status-segment\s*\{([^}]*)\}/)?.[1] ?? "";
  const popoverRule = css.match(/\.chat-status-menu-popover\s*\{([^}]*)\}/)?.[1] ?? "";
  const extRule = css.match(/\.chat-status-ext\s*\{([^}]*)\}/)?.[1] ?? "";

  // One scroll surface for the whole bar: every line moves with it, so it owns both axes and the cap.
  assert.match(surfaceRule, /overflow-x:\s*auto/);
  assert.match(surfaceRule, /overflow-y:\s*auto/);
  assert.match(surfaceRule, /max-height:\s*min\(144px,\s*18dvh\)/);
  assert.match(surfaceRule, /overscroll-behavior:\s*contain/);

  // The lines stack inside a block that is at least the viewport wide and exactly as wide as its
  // widest line — that is what keeps space-between pinning the right cluster to the edge on a wide
  // window while a narrow one scrolls the whole stack together.
  assert.match(innerRule, /display:\s*flex/);
  assert.match(innerRule, /flex-direction:\s*column/);
  assert.match(innerRule, /min-width:\s*100%/);
  assert.match(innerRule, /width:\s*max-content/);

  // The bar is that stack, not a scroller.
  assert.match(barRule, /display:\s*flex/);
  assert.match(barRule, /flex-direction:\s*column/);
  assert.doesNotMatch(barRule, /overflow/);
  assert.doesNotMatch(barRule, /max-height/);

  // A line is the row: two clusters pinned to its edges, always on one baseline.
  assert.match(lineRule, /display:\s*flex/);
  assert.match(lineRule, /align-items:\s*baseline/);
  assert.match(lineRule, /justify-content:\s*space-between/);
  assert.match(lineRule, /gap:\s*0 12px/);
  assert.match(barRule, /font-family:\s*var\(--font-mono\)/);
  assert.match(barRule, /font-size:\s*11px/);
  // 4px of inline inset puts the footer text on the composer's icons; the vertical rhythm belongs
  // to the surface now, so a strip carries none of its own or every line would add a gap.
  assert.match(barRule, /padding:\s*0 4px/);
  // The bar spans the full bottom-bar width by default and keeps the horizontal separator above it.
  assert.match(barRule, /width:\s*100%/);
  assert.doesNotMatch(barRule, /max-width/);
  // The line moved to the composer: the row must not draw one of its own, or the column grows a
  // third rule (the composer already has a top and a bottom one).
  assert.doesNotMatch(barRule, /border-top/);
  // The fresh row no longer narrows itself: the composer above it is full width now, so capping the
  // row would pull its edges off the input's. It must not read the reading-width preference at all.
  assert.doesNotMatch(freshRule, /max-width/);
  // ...and it drops the separator: with no session running there is no footer to divide off.
  // The fresh row's rule had nothing left to say once the cap moved to the composer, so the whole
  // block is gone rather than reduced to a dead override.
  assert.equal(freshRule, "");
  // The single project-plus-name span the two lines used to share is gone for good.
  assert.doesNotMatch(css, /\.chat-status-pwd\s*\{/);

  // On a phone the two clusters are packed at the start of the line instead of being pushed to its
  // edges: space-between only strands the right cluster at the end of a bar that is already scrolling.
  const mobileBlocks = [...css.matchAll(/@media \(max-width: 640px\)\s*\{([\s\S]*?)\n\}/g)].map((match) => match[1]);
  assert.ok(
    mobileBlocks.some((block) => /\.chat-status-line\s*\{/.test(block) && /justify-content:\s*flex-start/.test(block)),
    "the mobile breakpoint must pack the clusters at the start of the line",
  );

  // The counters lead line 2 and the model cluster closes it. An auto margin here would pin both
  // clusters to the right and silently mirror the line the user asked for.
  assert.doesNotMatch(statsRule, /margin-left/);
  assert.doesNotMatch(modelRule, /margin-left/);
  // A narrow window must not squeeze the row: segments keep their natural width and it scrolls.
  assert.match(statsRule, /flex-wrap:\s*nowrap/);
  assert.match(statsRule, /flex:\s*0 0 auto/);
  assert.match(modelRule, /flex:\s*0 0 auto/);
  assert.match(projectRule, /flex:\s*0 0 auto/);
  assert.match(projectRule, /white-space:\s*nowrap/);
  assert.match(nameRule, /flex:\s*0 0 auto/);
  assert.match(nameRule, /white-space:\s*nowrap/);
  // Each line's right cluster carries the same left spacing, so the two clusters of a line never sit
  // flush against each other when the bar is squeezed down to its natural width.
  assert.match(nameRule, /padding-left:\s*\d+px/);
  assert.match(modelRule, /padding-left:\s*\d+px/);
  assert.doesNotMatch(modelRule, /min-width:\s*0/);
  // A segment must read as footer text, not as a button.
  assert.match(segmentRule, /background:\s*none/);
  assert.match(segmentRule, /font:\s*inherit/);

  // The menu escapes the scrolling row: fixed to the viewport, above every panel.
  assert.match(popoverRule, /position:\s*fixed/);
  const zIndex = Number(popoverRule.match(/z-index:\s*(\d+)/)?.[1] ?? "0");
  assert.ok(zIndex >= 500, `popover z-index ${zIndex} must be >= 500`);

  // Line 3 rides the same surface: whitespace preserved, never truncated, and no scroll of its own
  // or a long status would scroll inside the line instead of moving the whole bar.
  assert.match(extRule, /white-space:\s*pre\s*;/);
  assert.match(extRule, /padding:\s*0 4px/);
  assert.doesNotMatch(extRule, /overflow/);
  assert.doesNotMatch(extRule, /text-overflow:\s*ellipsis/);
});
