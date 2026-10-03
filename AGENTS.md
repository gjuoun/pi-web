# Pi Web - Development Notes

## Quick Start

```bash
npm run dev   # port 30141
```

Typecheck: `node_modules/.bin/tsc --noEmit`  
Lint: `npm run lint`  
**Never run `next build` during dev** — pollutes `.next/` and breaks `npm run dev`.

### Dev server troubleshooting

- Before starting a server, run `lsof -nP -iTCP:30141 -sTCP:LISTEN` and reuse the existing Pi Web process when it is healthy. A second `next dev` for the same checkout cannot use a different port as a workaround because both processes contend for `.next/dev/lock`.
- A browser-only `Module ... factory is not available` overlay usually means that tab has a stale Turbopack/HMR graph; it does not prove the server or source is broken. First call the browser's explicit reload action, then compare the current server log and a direct HTTP/API request.
- Restart only after the failure reproduces from a fresh page and the server-side checks also fail. Stop the exact dev process gracefully, move `.next` into a `mktemp -d` backup, and restart with the standard `npm run dev` command.
- Do not use `next dev --webpack` as a fallback. This repository's development graph can fail on `undici` imports such as `node:console`; development is expected to use Turbopack.
- Next.js may append a generated `BEGIN:nextjs-agent-rules` block to `AGENTS.md` when `next dev` starts. Treat that as generated tooling output, verify it with `git status`, and do not include it in an unrelated feature commit.

---

## Architecture

```
Browser                Next.js Server              AgentSession (in-process)
  │                        │                               │
  ├─ GET /api/sessions ────▶ reads ~/.pi/agent/sessions/   │
  ├─ GET /api/sessions/[id] reads .jsonl file directly     │
  ├─ GET /api/agent/running ───────▶ running id snapshot   │
  │                        │                               │
  ├─ send message ─────────▶ POST /api/agent/[id]          │
  │                        │   startRpcSession() ─────────▶│ createAgentSession()
  │                        │   session.send(cmd) ─────────▶│ session.prompt()
  │                        │                               │
  ├─ SSE connect ──────────▶ GET /api/agent/[id]/events    │
  │                        │   session.onEvent() ◀─────────│ session.subscribe()
  │◀── data: {...} ─────────│                               │
```

**Session browsing** (read-only): reads `.jsonl` files through SDK `SessionManager` helpers and `lib/session-reader.ts` — no AgentSession created.  
**Sending a message**: `startRpcSession()` in `lib/rpc-manager.ts` creates an AgentSession in-process.

---

## File Map

