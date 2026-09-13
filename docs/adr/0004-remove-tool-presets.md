# Remove the pi-web tool-selection feature

**Supersedes ADR 0002 (chat-only tool selection).** That ADR described a pi-web-invented layer over
Pi's raw tool allowlist: four named presets (`none` / `read-only` / `default` / `full`), the
`chat-only` UI label, a `pi-web:tool-selection` custom entry per session, and a "Chat only" resource
policy for the empty selection. All of it is removed; this ADR records what replaced it and which
half of 0002 is still load-bearing.

## Decision

A session's tools are whatever Pi decides. Pi Web no longer passes a `tools` allowlist for normal
sessions, no longer persists a selection, and no longer exposes a control for it.

- Pi's own levers carry the semantics: `defaultTools` in `~/.pi/agent/settings.json` (else the SDK
  default `read, bash, edit, write`), plus `--tools` / `--exclude-tools` for a CLI launch.
- `POST /api/agent/new` takes no `toolNames`; `POST /api/agent/[id]` answers `set_tools` with HTTP
  400 `Unsupported command: set_tools` so a stale client fails loudly instead of silently.
- The status bar shows the model and reasoning segments only.
- `lib/tool-presets.ts`, `lib/session-tool-selection.ts`, `lib/tool-preset-preference.ts` and
  `lib/chat-only.ts` are gone, together with their tests; `ToolEntry` moved to `lib/types.ts`.

## What survives from ADR 0002

A subagent is still **resource-isolated by its profile**, and that is a different feature:

- `resourceSnapshot` (in the `pi-web:subagent` metadata) is the only persisted tool policy left. It
  pins the profile's active tools plus the profile's skill/extension loading switches so a reopened
  subagent session keeps the same policy.
- `AgentSessionWrapper.chatOnly` / `isChatOnly()` survive with subagent-only meaning: a profile with
  no tools and neither extensions nor skills skips the extension bind
  (`registerRpcWrapper`), gets the reduced resource-loader options, and uses its profile prompt as
  the exact system prompt.
- The `exactSystemPrompt` machinery (including its re-application after SDK preflight and after a
  reload) is unchanged; it serves `prompt_mode: replace` profiles as well as tool-free ones.

## Accepted consequences

- **Existing selections become inert.** `{"type":"custom","customType":"pi-web:tool-selection",…}`
  entries stay in old `.jsonl` files, are never read again, and are not rewritten or migrated.
  `localStorage["pi-tool-preset"]` is likewise orphaned.
- **Sessions widen.** A session that was Chat only now loads extensions, skills, prompt templates,
  themes, Pi's base prompt and Pi's default tools — `bash`, `edit` and `write` become callable. A
  `read-only` session widens the same way; a `default` session gains `grep`/`find`/`ls`.
- **Trust and theme gates now apply to those sessions.** The former Chat-only skips for
  `initTheme()` and `projectTrustReloadOptions()` are gone from the normal-session path.
- **No in-app tool picker exists.** Pi's `defaultTools` setting (or a future Pi-native surface) is
  the only lever; running the `pi` CLI with `--tools` is still the precise way to scope a launch.

## Notes for the subagent path

Built-in `explore` and `plan` profiles seed their read-only tool list from a literal
(`["read", "grep", "find", "ls"]`) instead of the removed `PRESET_READ_ONLY`.
