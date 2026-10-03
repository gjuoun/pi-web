import type { MinimapNode, OutlineItem, SessionStatsData, StatusBarData, Turn, UsageLine } from "@/components/app/view-types";

/** The active session's turns: markdown, a process-details fold, an error and a compaction summary. */
export const turns: Turn[] = [
  {
    kind: "user",
    time: "12:14 AM",
    lines: ["let's simulate the existing UI in a new display page, so we can chat and optimize the experience", "it should have no state, just displays, fill with demo data"],
  },
  {
    kind: "assistant",
    model: "Claude Sonnet 5.5",
    time: "12:17 AM",
    usage: { input: 2, output: 2632, cacheRead: 404974, cacheWrite: 4253, cost: 0.118 },
    blocks: [
      { kind: "h", level: 2, text: "Restatement" },
      { kind: "p", text: "The real UI is a few huge **stateful** components, so I'd build stateless replicas in `components/app/*` and a page at `/ui/preview`." },
      { kind: "list", ordered: true, items: ["**Messages:** replicate or reuse the real `MessageView`?", "**Mobile:** desktop 1280px only now?", "**Timeline:** the right-edge `ChatMinimap`?"] },
      { kind: "table", head: ["Region", "Replica", "Source"], rows: [["Sidebar", "AppSidebar", "SessionSidebar.tsx"], ["Top bar", "TopBar", "AppShell.tsx"], ["Timeline", "TimelineMinimap", "ChatMinimap.tsx"]] },
      { kind: "code", lang: "ts", code: "export function SessionRow({ title, time, active }: SessionItem) {\n  return <div data-slot=\"session-row\" aria-current={active ? \"page\" : undefined}>{title}</div>;\n}" },
      { kind: "p", text: "Say \"go\" to take my defaults. Then I'll ground against the code and write `plan.md`." },
    ],
  },
  {
    kind: "user",
    time: "12:24 AM",
    lines: ["replicate, so we don't have to concern the state, only on UI", "desktop for now", "right, the minimap"],
  },
  {
    kind: "assistant",
    model: "Claude Sonnet 5.5",
    time: "12:31 AM",
    usage: { input: 1, output: 42, cacheRead: 414127, cacheWrite: 0, cost: 0.2051 },
    blocks: [
      {
        kind: "process",
        run: {
          messages: 2,
          toolCalls: 4,
          model: "Claude Sonnet 5.5",
          steps: [
            { kind: "thinking", text: "Before grounding I'm weighing whether to read the code myself or delegate to finder subagents in parallel", duration: "3s" },
            { kind: "tool", name: "bash", summary: "cd /Users/jun/code/gjuoun/pi-web && lsof -nP -iTCP:30141 -sTCP:LISTEN | head -2", duration: "12s" },
            { kind: "tool", name: "read", summary: "/tmp/jun/ui-preview/ref-session.png", duration: "0.1s" },
            { kind: "tool", name: "edit", summary: "app/ui/preview/page.tsx", duration: "0.2s" },
            { kind: "tool", name: "bash", summary: "node --experimental-strip-types --test app/ui/preview/page.test.mjs", duration: "1.4s" },
          ],
          usage: { input: 4, output: 587, cacheRead: 414127, cacheWrite: 1200, cost: 1.0412 },
        },
      },
      { kind: "p", text: "The plan is written and passes the structural check. I haven't changed any pi-web code yet." },
    ],
  },
  { kind: "notice", tone: "error", title: "Request failed", text: "Rate limit reached for claude-sonnet-5-5. Retrying in 20s (attempt 2 of 3).", time: "12:31 AM" },
  { kind: "notice", tone: "compaction", title: "Conversation compacted", text: "Summarized 412 earlier messages (148,300 tokens) into 6,200 tokens. Work continues from the plan and the evidence log.", time: "12:31 AM" },
  {
    kind: "user",
    time: "12:52 AM",
    lines: ["1"],
  },
  {
    kind: "assistant",
    model: "Claude Sonnet 5.5",
    time: "12:58 AM",
    usage: { input: 6, output: 3120, cacheRead: 510442, cacheWrite: 2210, cost: 0.9633 },
    blocks: [
      { kind: "h", level: 3, text: "P4 — Sidebar views" },
      { kind: "p", text: "Red first (`session-row.test.mjs` fails with `Cannot find module`), then green. The active row carries `aria-current` and the pin indicator renders once per pinned row." },
    ],
  },
];