```
app/api/
  sessions/route.ts               GET  list all sessions
  sessions/[id]/route.ts          GET/PATCH/DELETE session
  sessions/[id]/context/route.ts  GET ?leafId= — context for a specific leaf
  sessions/[id]/export/route.ts   GET exported HTML for a session
  agent/new/route.ts              POST { cwd, message, provider?, modelId? }
  agent/[id]/route.ts             GET state | POST any command
  agent/[id]/events/route.ts      GET SSE stream
  agent/running/route.ts          GET currently-running session ids
  auth/api-key/[provider]/route.ts POST/DELETE provider API key storage
  auth/login/[provider]/route.ts  GET OAuth/device-code SSE | POST manual code
  auth/logout/[provider]/route.ts POST OAuth logout
  auth/providers/route.ts         GET OAuth and API-key provider lists
  cwd/validate/route.ts           POST validate/select a cwd
  default-cwd/route.ts            POST create ~/pi-cwd-YYYYMMDD
  files/[...path]/route.ts        GET file contents for viewer
  home/route.ts                   GET user home directory
  models/route.ts                 GET { models, modelList, defaultModel }
  models-config/route.ts          GET/PUT — read/write ~/.pi/agent/models.json
  models-config/catalog/route.ts  GET models.dev pricing presets
  models-config/discover/route.ts POST fetch a configured provider's upstream model list
  models-config/test/route.ts     POST test a configured model/provider
  plugins/route.ts                GET/POST package plugin management
  skills/route.ts                 GET/PATCH loaded skills and disable-model-invocation
  skills/install/route.ts         POST install skills through npx skills add
  skills/search/route.ts          GET/POST skills.sh search
  pi-subagents/runs/route.ts      GET runs of the pi-subagents engine for one session
  worktrees/route.ts              GET/POST/DELETE git worktrees

lib/
  agent-client.ts      typed fetch helper for /api/agent commands
  draft-store.ts       local draft persistence helpers
  file-access.ts       allowed file roots for /api/files and worktrees
  file-paths.ts        client/server path encoding helpers
  markdown.ts          shared markdown helpers
  npx.ts               npx runner used by skill install
  pi-types.ts          local structural types for pi SDK objects
  rpc-manager.ts      AgentSessionWrapper + registry + startRpcSession
  session-reader.ts   SessionManager wrappers + path cache + buildSessionContext adapter
  subagents.ts        reader for the pi-web:subagent* session markers
  pi-subagents-bridge.ts  observes the pi-subagents engine: runs, attach, marker stamping
  types.ts            shared TypeScript types
  normalize.ts        normalizeToolCalls() — field name mismatch between file format and our types
  worktree.ts         project/worktree resolution and git worktree operations

components/
  AppShell.tsx        layout + URL state + tab management
  SessionSidebar.tsx  session tree + FileExplorer
  ChatWindow.tsx      chat composition + completion sound wrapper
  ChatInput.tsx       input bar + model/thinking/tools/compact controls
  MessageView.tsx     renders one message (user/assistant/toolCall/toolResult)
  BranchNavigator.tsx in-session branch switcher
  ChatMinimap.tsx     scroll minimap alongside the message list
  AgentSessionPanel.tsx  the single Agents tab: session family + live pi-subagents runs
  MarkdownBody.tsx    markdown renderer
  ModelsConfig.tsx    modal for editing models.json (opened from sidebar bottom)
  PluginsConfig.tsx   modal for installed package plugins
  SkillsConfig.tsx    modal for loaded/search/installable skills
  FileExplorer.tsx    file tree inside sidebar
  FileIcons.tsx       file icon helpers
  FileViewer.tsx      file content in a tab
  TabBar.tsx          tab bar (Chat + open file tabs)
  app/                named app components — composed from components/ui:
    icon-button, settings-ui     shared pieces
    sidebar/ topbar/ chat/ settings/   stateless view replicas of the current UI (see "The app preview")
  ui/                 native shadcn primitives (pristine; see "UI system")

hooks/
  useAgentSession.ts  messages + streaming + SSE + fork/navigate/reconciliation logic
  useAudio.ts         completion sound + browser AudioContext unlock
  useTheme.ts         active theme (data-theme) + persisted setter + cross-tab sync
  useDragDrop.ts      shared drag/drop state
  useIsMobile.ts      responsive breakpoint hook
```

---

## Key Design Decisions & Traps

### AgentSession lifecycle (`lib/rpc-manager.ts`)
- One `AgentSessionWrapper` per session id, keyed in `globalThis.__piSessions`
- `globalThis` survives Next.js hot-reload; plain module-level Map does not
- Idle timeout: 10 minutes. Concurrent `startRpcSession()` calls share a single start Promise (`globalThis.__piStartLocks`)

### Fork must destroy the wrapper immediately
`AgentSession.fork()` **mutates the wrapper's inner state in-place** — after fork, `inner.sessionId` is the *new* session's id. If the wrapper stays alive in the registry under the old id, the next request gets the already-forked state and subsequent forks produce a corrupt `parentSession` chain.

**Fix**: `send("fork")` captures `newSessionId`, then calls `this.destroy()` before returning. The next request for the original session reloads a clean AgentSession from the original file.

