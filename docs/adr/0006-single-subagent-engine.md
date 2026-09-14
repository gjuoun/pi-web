# One sub-agent engine: the `pi-subagents` package

Pi Web has no sub-agent runtime of its own. The only engine is the `pi-subagents` package that pi
loads from its `packages` entry in `~/.pi/agent/settings.json` (this checkout is wired to the fork at
`/Users/junguo/code/gjuoun/pi-subagents`). Pi Web's role is to **observe** it and **display** it.

Supersedes `docs/adr/0003-built-in-subagent-toggle.md`, which described two coexisting engines and a
`builtInEnabled` switch that chose between them.

## What was removed

- `lib/subagent-extension.ts` (the inline `Agent` / `get_subagent_result` / `steer_subagent` tools),
  `lib/subagent-runtime.ts` (the child-session runner), `lib/subagent-queue.ts`,
  `lib/subagent-input.ts`, `lib/subagent-prompt.ts`, `lib/subagent-profile-precedence.ts`.
- `lib/subagent-settings.ts` and everything it configured: `builtInEnabled`, `maxConcurrent`, and
  `~/.pi/agent/agents/settings.json` as a Pi Web-owned file.
- The whole `app/api/subagents/` route tree — profile CRUD, the settings switch, and get/steer/abort
  on the deleted controller.
- `components/AgentsConfig.tsx` and the `Settings → Agents` section.
- `components/PiSubagentsRunsPanel.tsx`, the second top-bar Agents tab, and the built-in engine's
  `pi-web-subagent` tool card in `components/MessageView.tsx`.
- `suppressExpectedSubagentConflicts`: with no host `Agent` tool there is no name conflict to
  suppress, so the SDK's diagnostics are again reported as-is.

## What remains

- `lib/pi-subagents-bridge.ts` — subscribes to the package's event bus, attaches the live child
  `AgentSession` to Pi Web's wrapper registry (so SSE serves the real run), and stamps the
  `pi-web:subagent`, `pi-web:subagent-status` and `pi-web:subagent-result` markers into the child's
  own session file with `engine: "pi-subagents"`.
- `lib/subagents.ts` — reduced to the reader for those markers: `readSubagentRun` (sidebar family and
  session relations) and `readSubagentSessionResources` (reopening a child under the resource policy
  it ran with).
- `spawn_subagent` on `POST /api/agent/[id]` and `GET /api/pi-subagents/runs?sessionId=`.
- One Agents tab: `components/AgentSessionPanel.tsx`, fed by both the session family (what is on
  disk) and the runs feed (what the engine is doing now). A run with a child session enriches that
  row with status, tool uses, tokens and cost; a run the bridge has not attached yet renders as a
  pending, unselectable row.

## Configuration

Sub-agent configuration is a machine concern, exactly as upstream `tintinweb/pi-subagents` defines
it: `~/.pi/agent/subagents.json` plus agent profile `.md` files under `~/.pi/agent/agents/` and
project `.pi/agents/`. Pi Web neither reads nor writes them, and offers no UI for editing them.

## Consequences accepted

- **No in-app profile editing.** Creating, editing, enabling and deleting profiles happens in the
  files. A profile change takes effect for sessions created after it, because `packages` and profiles
  are resolved per session.
- **Deleting a session no longer aborts a detached run.** `abortSubagent` belonged to the removed
  controller; `getRpcSession(id)?.shutdown()` still stops a child that is attached to a Pi Web
  wrapper. Stopping a detached run is the package's own `subagents:rpc:stop`, not Pi Web's job.
- **A child still cannot nest.** A reopened sub-agent session excludes `Agent`,
  `get_subagent_result`, `steer_subagent` *and* `SubagentWorkflow` — the package's fourth tool, which
  the old three-name exclusion missed.
- **Sessions written by the old engine still render.** Their markers carry `engine: "pi-web"` or no
  engine field at all; the reader keeps handling both.
