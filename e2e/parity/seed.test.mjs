import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { explorerRows } from "../../app/ui/preview/_fixtures/explorer.ts";
import { turns } from "../../app/ui/preview/_fixtures/conversation.ts";
import { projects } from "../../app/ui/preview/_fixtures/sessions.ts";
import { seedAgentDir } from "./seed.mjs";

const dir = mkdtempSync(join(tmpdir(), "pi-parity-seed-"));
const seeded = seedAgentDir(dir);
after(() => rmSync(dir, { recursive: true, force: true }));

const sessionFiles = () => readdirSync(join(dir, "sessions"), { recursive: true }).filter((f) => String(f).endsWith(".jsonl")).map((f) => join(dir, "sessions", String(f)));
const read = (file) => readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line));

test("11 session files in 6 project folders, one header each, ids matching the fixtures", () => {
  const files = sessionFiles();
  assert.equal(files.length, 11);
  const folders = new Set(files.map((f) => f.split("/").slice(-2)[0]));
  assert.equal(folders.size, 6);
  const ids = files.map((f) => read(f)[0].id).sort();
  assert.deepEqual(ids, projects.flatMap((p) => p.sessions.map((s) => s.id)).sort());
  for (const f of files) assert.equal(read(f)[0].type, "session");
});

test("pinned sessions carry the pin marker, every session has a name", () => {
  for (const file of sessionFiles()) {
    const entries = read(file);
    const id = entries[0].id;
    const fixture = projects.flatMap((p) => p.sessions).find((s) => s.id === id);
    const pinned = entries.some((e) => e.type === "custom" && e.customType === "pi-web:session-pinned" && e.data === true);
    assert.equal(pinned, Boolean(fixture.pinned), `${id}: pinned marker`);
    assert.equal(entries.find((e) => e.type === "session_info")?.name, fixture.title, `${id}: name`);
  }
});

test("the explorer project is a git repo on feat/ui-lib whose status matches the fixture", () => {
  const git = (...args) => execFileSync("git", args, { cwd: seeded.projectDir, encoding: "utf8" }).trimEnd();
  assert.equal(git("rev-parse", "--abbrev-ref", "HEAD").trim(), "feat/ui-lib");
  const dirty = git("status", "--porcelain", "--untracked-files=all").split("\n").filter(Boolean);
  const top = (line) => line.slice(3).split("/")[0];
  const modifiedTop = new Set(dirty.filter((l) => !l.startsWith("??")).map(top));
  const untrackedTop = new Set(dirty.filter((l) => l.startsWith("??")).map(top));
  for (const row of explorerRows) {
    if (row.status === "modified") assert.ok(modifiedTop.has(row.name), `${row.name} should be modified`);
    if (row.status === "untracked") assert.ok(untrackedTop.has(row.name), `${row.name} should be untracked`);
    if (!row.status) assert.ok(!modifiedTop.has(row.name) && !untrackedTop.has(row.name), `${row.name} should be clean`);
  }
});

test("the active session's conversation round-trips: user turns, assistant messages with usage, an error and a compaction", () => {
  const file = sessionFiles().find((f) => read(f)[0].id === seeded.activeSessionId);
  const entries = read(file);
  const messages = entries.filter((e) => e.type === "message").map((e) => e.message);
  assert.equal(messages.filter((m) => m.role === "user").length, turns.filter((t) => t.kind === "user").length);
  const assistants = messages.filter((m) => m.role === "assistant" && m.stopReason !== "error");
  assert.ok(assistants.length >= turns.filter((t) => t.kind === "assistant").length);
  for (const a of assistants) assert.ok(a.usage && a.usage.cost.total > 0, "assistant usage");
  assert.ok(messages.some((m) => m.role === "assistant" && m.stopReason === "error" && m.errorMessage));
  assert.ok(entries.some((e) => e.type === "compaction" && e.summary));
  assert.ok(messages.some((m) => m.role === "toolResult"));
  // a single chain: every entry's parent is the previous entry
  const chain = entries.filter((e) => e.type !== "session" && e.type !== "session_info" && e.type !== "custom");
  chain.forEach((e, i) => assert.equal(e.parentId, i ? chain[i - 1].id : null, `entry ${e.id} parent`));
});

test("settings: a default model, skills on disk, and plugin packages listed", () => {
  const settings = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
  assert.equal(settings.defaultModel, "claude-sonnet-5-5");
  assert.ok(Array.isArray(settings.packages) && settings.packages.length >= 3);
  assert.ok(readdirSync(join(dir, "skills")).length >= 4);
});