### Two kinds of branching — don't confuse them
- **Fork** ("New session" on user message): creates a new independent `.jsonl` file. Shown as a child in the sidebar tree via `parentSession` header field.
- **In-session branch** ("Edit from here" / BranchNavigator): calls `navigate_tree` within the same file. Multiple entries share the same `parentId`. Switching between them calls `/api/sessions/[id]/context?leafId=`.

### Session files can be fully rewritten
`parentSession` in the header is **display metadata only** — has zero effect on chat content. Safe to `writeFileSync` the entire file (pi does this itself during migrations). Used when cascade-reparenting children on delete.

### ToolCall field normalization
Pi stores toolCall blocks as `{type:"toolCall", id, name, arguments}` but `ToolCallContent` uses `{toolCallId, toolName, input}`. `normalizeToolCalls()` in `lib/normalize.ts` handles this — called in both `session-reader.ts` (file load) and `handleAgentEvent` in `hooks/useAgentSession.ts` (streaming).

### Tool selection
Pi Web does not select tools. A normal session runs with Pi's own configuration (`defaultTools` in
`~/.pi/agent/settings.json`, else the SDK default `read, bash, edit, write`); `POST /api/agent/new`
takes no `toolNames`, and `POST /api/agent/[id]` rejects `set_tools` with HTTP 400. A subagent is the
exception: its profile pins the tool list, and `resourceSnapshot` in its `pi-web:subagent` metadata
keeps that policy for reopened sessions. `lib/chat-only.ts` and `lib/tool-presets.ts` no longer
exist; the read-only Tools panel still shows live tool state from `get_tools`. See
`docs/adr/0004-remove-tool-presets.md`.

### Model defaults for new sessions
`GET /api/models` returns `defaultModel` read from `~/.pi/agent/settings.json`. `ChatWindow` pre-selects this on mount for new sessions. Explicit browser model/thinking selections are applied atomically during AgentSession construction, then `lib/startup-preferences.ts` persists their effective values without replaying `set_model`/`set_thinking_level`; implicit `enabledModels` fallbacks and thinking pins are not persisted.

### `enabledModels` scoping
The `enabledModels` setting uses pi's `--models` syntax: minimatch globs against `provider/modelId` or a bare `modelId`, fuzzy matching for non-glob patterns, and an optional `:thinkingLevel` suffix. Never compare those patterns as literal strings — `lib/model-scope.ts` delegates to the SDK's `resolveModelScopeWithDiagnostics()` so pi-web and the TUI agree on the visible model list, and falls back to all available models when patterns resolve to nothing. `startRpcSession()` resolves that scope before creating an AgentSession and passes the selected initial model, thinking pin, and SDK-native `scopedModels` atomically; `GET /api/models` reuses the helper only for selector data, `thinkingLevelPins`, and `modelScopeWarnings` display.

### Event stream ownership
The selected session owns its SSE stream through **one** effect in `useAgentSession`: `acquire(sessionId)` on `AgentEventConnection` registers a holder and returns an idempotent `release` used as the cleanup. Acquire/release is refcounted, so React's StrictMode remount (acquire → release → acquire) is churn the manager absorbs, and the release grace window keeps the same `EventSource` alive across it.

No effect predicate may read a flag another effect owns. The connection used to be gated by a `shouldMaintain` that read `sessionHookMountedRef`, which a *later* effect set — in `next dev` the remount pass ran the connect effect while that flag was still `false`, so a sub-agent session opened from the Agents tab connected, closed, and never reconnected (prod was unaffected: effects run once). React does not specify effect/cleanup ordering and StrictMode's order differs from a real unmount, so ownership lives in the manager, never in a sibling ref.

`close(sessionId?)` is session-scoped: a late caller holding a stale id cannot drop the stream a newer session already opened. `EventSource.close()` is terminal, so switching sessions always constructs a new source. On `ChatWindow` mount, `GET /api/agent/[id]` still syncs `isStreaming`, `thinkingLevel` and `isCompacting`.

