/**
 * Seed an isolated pi agent dir from the `/ui/preview` fixtures, so the REAL app can render exactly
 * the content the stateless replicas show. The fixtures are imported as plain modules (they only
 * carry type-only imports, which Node strips).
 *
 *   const { agentDir, projectDir, activeSessionId } = seedAgentDir("/tmp/some-dir");
 *
 * Layout written: `sessions/<encoded cwd>/<ts>_<id>.jsonl` (11 sessions), the explorer project as a git
 * repo on `feat/ui-lib`, `settings.json`, `models.json`, `auth.json`, `skills/<name>/SKILL.md`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { turns } from "../../app/ui/preview/_fixtures/conversation.ts";
import { explorerRows } from "../../app/ui/preview/_fixtures/explorer.ts";
import { projects } from "../../app/ui/preview/_fixtures/sessions.ts";
import { plugins, skills } from "../../app/ui/preview/_fixtures/settings.ts";

export const BASE_TIME = Date.parse("2026-10-02T00:00:00.000Z");
const PROVIDER = "anthropic";
const MODEL = "claude-sonnet-5-5";

let counter = 0;
const nextId = () => (++counter).toString(16).padStart(8, "0");
const iso = (ms) => new Date(ms).toISOString();
const encodeCwd = (cwd) => `--${cwd.replace(/^\//, "").replace(/[/\\:]/g, "-")}--`;

function usageOf(u, share = 1) {
  const cost = u.cost * share;
  return {
    input: Math.round(u.input * share),
    output: Math.round(u.output * share),
    cacheRead: Math.round(u.cacheRead * share),
    cacheWrite: Math.round(u.cacheWrite * share),
    totalTokens: Math.round((u.input + u.output + u.cacheRead + u.cacheWrite) * share),
    cost: { input: cost * 0.1, output: cost * 0.5, cacheRead: cost * 0.3, cacheWrite: cost * 0.1, total: cost },
  };
}

/** Fixture assistant blocks → one markdown string (process blocks are handled separately). */
function toMarkdown(blocks) {
  return blocks.filter((b) => b.kind !== "process").map((b) => {
    if (b.kind === "p") return b.text;
    if (b.kind === "h") return `${"#".repeat(b.level)} ${b.text}`;
    if (b.kind === "list") return b.items.map((item, i) => `${b.ordered ? `${i + 1}.` : "-"} ${item}`).join("\n");
    if (b.kind === "code") return `\`\`\`${b.lang}\n${b.code}\n\`\`\``;
    if (b.kind === "table") return [`| ${b.head.join(" | ")} |`, `| ${b.head.map(() => "---").join(" | ")} |`, ...b.rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
    return "";
  }).join("\n\n");
}

const toolArguments = (name, summary) => (name === "bash" ? { command: summary } : { path: summary });

/** The active session's conversation as a single chain of real session entries. */
/** "12:17 AM" → milliseconds on the fixture day (UTC). */
function clockMs(label) {
  const [, h, m, ap] = /^(\d+):(\d+) (AM|PM)$/.exec(label);
  return BASE_TIME + (((Number(h) % 12) + (ap === "PM" ? 12 : 0)) * 60 + Number(m)) * 60_000;
}

function conversationEntries() {
  const entries = [];
  let t = BASE_TIME;
  let parent = null;
  const push = (entry) => { entries.push({ ...entry, id: nextId(), parentId: parent, timestamp: iso((t += 1000)) }); parent = entries.at(-1).id; return entries.at(-1); };
  const message = (message) => push({ type: "message", message: { ...message, timestamp: t + 1000 } });
  const assistant = (content, usage, extra = {}, share = 1) => message({ role: "assistant", content, provider: PROVIDER, model: MODEL, stopReason: "stop", usage: usageOf(usage, share), ...extra });
  let firstKept;
  for (const turn of turns) {
    if ("time" in turn && turn.time) t = Math.max(t, clockMs(turn.time));
    if (turn.kind === "user") {
      const e = message({ role: "user", content: [{ type: "text", text: turn.lines.join("\n\n") }] });
      firstKept ??= e.id;
    } else if (turn.kind === "assistant") {
      for (const block of turn.blocks.filter((b) => b.kind === "process")) {
        const { run } = block;
        const perMessage = Math.max(1, run.messages);
        const chunk = Math.ceil(run.steps.length / perMessage);
        for (let m = 0; m < perMessage; m++) {
          const steps = run.steps.slice(m * chunk, (m + 1) * chunk);
          const content = [];
          const calls = [];
          for (const step of steps) {
            if (step.kind === "thinking") content.push({ type: "thinking", thinking: step.text });
            else { const id = `call_${nextId()}`; calls.push({ id, step }); content.push({ type: "toolCall", id, name: step.name, arguments: toolArguments(step.name, step.summary) }); }
          }
          assistant(content, run.usage ?? turn.usage, { stopReason: calls.length ? "toolUse" : "stop" }, 1 / perMessage);
          for (const { id, step } of calls) message({ role: "toolResult", toolCallId: id, toolName: step.name, isError: Boolean(step.failed), content: [{ type: "text", text: `${step.name} ok` }] });
        }
      }
      const text = toMarkdown(turn.blocks);
      if (text) assistant([{ type: "text", text }], turn.usage);
    } else if (turn.tone === "error") {
      message({ role: "assistant", content: [], provider: PROVIDER, model: MODEL, stopReason: "error", errorMessage: turn.text, usage: usageOf({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }) });
    } else {
      push({ type: "compaction", summary: turn.text, firstKeptEntryId: firstKept, tokensBefore: 148300 });
    }
  }
  return entries;
}

function writeSessionFile(agentDir, cwd, session, entries, startMs, extraEntries = []) {
  const dir = join(agentDir, "sessions", encodeCwd(cwd));
  mkdirSync(dir, { recursive: true });
  const header = { type: "session", version: 3, id: session.id, timestamp: iso(startMs), cwd };
  const all = [...entries];
  let parent = all.at(-1)?.id ?? null;
  let t = Date.parse(all.at(-1)?.timestamp ?? iso(startMs));
  const append = (entry) => { all.push({ ...entry, id: nextId(), parentId: parent, timestamp: iso((t += 1000)) }); parent = all.at(-1).id; };
  for (const extra of extraEntries) append(extra);
  append({ type: "session_info", name: session.title });
  if (session.pinned) append({ type: "custom", customType: "pi-web:session-pinned", data: true });
  writeFileSync(join(dir, `${iso(startMs).replace(/[:.]/g, "-")}_${session.id}.jsonl`), [header, ...all].map((e) => JSON.stringify(e)).join("\n") + "\n");
}

function seedGitProject(projectDir) {
  mkdirSync(projectDir, { recursive: true });
  const git = (...args) => execFileSync("git", args, { cwd: projectDir, stdio: "ignore" });
  git("init", "-q", "-b", "feat/ui-lib");
  git("config", "user.email", "parity@example.com");
  git("config", "user.name", "parity");
  const filesIn = (name) => join(projectDir, name, "index.txt");
  for (const row of explorerRows) {
    if (row.kind === "folder") { mkdirSync(join(projectDir, row.name), { recursive: true }); writeFileSync(filesIn(row.name), "one\n"); }
    else if (row.status !== "untracked") writeFileSync(join(projectDir, row.name), "one\n");
  }
  git("add", "-A");
  git("commit", "-q", "-m", "initial");
  for (const row of explorerRows) {
    if (row.status === "modified") writeFileSync(row.kind === "folder" ? filesIn(row.name) : join(projectDir, row.name), "one\ntwo\n");
    if (row.status === "untracked") writeFileSync(join(projectDir, row.name), "new\n");
  }
}

export function seedAgentDir(agentDir, { projectsRoot = join(agentDir, "projects") } = {}) {
  counter = 0;
  mkdirSync(agentDir, { recursive: true });
  let projectDir;
  let activeSessionId;
  projects.forEach((project, pi) => {
    const cwd = join(projectsRoot, project.name);
    if (pi === 0) { projectDir = cwd; seedGitProject(cwd); } else mkdirSync(cwd, { recursive: true });
    project.sessions.forEach((session, si) => {
      const startMs = BASE_TIME - (pi * 100 + si) * 3_600_000;
      let entries = [];
      if (session.active) {
        activeSessionId = session.id;
        entries = conversationEntries();
      } else {
        const t0 = startMs;
        const user = { type: "message", id: nextId(), parentId: null, timestamp: iso(t0 + 1000), message: { role: "user", content: [{ type: "text", text: session.title }], timestamp: t0 + 1000 } };
        const reply = { type: "message", id: nextId(), parentId: user.id, timestamp: iso(t0 + 2000), message: { role: "assistant", content: [{ type: "text", text: "Done." }], provider: PROVIDER, model: MODEL, stopReason: "stop", usage: usageOf({ input: 3, output: 120, cacheRead: 1000, cacheWrite: 200, cost: 0.01 }), timestamp: t0 + 2000 } };
        entries = [user, reply];
      }
      writeSessionFile(agentDir, cwd, session, entries, startMs);
    });
  });
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({
    defaultProvider: PROVIDER, defaultModel: MODEL, defaultThinkingLevel: "high", hideThinkingBlock: false,
    // Local packages: an `npm:` source would make pi try to install them over the network.
    packages: plugins.map((p) => (p.enabled ? join(agentDir, "plugins", p.name) : { source: join(agentDir, "plugins", p.name), extensions: [], skills: [], prompts: [], themes: [] })),
  }, null, 2));
  writeFileSync(join(agentDir, "auth.json"), JSON.stringify({ [PROVIDER]: { type: "api_key", key: "sk-parity-demo" } }, null, 2));
  for (const plugin of plugins) {
    const dir = join(agentDir, "plugins", plugin.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: plugin.name, version: plugin.version, description: plugin.description, keywords: ["pi-package"] }, null, 2));
  }
  for (const skill of skills) {
    const dir = join(agentDir, "skills", skill.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n# ${skill.name}\n`);
  }
  return { agentDir, projectDir, activeSessionId };
}
