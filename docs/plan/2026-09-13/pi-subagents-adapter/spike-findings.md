# Spike: pi-subagents as the Web UI sub-agent engine (A-1)

**Date:** 2026-09-13
**Repo:** `gjuoun/pi-web` @ `02a4f98` (fork of `agegr/pi-web`)
**Scope:** read-only feasibility spike. No pi-web source file was modified.
**Question:** can `@tintinweb/pi-subagents` replace pi-web's own sub-agent implementation, with pi-web acting as the UI/adapter (the role `tintinweb/pi-tasks` plays in the TUI)?

## TL;DR

**Yes, and the adapter is small.** pi-web already does the hard part: it binds extensions
(`lib/rpc-manager.ts:350`) and it reads sessions from the standard session directory. Once
pi-subagents is loaded, the bus gives the web UI status and control — `subagents:ready`,
`started`, `completed`/`failed` with `result`/`usage`, RPC `spawn`/`stop`/`consume` — and the
manager's record hands out the **live child session** (finding 7), so live streaming and mid-run
steering both work. Child runs are real Pi sessions with `parentSession` set.

The costs that remain: **no `created` event for RPC spawns**, **no nested visibility**, and
**two relied-on fields (`record.session`, `record.sessionFile`) that upstream does not document**.

> Correction (stage 5): an earlier revision of this report claimed there was no live handle and
> no steer path. That was a sampling error — the record is read too early at `started`. Re-read a
> few seconds into the run, `record.session` is a live `AgentSession` and `record.sessionFile` is
> the child's file.

## What was run

| Stage | Script | Model calls | Purpose |
|---|---|---|---|
| 0 | `.spike-stage0.mjs` | none | What a web-style session loads today |
| 1 | `.spike-stage1.mjs` | none | Load the package as an inline extension; probe `ready` + `ping` before binding |
| 2 | `.spike-stage2.mjs` | 1 (finder) | Bind extensions, RPC `ping` → `spawn` → `consume`/`stop`; inspect registry + files on disk |
| 3 | `.spike-stage3.mjs` | none | Control: does `pi.appendEntry` persist in a turn-less session? |
| 4 | `.spike-stage4.mjs` | 2 (parent turn + finder) | Realistic flow: parent turn first, then spawn; dump every session file entry |
| 5 | `.spike-stage5.mjs` | 2 (parent turn + finder) | Re-measure the record **mid-run** (T+4s) and at settle: session handle, sessionFile, child file growth |

Environment: `@tintinweb/pi-subagents@0.19.0`, `@earendil-works/pi-coding-agent@0.85.1`.
Isolated `PI_CODING_AGENT_SESSION_DIR` and temp cwd in every stage; the user's real session
directory was never written to. The package was loaded as an inline factory from a temporary
copy under `node_modules/` (see "Engine loading" below).

## Verified findings

### 1. It is not enabled in this environment at all

`~/.pi/agent/npm/package.json` lists `@tintinweb/pi-subagents@^0.19.0` as a dependency, but
`~/.pi/agent/settings.json` `packages` contains only `pi-plugins-control` and `pi-studio`.
Stage 0 loaded **11 extensions and none of them was pi-subagents** — the package sits in
`node_modules` but nothing references it.

Consequence: "the user has pi-subagents installed" and "the web session can use it" are
different questions. The adapter must decide how the engine gets loaded (below).

### 2. Inline-loading the factory works, and it registers four tools

With the factory injected through `resourceLoaderOptions.extensionFactories`, the extension
loads as `<inline:pi-subagents>` and registers:

```
Agent, SubagentWorkflow, get_subagent_result, steer_subagent
```

pi-web's own inline extension registers only the first, third and fourth
(`SUBAGENT_CONTROL_TOOL_NAMES`), so **`SubagentWorkflow` is outside pi-web's reserved-name
suppression set** — a loaded pi-subagents would keep its workflow tool even while pi-web
suppresses the "legacy" package.

### 3. Nothing happens until `bindExtensions` — then everything does

Before binding: no `subagents:ready`, and `subagents:rpc:ping` → no reply at all (the docs call
this "indistinguishable from not installed").

After `session.bindExtensions({ mode: "rpc" })` — exactly what pi-web does at
`lib/rpc-manager.ts:350-375`:

```
EVENT     subagents:ready {}
RPC_REPLY subagents:rpc:ping  {"success":true,"data":{"version":2}}
```

