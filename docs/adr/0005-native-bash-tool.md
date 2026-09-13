# Use Pi's built-in bash tool as-is

**Supersedes ADR 0001 (isolate project command environments).**

Pi Web registered a tool named `bash` through an inline extension, spreading Pi's own bash
definition and replacing only `execute`, so project shells ran with a sanitized environment
(`PORT`, `NODE_ENV`, `NEXT_*` removed). That override is removed. A session's bash tool — and the
`!` user shell — now run through Pi's built-in implementation exactly as the `pi` CLI does.

## Decision

- No extension registers `bash`. `.pi/extensions`, packages and the user's own extensions are the
  only sources of tools beyond Pi's built-ins.
- `POST /api/agent/[id] { type: "bash" }` calls `executeBash(command, undefined, { excludeFromContext })`
  with no custom `operations`.
- `lib/project-command-env.ts` and its tests are deleted.

## Why

The override existed for one reason — the web host is a Next.js server, and its environment should
not leak into project shells. Staying native is worth more than that guard:

- It made Pi Web's tool surface differ from the `pi` CLI's. An extension-registered tool is
  activated by the SDK regardless of `defaultTools`, so a session had `bash` even when Pi's
  configuration left it out; keeping the two in step required an extra correction after session
  creation.
- It needed `preferUserBashExtension` to step aside when a user extension also provided `bash`,
  including suppression of Pi's tool-conflict diagnostic.
- Pi already honors `shellPath` and `shellCommandPrefix` from `settings.json` natively
  (`dist/core/agent-session.js` builds the built-in bash definition with both), so the override was
  never about shell configuration.

## Accepted consequences

- **Agent shell commands inherit the web host environment.** In `next dev` that includes
  `NODE_ENV=development` (production under `next start`), plus `PORT`/`NEXT_*` when the server was
  started with them. A project command that reads those sees the server's values, not the shell you
  launched the server from. This matches how any process started by the web host behaves; it is the
  price of using Pi's tool unchanged.
- **A user extension that registers `bash` wins** by Pi's documented built-in-override rule; Pi Web
  no longer arbitrates that.
- Subagent resource isolation is unaffected: `excludeTools`, the profile `tools` allowlist and
  `resourceSnapshot` are unchanged.
