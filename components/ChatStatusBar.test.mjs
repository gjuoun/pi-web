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
  formatPwdLine,
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

test("composes line 1 as cwd (branch) • session name", () => {
  assert.equal(
    formatPwdLine({ cwd: "/Users/junguo/code/gjuoun/pi-web", home: "/Users/junguo", branch: "main", sessionName: "接入 pi-subagents" }),
    "~/code/gjuoun/pi-web (main) • 接入 pi-subagents",
  );
  assert.equal(formatPwdLine({ cwd: "/tmp/work", home: "/Users/junguo" }), "/tmp/work");
  assert.equal(formatPwdLine({ cwd: null }), "");
});

test("tints the context segment by band and nothing else", () => {
  assert.equal(contextColor(91), "#ef4444");
  assert.equal(contextColor(80), "rgba(234,179,8,0.95)");
  assert.equal(contextColor(26.6), undefined);
  assert.equal(contextColor(null), undefined);
});

test("renders both lines with the model label right-aligned", () => {
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
  });

  assert.match(html, /~/);
  assert.match(html, /\(main\)/);
  assert.match(html, /接入 pi-subagents/);
  assert.match(html, /↑1\.2M/);
  assert.match(html, /CH99\.0%/);
  assert.match(html, /\$0\.194/);
  assert.match(html, /95\.0%\/1\.0M \(auto\)/);
  assert.match(html, /color:#ef4444/);
  assert.match(html, /\(ollama-cloud\) deepseek-v4\.1-flash • low/);
  assert.match(html, /class="chat-status-model"/);
  assert.match(html, /role="status"/);
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

test("styles the bar as mono, dim footer text aligned with the composer", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const barRule = css.match(/\.chat-status-bar\s*\{([^}]*)\}/)?.[1] ?? "";
  const lineRule = css.match(/\.chat-status-line\s*\{([^}]*)\}/)?.[1] ?? "";
  const modelRule = css.match(/\.chat-status-model\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(barRule, /font-family:\s*var\(--font-mono\)/);
  assert.match(barRule, /font-size:\s*11px/);
  assert.match(barRule, /max-width:\s*var\(--chat-content-max-width, 820px\)/);
  assert.match(lineRule, /flex-wrap:\s*wrap/);
  assert.match(modelRule, /margin-left:\s*auto/);
});
