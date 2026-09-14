# Built-in sub-agent activation and extension coexistence

> **Superseded by 0006** (`docs/adr/0006-single-subagent-engine.md`). Pi Web no longer has a
> built-in engine or a `builtInEnabled` switch; the `pi-subagents` package is the only engine.
> Kept for the history of how the two engines coexisted.

Pi Web's integrated sub-agent implementation is an inline, hidden extension.
It is disabled by default and controlled by the global
`~/.pi/agent/agents/settings.json` setting `builtInEnabled`.

The inline extension factory remains installed in every ordinary resource loader (a subagent profile
that pins its own resources may opt out) so an AgentSession reload can enable or disable its tools
without recreating the wrapper. When disabled, the factory registers no tools. A runtime
guard also rejects stale `Agent` calls after the setting is turned off but before
the parent session is reloaded.

## The `pi-subagents` package is not suppressed

**Superseded decision.** Earlier, an enabled `pi-subagents` package was *deleted* from every Pi Web
session whenever the integrated extension registered `Agent`, so the integrated implementation won
the name by elimination. That is no longer the behaviour: the package pi loads from its package
entry (`packages` in `~/.pi/agent/settings.json`) is left in place, and both implementations run in
the same session.

The two engines are therefore expected to collide, and the SDK reports it: `Tool "Agent" conflicts
with <package path>`, plus the same for `get_subagent_result` and `steer_subagent`. Load order — not
preference — decides the winner, and packages load before inline extension factories, so:

- **with `builtInEnabled: true`**: the package owns `Agent`; the integrated extension's copy is the
  one reported as conflicting;
- **with `builtInEnabled: false`**: the package owns all four of its tools and nothing collides.

`suppressExpectedSubagentConflicts` drops exactly those three diagnostics — they describe a tool the
model can already reach through the winner, so surfacing them would only hand the user an error they
cannot act on. It removes no extension and no other error. A *duplicated* copy of the package stays
visible on purpose: it shows up as `Flag "--subagents-workflow-file" conflicts with …`, which is the
signal that one RPC request would be answered twice.

Unrelated extensions are never touched, including one that registers `Agent` for its own purposes.

## Availability is the user's configuration

Because Pi Web neither vendors nor pins a copy, the engine's presence is whatever
`~/.pi/agent/settings.json` enables. When the package is absent — or when a session is created with
extensions off (a subagent profile pinning `load_extensions: false`, or a chat-only session) — the
package emits no `subagents:ready` and answers no RPC. That state must be shown in the UI rather
than silently doing nothing.

Existing child sessions remain readable, and already-running children are not aborted when either
setting changes.