Verify with the plan probe, which must pass against **both** servers: `node ./scripts/probe-child-stream.mjs <baseUrl>` and `… --reload` (`~/.notebook/project/gjuoun/pi-web/plan/2026-09-14/dev-stream-parity/`).

### Compaction SSE events
Newer pi emits `compaction_start` / `compaction_end`; older versions emitted `auto_compaction_start` / `auto_compaction_end`. `handleAgentEvent` accepts both sets to keep `isCompacting` in sync. Manual compact is a blocking POST — the button stays disabled until the response returns.

### Running state polling + reconciliation
- The sidebar polls `/api/agent/running` every 2.5 seconds while the tab is visible and pauses polling in background tabs. The session-list response remains the initial fallback.
- `useAgentSession` treats per-session SSE as primary for chat events and opens it before each prompt. `prompt_done` completes the current UI stage and notification immediately, but the idle SSE stays open for a 30-second grace window and is reused by the next prompt. `agent_start` cancels that close timer; `agent_settled` finishes extension-injected runs that have no wrapper-level `prompt_done` and starts a fresh grace window. Do not close on the first `agent_end`: retries, compaction, and extension-queued messages can continue the same logical prompt.
- While a run is active, `useAgentSession` periodically calls `GET /api/agent/[id]` and also reconciles on `visibilitychange`/`online`. This fixes missed terminal events from background tabs or half-open connections.
- Prompt runs use a monotonic run id; late SSE or slow reconciliation responses from an old run must be ignored so they cannot resurrect stale streaming bubbles.

### Worktrees and project grouping
- `lib/worktree.ts` resolves linked worktree top-levels back to the main repo `projectRoot`; `listAllSessions()` attaches that to each `SessionInfo` so all worktrees for one repo are grouped together in the sidebar.
- Worktree operations are served by `/api/worktrees` and guarded by the same allowed-root rules as `/api/files`.
- New worktrees are created under `<repoRoot>-worktrees/<sanitized-branch>`. Existing branches are reused; otherwise `git worktree add -b` creates the branch.
- Removing a dirty worktree returns `409` with `{ dirty: true }` so the UI can ask before retrying with `force`.
- Sessions whose cwd points at a removed worktree are inferred back into the main project instead of becoming a phantom project row.
- git prints POSIX-style absolute paths even on Windows, so every path read out of git goes through `toNativePath()` (`lib/paths.ts`) before it is compared or returned. Compare paths with `samePath()`, never `===` — raw equality made `isTopLevel` permanently false on Windows and hid the worktree switcher entirely. Branch names are not paths and must keep their forward slashes. Browser code cannot apply Node path rules, so `/api/worktrees` resolves `currentWorktreePath` server-side; the sidebar must use that identity for highlighting and removal fallback.

### File access allow-list
- `/api/files` is intentionally not a general filesystem browser. Allowed roots come from session cwds, their resolved project roots, `~/pi-cwd-*`, and roots explicitly added with `allowFileRoot()`.
- `/api/cwd/validate`, `/api/default-cwd`, and `/api/worktrees` call `allowFileRoot()` when they make a new location browsable.
- Allowed roots are stored slash-normalized, but that is a Set-key convention, not a correctness requirement: `isPathWithinRoots()` (`lib/path-security.ts`, the single implementation behind `isFilePathAllowed()`) re-resolves and case-folds both sides, so either path form authorizes correctly. Keep that one implementation — it is the security boundary.

### Plugins and skills
- `/api/plugins` uses pi's `SettingsManager` + `DefaultPackageManager` for global/project package install, remove, update, enable, and disable. Disabling writes empty `extensions/skills/prompts/themes` arrays for that package entry.
- `/api/skills` uses `DefaultResourceLoader` so settings paths, package skills, and project `.agents/skills` are listed the same way the runtime sees them.
- Skill toggling edits only the `disable-model-invocation` frontmatter key on the target `SKILL.md`; keep that surgical so user formatting survives.
- `/api/skills/install` shells through `npx skills add ... --agent pi`; project installs run with the selected cwd.