Protocol version 2 confirmed live. **No pi-web change is needed for activation**: pi-web
already binds extensions before use. Availability is per session, so a session built with
`noExtensions` (a profile with `load_extensions: false`) or a chat-only session will simply
never emit `ready` and must be treated as "engine unavailable", with a timeout.

### 4. RPC spawn works, and `subagents:created` really does not fire

```
RPC_REPLY subagents:rpc:spawn {"success":true,"data":{"id":"8dc9cf52-341f-405"}}
EVENT     subagents:started   {"id":"8dc9cf52-341f-405","type":"finder","description":"spike smoke test"}
EVENT     subagents:completed {"id":"8dc9cf52-341f-405","type":"finder","description":"spike smoke test",
                               "result":"OK","status":"steered","toolUses":1,"durationMs":14996,
                               "tokens":{...},"usage":{...,"cost":{"total":0}}}
```

Confirmed empirically: the first event for an RPC-spawned agent is `started`, **not**
`created`. `started` carries only `{id, type, description}`; `completed`/`failed` carry the
result, status, tool-use count, duration, tokens and a pi `Usage` object (enough for a web card
and a cost line).

`status` is not a simple completed/failed flag: the observed run reported `"steered"` because
pi-subagents' own turn-limit behaviour steered it. The web card must accept
`queued | running | completed | steered | aborted | stopped | error`.

### 5. Child runs are first-class sessions

Child session file, on disk in the standard session directory:

```json
{"id":"01a09c44-33e6-...","cwd":"...","parentSession":".../<parent>.jsonl"}
```

That is the same shape pi-web already groups in the sidebar
(`lib/session-tree.ts` / `lib/session-family.ts` read the header `parentSession`), so
nesting sub-agent sessions requires no new discovery path.

### 6. `consume` and `stop` reply as documented

```
RPC_REPLY subagents:rpc:consume {"success":true}
RPC_REPLY subagents:rpc:stop    {"success":false,"error":"Agent is not running"}
```

`consume` sent synchronously inside the `completed` handler is the documented clean path for
suppressing the follow-up notification the parent would otherwise receive.

### 7. The registry is thin, but its records carry the live session

`globalThis[Symbol.for("pi-subagents:manager")]` exists and exposes exactly four members
(`src/index.ts:738-746`): `waitForAll`, `hasRunning`, `spawn`, `getRecord` — the last filtered
through `isTopLevelAgent`, so nested children come back `undefined`.

`AgentRecord.session` is assigned inside the run window (`src/agent-manager.ts:807`, `:870`)
and cleared on completion (`:1434`). **It is populated, but only after the run starts** —
sampling it at the `started` event or the spawn reply returns `undefined`; sampling it a few
seconds into the run returns a live object (stage 5: `{status:"running", session: object,
  sessionFile: "…/<child>.jsonl"}`). Stage 4's mid-run read (inside the `started` handler) was
too early, which is what produced the earlier "no live handle" conclusion.

So the live child session **is** reachable — through an undocumented field. Two consequences:

- **Live rendering is possible today**: `getRecord(id).session` is the real in-process
  `AgentSession`, so a host can `subscribe()` to it and stream the same events pi-web already
  streams for its own sub-agents (token-level deltas included).
- **Steering is possible while running**: that handle, or `AgentManager.steer()` (`:1319`,
  which queues when the session is not ready yet), both work mid-run. Neither is on the bus and
  neither is in `docs/rpc.md`'s registry table, so an adapter must feature-detect and degrade.

### 8. Type resolution depends on the user's config, and unknown types hard-error

With the user's `~/.pi/agent/subagents.json` (`disableDefaultAgents: true`,
`fallbackSubagent: "none"`), spawning the pi-subagents built-in `general-purpose` failed:

```
{"success":false,"error":"Unknown or disabled agent type: \"general-purpose\". Available:
 code-reviewer-2, code-reviewer, expert, finder, prospector, spec-reviewer-2,
 spec-reviewer, ui-designer, vision, worker-2, worker."}
```