/** What the real minimap lists under a turn: the reply's headings, or the first line of its text when it has none. */
function outlineAfter(index: number): OutlineItem[] {
  const reply = turns.slice(index + 1).find((t) => t.kind === "user" || t.kind === "assistant");
  if (!reply || reply.kind !== "assistant") return [];
  const headings = reply.blocks.flatMap((b): OutlineItem[] => (b.kind === "h" ? [{ level: b.level, label: b.text }] : []));
  if (headings.length) return headings;
  const text = reply.blocks.find((b) => b.kind === "p");
  return text?.kind === "p" ? [{ label: text.text }] : [];
}

/** One node per user turn and per compaction entry, in order (the real minimap lists both). The active node is the turn nearest the top of the viewport. */
export const minimapNodes: MinimapNode[] = turns.flatMap((turn, index): MinimapNode[] =>
  turn.kind === "user"
    ? [{ text: turn.lines.join("\n\n"), outline: outlineAfter(index) }]
    : turn.kind === "notice" && turn.tone === "compaction"
      ? [{ text: turn.text, outline: [] }]
      : [],
).map((node, i) => (i === 2 ? { ...node, active: true } : node));

/** Every message's usage in the session: each process run's, then the turn's own (the final answer). */
const usages: UsageLine[] = turns.flatMap((turn) =>
  turn.kind === "assistant" ? [...turn.blocks.flatMap((b) => (b.kind === "process" && b.run.usage ? [b.run.usage] : [])), turn.usage] : [],
);
const sum = (key: keyof UsageLine) => usages.reduce((total, u) => total + u[key], 0);
/** The same compact formatting the real top bar uses (`1.2M`, `8k`, plain below a thousand). */
export const formatCompact = (value: number): string => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value));
const last = turns.filter((t) => t.kind === "assistant").at(-1);
const contextTokens = last?.kind === "assistant" ? last.usage.input + last.usage.output + last.usage.cacheRead + last.usage.cacheWrite : 0;
const CONTEXT_WINDOW = 1_000_000;

/** Session totals, derived from the turns the way the real app derives them from the session file. */
export const sessionTotals = { input: sum("input"), output: sum("output"), cacheRead: sum("cacheRead"), cacheWrite: sum("cacheWrite"), cost: sum("cost"), contextTokens, contextWindow: CONTEXT_WINDOW };

export const sessionStats: SessionStatsData = {
  up: formatCompact(sessionTotals.input),
  down: formatCompact(sessionTotals.output),
  cache: formatCompact(sessionTotals.cacheRead),
  cost: `$${sessionTotals.cost.toFixed(2)}`,
  contextPercent: Math.round((contextTokens / CONTEXT_WINDOW) * 100),
  contextWindow: formatCompact(CONTEXT_WINDOW),
};

/** The real status bar's token formatting (`ChatStatusBar.formatTokens`). */
export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

const lastUsage = last?.kind === "assistant" ? last.usage : undefined;
/** Cache hit rate of the latest assistant message, as the real bar computes it. */
const cacheHit = lastUsage ? (lastUsage.cacheRead / (lastUsage.input + lastUsage.cacheRead + lastUsage.cacheWrite)) * 100 : 0;
const contextPercentExact = (contextTokens / CONTEXT_WINDOW) * 100;

/** Line 2 of the real bar: counters left out while zero, `CH` needs cache traffic, then the context share with `(auto)`. */
export const statusStats: string[] = [
  `↑${formatTokens(sessionTotals.input)}`,
  `↓${formatTokens(sessionTotals.output)}`,
  `R${formatTokens(sessionTotals.cacheRead)}`,
  `W${formatTokens(sessionTotals.cacheWrite)}`,
  `CH${cacheHit.toFixed(1)}%`,
  `$${sessionTotals.cost.toFixed(3)}`,
  `${contextPercentExact.toFixed(1)}%/${formatTokens(CONTEXT_WINDOW)} (auto)`,
];

export const statusBar: StatusBarData = {
  project: "~/code/gjuoun/pi-web",
  branch: "feat/ui-lib",
  sessionName: "🎨Draft pi-web UI component library page",
  stats: statusStats,
  contextPercent: contextPercentExact,
  model: "claude-sonnet-5-5",
  thinking: "high",
};

export const freshStatusBar: StatusBarData = { project: "~/code/gjuoun/pi-web", model: "claude-sonnet-5-5", thinking: "auto" };