### Sub-agents
- Pi Web runs no sub-agents of its own. The only engine is the `pi-subagents` package pi loads from its `packages` entry in `~/.pi/agent/settings.json`; Pi Web observes and displays it (`docs/adr/0006-single-subagent-engine.md`, superseding `0003`).
- Configuration is a machine concern: `~/.pi/agent/subagents.json` plus agent profile `.md` files under `~/.pi/agent/agents/` and project `.pi/agents/`. There is no UI for editing them — `Settings` has no Agents section, and `/api/subagents/*` no longer exists.
- `lib/pi-subagents-bridge.ts` subscribes to the package's bus, attaches the live child `AgentSession` to the wrapper registry (so `/api/agent/<child>/events` streams the real run), and stamps `pi-web:subagent`, `pi-web:subagent-status` and `pi-web:subagent-result` into the child's own session file with `engine: "pi-subagents"`. Never open a running child's file a second time.
- `lib/subagents.ts` only reads those markers back: `readSubagentRun` (session relations, sidebar family) and `readSubagentSessionResources` (reopening a child with the resource policy it ran under). Files written by the removed engine carry `engine: "pi-web"` or no engine field and still parse.
- Both session-list paths must report `relation.engine`: `lib/session-reader.ts` (file read) and `lib/rpc-manager.ts` (live in-process runtime). Dropping it in the live path makes a running child lose its engine label until it settles.
- One Agents tab (`components/AgentSessionPanel.tsx`) shows the family plus the live runs from `GET /api/pi-subagents/runs`; a run with no child session yet renders as a pending row. That feed is in-memory per process — after a restart, only the on-disk markers remain.
- A reopened child excludes `Agent`, `get_subagent_result`, `steer_subagent` and `SubagentWorkflow`, so children cannot nest.
- Deleting a session shuts down an attached child wrapper; a detached package run keeps going and is stopped through the package's own `subagents:rpc:stop`.