Two consequences for the adapter: it must enumerate types from pi-subagents itself (not assume
`general-purpose`, which is what pi-web's own `Agent` tool defaults to), and it must render
error envelopes rather than treat a reply as success.

### 9. The `subagents:record` history entry lands — but only once the parent has run a turn

Stage 2 had a parent that never ran a turn: **no parent session file was written at all**, and
`subagents:record` existed nowhere in the temp tree. Stage 3 isolated the cause — a direct
`pi.appendEntry("spike:probe-entry", …)` from an inline extension also produced no file in a
turn-less session (`filesOnDisk: []`).

Stage 4 ran one parent turn first. The parent file then exists and carries the record:

```
parent  lines=6  [session, model_change, thinking_level_change, message, message, custom:subagents:record]
child   lines=8  [session, model_change, thinking_level_change, session_info, message, message, message, message]
        parentSession = <parent file>
```

So in a realistic session the adapter has **two** history sources: pi-web's own
`pi-web:subagent*` entries and pi-subagents' `subagents:record`. A parent that has not yet run
a turn writes nothing — which only matters for a freshly created session.

## Minimal adapter design

**Engine loading.** Load the package's factory as an inline extension next to pi-web's own
(replacing, not joining: two registrations of `Agent` collide — the SDK keeps the first per
name, `dist/core/agent-session.js` `_refreshToolRegistry`). Either add
`@tintinweb/pi-subagents` as a pinned pi-web dependency (peers resolve through the repo's
`node_modules`; this also fixes the version-drift problem) or use whatever version the user
enabled in pi's package settings. The `builtInEnabled` switch in
`~/.pi/agent/agents/settings.json` becomes "which engine", not "on/off".

**Availability.** Per session: after pi-web's existing `bindExtensions`, await
`subagents:ready` with a timeout (5s), cache it, invalidate on reload. No `ready` → hide the
sub-agent surface for that session. Never wait indefinitely.

**State.** One id-keyed map per parent session, seeded idempotently from three sources — the
RPC reply, the `Agent` tool result `details` (pi-web already sees tool calls and results in
its SSE stream), and `subagents:started` — and updated from
`steered`/`compacted`/`completed`/`failed`. Send `consume` synchronously in the `completed`
handler.

**UI.** Child sessions need no new discovery (finding 5). The tool-card renderer needs a
pi-subagents-shaped card (or a dual-read with the existing `pi-web-subagent` details).

**Actions.** `spawn`/`stop` over the bus. Steering is available mid-run through
`getRecord(id).session.steer()` or the manager's `steer()` (finding 7) — undocumented, so gate it
behind a feature check and keep the button disabled until the handle appears.

**Live view.** Attach to `record.session` after `started` (retry until present) and register that
instance with pi-web's own wrapper registry, so its SSE streams the real run. Never
`SessionManager.open()` the child's file while it is running: that is a second writer on the same
JSONL (finding 7 / the file is the post-run view, not the live one).

**Option translation.** The bus accepts pi-subagents' internal names, not the tool/frontmatter
spellings — `run_in_background` → `isBackground`, `max_turns` → `maxTurns`, `thinking` →
`thinkingLevel`, `inherit_context` → `inheritContext`, `isolation: "worktree"` unchanged;
`input_files` has no equivalent. Unknown keys are dropped silently, and `isolation: "worktree"`
is dropped silently when `worktreeIsolation` is off — no error either way.

**Nested sub-agents.** Keep pi-web's current "no nesting" behaviour. pi-subagents can nest
(`allowed_subagents`, `maxSubagentDepth: 2`), but nested runs are in-memory
(`persist_session` defaults false for nested) **and** emit no lifecycle events
(`isTopLevelAgent` guard), so they are invisible to any web UI by construction.

## The accepted costs

| Cost | Evidence |
|---|---|
| No `created` event for RPC spawns | `created` emitted only in the `Agent` tool's background branch and detached resume; the first event for an RPC spawn is `started` |
| No nested visibility | Nested runs: no events (`isTopLevelAgent`), no session file, `getRecord` filtered |
| Two relied-on fields are undocumented | `record.session` / `record.sessionFile` work (verified) but are absent from `docs/rpc.md`'s contract and are cleared after the run |

## Open items

- Behaviour when pi-subagents activates inside a *sub-agent* session (registry is claimed by
  the first activation in the process; in a long-lived Next.js server that is whichever
  session activated first, so no process-wide sub-agent list is available).
- Whether the `Agent` tool path (model-driven, not RPC) yields enough for the card without the
  RPC reply — pi-web would read it from the tool result `details` instead.