### Auth and model config
- `ModelsConfig` combines models from `~/.pi/agent/models.json` with provider auth status from pi's `AuthStorage`/`ModelRegistry`.
- Provider listing is capability-driven, never id-driven: `lib/provider-listing.ts` decides membership from `auth.apiKey.login` / `auth.oauth` plus the stored credential type, so dual-auth providers (anthropic and github-copilot today — which providers declare both changes between SDK releases, so never assume it from an id) appear exactly once and never fall through both lists (#309). `lib/provider-listing-runtime.ts` adapts `ModelRuntime` to those pure helpers.
- auth.json holds **one** credential per provider and `ModelRuntime.logout()` deletes whichever it is. The delete routes therefore use `removeStoredCredentialIfType()` to compare and delete under the same file lock used by pi's auth storage. `ModelsConfig` also refreshes *both* provider lists after any auth change — refreshing one leaves a dual-auth provider rendered twice.
- OAuth/device-code/manual-code flows are streamed by `GET /api/auth/login/[provider]`; manual code responses POST back with a short-lived token stored in `globalThis.__piLoginCallbacks`.
- API-key routes store and remove keys through `AuthStorage`. Status endpoints must never return the raw key.
- The model test route is `app/api/models-config/test/route.ts`; `app/api/models/test/` is not a real route.

### Completion sound
- `hooks/useAudio.ts` stores the toggle in `localStorage` as `pi-sound-enabled` and reuses one `AudioContext`.
- Browser autoplay policy means sound must be unlocked from a user gesture; `ChatInput` calls the unlock hook from interactive controls, and `ChatWindow` plays the tone from `onAgentEnd`.

### Exported session HTML
- `/api/sessions/[id]/export` delegates to pi's export helper, then patches recursive tree helpers in the generated HTML to iterative versions so very deep linear sessions do not overflow the browser call stack.

## Pi Session File Format

Location: `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`

```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path","parentSession":"/abs/path/to/parent.jsonl"}
{"type":"model_change","id":"<8hex>","parentId":null,"provider":"zenmux","modelId":"claude-sonnet-4-6","timestamp":"..."}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"user","content":"..."}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"assistant","content":[...],...}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"toolResult","toolCallId":"...","content":[...]}}
{"type":"compaction","id":"<8hex>","parentId":"<8hex>","summary":"...","firstKeptEntryId":"<8hex>","tokensBefore":N}
{"type":"session_info","id":"...","parentId":"...","name":"user-defined name"}
```

`entryIds[]` in `SessionContext` is a parallel array to `messages[]` — maps each displayed message back to its `.jsonl` entry id, used for fork and navigate_tree calls.

---

## UI system: shadcn/ui on Tailwind v4

The UI is `components.json` `style: radix-nova`, neutral base, CSS variables, `lucide-react` icons.
`lib/utils.ts` exports `cn()`. Every `.tsx` under `components/` and `app/` composes
`components/ui/*` and Tailwind utilities — no static inline styles, no legacy tokens, no JS
hover-style mutations, no ad hoc custom CSS classes, no CSS modules.

### The component library: `/ui/lib`

`app/ui/lib/page.tsx` is a static showcase of every UI part: foundations (colour tokens, radius, type),
every native primitive in `components/ui/*` with the variants its cva defines, and every named
component in `components/app/*`. It is the place to *see* a component before using it. It is public
(`proxy.ts` matches only `/`, `/login`, `/api/*`) and reads no server data — keep it that way, or add it
to the matcher.

It stays complete by construction: `app/ui/lib/page.test.mjs` fails when a file in `components/ui/` or
`components/app/**` (any depth) has no `data-specimen="ui-<name>"` / `data-specimen="app-<file stem>"` — a
component under `components/app/{sidebar,topbar,chat,settings}` may be shown on `/ui/preview` instead (the test
accepts either page; file stems are unique across folders). Adding a component
means adding its specimen in `app/ui/lib/_sections/`. Overlay primitives render their trigger closed
(`data-demo="<name>"`); `e2e/ui-lib.mjs` opens them.

### The app preview: `/ui/preview`

`app/ui/preview/page.tsx` renders the current UI as **stateless replicas** with demo data, so its look can be
discussed and changed without a running agent: the whole screen (a session with messages, a new session) as
1280 x 800 frames, then each region on its own — sidebar, top bar, chat messages, composer and status bar, the
timeline (the right-edge minimap) and the settings dialog. It follows the page's theme. It is public and
static like `/ui/lib`.

- **Where things live.** The views are in `components/app/{sidebar,topbar,chat,settings}/`; their prop shapes in
  `components/app/view-types.ts`; the demo data in `app/ui/preview/_fixtures/`. A view is props in, markup out:
  no hooks, no handlers, no `fetch`, no text field, no i18n hook (labels are English literals). The settings
  Models/Skills/Plugins views compose the real `Config*` kit, so they contain the kit's own buttons — the only
  buttons on the page.
- **They are replicas, not the real components.** They copy today's look by hand and will not follow later changes
  to `SessionSidebar`, `ChatInput`, `ChatMinimap` and friends until the real app consumes them. Compare with the
  real screens before trusting a difference.
- **Iterating.** Every `[data-shot]` element is a screenshot target. `ref-shots.mjs` (real app, needs a dev server)
  and `preview-shots.mjs` (`--theme default|broismypro`) in the plan's `scripts/`
  (`~/.notebook/project/gjuoun/pi-web/plan/2026-10-02/ui-preview/`) produce side-by-side PNGs.
- **Adding a view** means a stateless component in the right folder, a test written first (SSR with `jiti`, as the
  existing `*.test.mjs` do), a `Specimen name="app-<stem>"` in its `_sections/` file, and — if it needs a new data
  shape — a fixture. `ui-guard` scans `app/ui/preview`; the only inline `style` allowed is a node position in
  the timeline, waived with `// ui-guard-allow: <reason>`. `e2e/ui-preview.mjs` (`E2E_ONLY=ui-preview`) checks
  both themes in a browser.

### Named components: `components/app/*`

Everything the app shows is a named component. Screens import from `components/app/*`; those files
compose `components/ui/*` through a primitive's public surface only — props, variants, role colours
(`bg-primary`, `text-muted-foreground`), composition. `scripts/ui-guard.mjs` (part of `npm run lint`)
scans `components/app/` and `app/ui/lib/` and rejects the `!` important modifier, selectors into a
primitive's slots (`[&_[data-slot=…]]`), hard-coded colours, raw palette classes (`bg-blue-500`,
`bg-white`) and static `style={{…}}` (waive with `// ui-guard-allow: <reason>`). If a primitive's stock
look is not enough, that is a new variant on the primitive (below), not an override. Files are
kebab-case like `components/ui/*`; `SettingsUi` (`Config*`) and `IconButton` are the first two.

### `app/globals.css` keeps the native shadcn + Tailwind shape

`globals.css` is exactly: the Tailwind/`tw-animate-css`/`shadcn/tailwind.css` imports, one
`@import "./app.css"`, `@custom-variant dark`, `:root` with the raw shadcn variables, the native
`@theme inline` colour/radius mappings, and the native `@layer base`. Theming is done by editing the
raw variables in `:root` and nothing else. Everything that is not native — `--success`/`--warning` and
their mappings, `--font-ui`/`--font-mono` and `--font-sans`, `--chat-*`, the z-index scale, keyframes,
panel/sidebar layout, scrollbars — lives in `app/app.css`. (Tailwind v4 only sees `@theme` inside a file
pulled in by `@import`, which is why `app.css` is imported rather than loaded from `layout.tsx`.)
`app/globals.test.mjs` enforces the shape.

Raw variables (`:root` may set these and nothing else):

```
--background --foreground
--card --card-foreground
--popover --popover-foreground
--primary --primary-foreground
--secondary --secondary-foreground
--muted --muted-foreground
--accent --accent-foreground
--destructive
--border --input --ring
--radius
--sidebar --sidebar-foreground --sidebar-primary --sidebar-primary-foreground
--sidebar-accent --sidebar-accent-foreground --sidebar-border --sidebar-ring
--chart-1 … --chart-5
```

`--success`/`--warning` (+ `-foreground`) are the app's own extension and live in `app.css`. `--success` is
a darker derivation of the palette green (`#04855c`): the raw `#03C988` is 2.2:1 on white, too light for
the `text-success` uses (diff additions, git status).
`--font-ui` / `--font-mono` and `FONT_INIT_SCRIPT` stay the app's own font system; shadcn's Geist
import was removed at init time and never comes back.

### Themes

Two themes: `default` (the Color Hunt set `#13005A` / `#00337C` / `#1C82AD` / `#03C988` — deep indigo
text, navy primary, teal ring, green as `--chart-3`; the `:root` values) and `broismypro`, its dark
counterpart. `lib/themes.ts` is the registry (`THEMES`, `THEME_INIT_SCRIPT`, `applyTheme`). A theme is
one block of the raw shadcn variables in `globals.css`: `:root, [data-theme="default"]` and
`[data-theme="broismypro"]`, selected by `data-theme` alone (so a scope can nest) and ordered after
`:root`. A dark theme also carries the `dark` class on `<html>`, set with the attribute, which is what
turns on the `dark:` utilities inside `components/ui/*` — `@custom-variant dark` stays the native line.
The theme is chosen in Settings → General → Appearance (`hooks/useTheme.ts`, persisted as `pi-theme`),
and applied before first paint by an inline script in `app/layout.tsx`, ahead of `FONT_INIT_SCRIPT`.

A new theme is: a block of **every** raw variable in `globals.css` (`app/globals.test.mjs` fails on a
missing or extra one, and on a registry id without a block), the app's own `--success`/`--warning`
colours in `app.css`, an entry in `THEMES`, Prism/Mermaid/xterm values in `lib/code-themes.ts` (they
cannot read CSS variables; `lib/code-themes.test.mjs` loops over the registry), a label key in each
locale, and a scope in `/ui/lib` (rendered automatically from the registry). Check contrast with the
plan's `scripts/contrast.mjs`. Never edit a `components/ui/*` file for a theme. Decision record:
`docs/adr/0009-themes-default-and-broismypro.md`.

### `components/ui/*` is pristine

Never hand-edit a file under `components/ui/`. The only sanctioned change is adding a cva variant,
marked with a `pi:` comment on every changed hunk and passed to `scripts/ui-pristine.sh --allow
<file.tsx>`. `npm run ui:pristine` (also in CI) compares each file with what the pinned shadcn CLI
generates (`shadcn add <name> --view`, read-only); anything else it flags is an illegal edit — revert
it and compose instead. None exist as of this writing.

### Portaled overlays and the z-index scale

Radix portals put menu/popover/select/tooltip content under `<body>`, where the `z-50` shipped in
`components/ui/*` loses to the sidebar (`--z-sidebar`, 200) — the session row's "More actions" menu
once opened invisibly (JW-159). `app/app.css` documents the app's z-index layers and lifts those
primitives to `--z-popover` by `data-slot`; a new portaled primitive must be added to that list.
`e2e/overlay-stacking.mjs` (and `e2e/ui-lib.mjs` for every primitive) proves it with `elementFromPoint` (state/DOM assertions cannot see paint
order, and a modal menu's `pointer-events: none` hides the sidebar from hit testing unless restored).

### Test policy: SSR can't see an open overlay

`renderToStaticMarkup` (this repo's jiti-based unit tests) renders shadcn `Button`/`Switch` with
`data-slot`, and an overlay's *trigger* with `aria-expanded` — but Radix portal content (`Dialog`,
`DropdownMenu`, `Popover`, `Tooltip`) is **never present** under SSR; an open dialog probed in a unit
test comes back empty. So:

- Pure logic (helpers, reducers, derived state) stays unit-tested as always.
- Open-overlay behaviour (content, focus return, Escape, keyboard nav) is proven in `e2e/*.mjs` or
  the plan's drive scripts, never in a unit test that renders a closed overlay and calls it proof.
- Assertions pin roles, labels, `data-slot`, `data-state` and `aria-*` — never a Tailwind class string.

### `data-slot` is the hook-class convention

When a test or an `e2e/*.mjs` script needs a stable selector, the target element carries
`data-slot="<name>"` (shadcn's own convention — every shadcn primitive already does this). Do not
reintroduce a bare hook class (`.chat-status-bar`, `.chat-input-textarea`, …) for this purpose; those
were all migrated to `data-slot` and the corresponding selectors updated in the same commit that
moved them. A handful of structural layout-shell classes (`sidebar-container`, `right-panel-container`,
`panel-resize-handle`, …) are a deliberate, recorded exception — see `docs/adr/0007-shadcn-ui-system.md`.

**Trap:** don't reintroduce inline `style={{...}}` for anything that isn't runtime geometry, and don't
add a new legacy token or ad hoc CSS class "just this once" — every one of those was removed for a
reason (`docs/adr/0007-shadcn-ui-system.md` and the plan at
`~/.notebook/project/gjuoun/pi-web/plan/2026-09-24/shadcn-ready/plan.md` record why). If a component
needs something `components/ui/*` doesn't offer yet, `npx shadcn@4.21.0 add <name>` it — restyling the
registry output is not part of the workflow.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
