# Pi-native composer + status bar

**Status:** draft — awaiting design decisions
**Date:** 2026-09-13
**Scope:** chat input area (`components/ChatInput.tsx`), a new status bar, the existing extension status shelf

## Goal

Make the chat input area mirror pi's native TUI. The composer keeps exactly two
affordances — an image/attach icon on the left and a send icon on the right — and
everything that used to be a toolbar button moves out of the input box. Below the
composer sits a **mono** status bar in pi's three-line footer style.

## Reference: pi's native footer (SDK 0.85.1)

Source: `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/footer.js`
(`FooterComponent`, bundled `.js` + `.js.map`; original TS `src/modes/interactive/components/footer.ts`).

```
~/code/gjuoun/pi-web (main) • 接入 pi-subagents 到 Web UI 可行性评估
↑1.2M ↓143k R18M CH99.3% $0.194 26.6%/1.0M (auto)      (ollama-cloud) deepseek-v4.1-flash • low
⏳30s · ⚡101 tok/s · ttft 4.5s
```

### Line 1 — cwd • session (`footer.js:100-111`, emitted `:207`)

- `formatCwdForFooter(cwd, HOME)` (`:31-42`): home prefix collapsed to `~`.
- ` (branch)` appended when `FooterDataProvider.getGitBranch()` is non-null
  (`"detached"` on detached HEAD).
- ` • <session name>` appended when `SessionManager.getSessionName()` is non-empty.
- Painted dim, truncated with a dim `...`.

### Line 2 left — usage stats (`footer.js:112-148`)

Join with a single space. Each counter is **omitted when zero**.

| Token | Source | Format |
|---|---|---|
| `↑n` | `usageTotals.input` | `` `↑${formatTokens(n)}` `` |
| `↓n` | `usageTotals.output` | `` `↓${formatTokens(n)}` `` |
| `Rn` | `usageTotals.cacheRead` | `` `R${formatTokens(n)}` `` |
| `Wn` | `usageTotals.cacheWrite` | `` `W${formatTokens(n)}` `` |
| `CHx.x%` | latest assistant `cacheRead / (input+cacheRead+cacheWrite) * 100` | `CH${rate.toFixed(1)}%`, only when cacheRead/cacheWrite > 0 |
| `$x.xxx` | `usageTotals.cost` | `$${cost.toFixed(3)}` + ` (sub)` when `modelRuntime.isUsingSubscription(provider)` |
| `x.x%/1.0M (auto)` | `session.getContextUsage()` | `${percent.toFixed(1)}%/${formatTokens(contextWindow)}` + ` (auto)` when auto-compaction is on; `?/1.0M` when `percent === null` (right after compaction). Never omitted. Colour: `>90` error, `>70` warning. |

`formatTokens` (`:20-30`) — the compact-number rule both lines rely on:

```js
if (count < 1000) return count.toString();
if (count < 10000) return `${(count / 1000).toFixed(1)}k`;      // 1.2k
if (count < 1000000) return `${Math.round(count / 1000)}k`;    // 143k
if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`; // 1.2M
return `${Math.round(count / 1000000)}M`;                      // 18M
```

Totals are recomputed from the session entries on every render — assistant messages,
tool results with usage, and compaction/branch-summary entries (`footer.js:78-93`).
`UsageTotals = { input, output, cacheRead, cacheWrite, cost }` (`core/usage-totals.d.ts:3-9`).

### Line 2 right — model (`footer.js:154-178`)

- `(${state.model.provider}) ${model.id}` — the provider prefix appears **only when more
  than one provider has available models** (`getAvailableProviderCount() > 1`) and the line fits.
- ` • ${thinkingLevel}` appended when `model.reasoning`; ` • thinking off` when the level is `off`.
- Right-aligned by space padding; `minPadding = 2`.

### Line 3 — extension statuses (`footer.js:209-218`)

**Not native.** No `ttft` / `tok/s` / `⏳` / `⚡` exists anywhere in the SDK. pi joins every
extension status string (sorted by key, single-space separated) into one dim line. The user's
status comes from `~/.pi/agent/extensions/tps-status` (`ctx.ui.setStatus("tps", …)`), whose
measurement model is the reference for any native port:

```
agent_start ──────────────────────────────────────────► agent_settled   ⏳ task timer, 1s tick
     └─ before_provider_request ──► first content ──► message_end
                    └──── TTFT ──────┘   └── generation ──┘   tok/s = usage.output / window
```

- TTFT = `before_provider_request` → first `message_update` whose `assistantMessageEvent.type !== "start"`.
- `tok/s` excludes TTFT; windows under `MIN_GEN_MS = 150` are skipped as noise.
- `⏳` spans the whole run (model + tools + waiting); freezes at `agent_settled`.
- Format: `⏳4m32s · ⚡58 tok/s · ttft 812ms`; each part omitted until measurable.

## pi-web today

- `components/ChatInput.tsx` (2714 lines) — composer box (`:2095-2243`) holds the textarea plus
  Steer/Follow-up or Send; a `!compact` toolbar (`:2254-2709`) holds attach-image, `ModelSelector`,
  thinking level, tool preset, compact, Stop, sound, mobile more/collapse. Nearly all styling is
  inline; the only class hook is `.chat-input-textarea`.
- Metrics already flow to `AppShell` (`renderSessionStatsButton` `:1508-1668`, `session-info-popover`
  `:2008-2070`) and per message (`MessageView` `:816-820`, `:1740-1754`). `ChatInput` receives
  **no** token/cost/context data.
- `autoCompactionEnabled` is delivered by `get_state` (`lib/rpc-manager.ts:695`) but never rendered.
- `tok/s` and `ttft` exist nowhere in pi-web.
- `components/ExtensionStatusBar.tsx` already renders extension statuses (ANSI-aware, mono 11px,
  `white-space: pre`, max-height `min(144px, 18dvh)`) below the composer (`ChatWindow.tsx:1336`) —
  i.e. tps-status' `⏳ … ⚡ … ttft …` line **already reaches pi-web** when that extension loads.
- Session name is not shown in the chat view at all; `session.branch` is available on `SessionInfo`
  but only rendered in the sidebar and the stats popover.

## Target design

| Surface | Content |
|---|---|
| Composer box | textarea + attach-image icon (left) + send icon (right); while streaming the right icon becomes stop (and steer/follow-up stay reachable) |
| Status bar (new, mono, dim) | line 1 `cwd (branch) • session name`; line 2 pi stats left + right-aligned `(provider) model • level`; line 3 extension statuses |
| Removed from composer | ModelSelector, thinking level, tool preset, compact, sound, mobile more/collapse controls |
| Kept as-is | slash-command / @-mention / history menus, banners (model error, image-modality, queued, retry, compaction), drag-drop overlay, image pipeline |

## Decisions (locked 2026-09-13)

1. **Status bar is the control surface.** When the composer is slimmed down, model/thinking/tools/
   compact/sound move to clickable segments in the status bar (sound → Settings → Chat), not to a
   `⋯` menu and not to new slash commands only.
2. **No native tok/s / ttft port.** Any extension may publish a status line; pi-web stays open and
   renders whatever arrives on line 3. It never synthesises `⏳` / `⚡` / `ttft` itself.
   (Consequence: line 3 simply does not exist when no extension publishes a status.)
3. **AppShell top bar untouched.** The stats button and `/session` popover stay; line 2 is a summary,
   the popover remains the detail view.
4. **The composer box and its toolbar stay as they are for now.** Slimming the input down to
   attach-image + send is deferred to `TODO.md`; this iteration only adds the status bar below it.

## Iteration split

**Iteration 1 (this change):** display-only `ChatStatusBar` under the composer — line 1, line 2, with
line 3 continuing to come from `ExtensionStatusBar`. No composer markup changes, no control moves,
so no control is duplicated yet.

**Iteration 2 (see `TODO.md`):** slim the composer to two icons, delete its toolbar, then land the
clickable control segments (`(provider) model • level`, tools preset, context→compact) in the status
bar and move the sound toggle into Settings → Chat.

### Known gaps carried by iteration 1

- No ` (sub)` suffix: pi appends it when the model runtime reports a subscription, and pi-web has no
  equivalent signal.
- Provider prefix uses the distinct-provider count of the client model list, a proxy for pi's
  `getAvailableProviderCount()`.
- `(auto)` comes from `autoCompactionEnabled`, which `get_state` already returns but the client had
  never consumed.

## Verification

- `node_modules/.bin/tsc --noEmit`, `npm run lint`, `npm test` (1022 tests today).
- Tests that constrain the composer and must be updated deliberately:
  `ChatInput.test.mjs` (compact composer = exactly 1 button; tool-preset/thinking titles),
  `ChatInput.mobile-thinking-menu.test.mjs`, `ChatAppearance.test.mjs` (exactly one
  `--chat-content-max-width` occurrence in ChatInput), `MobilePwaLayout.test.mjs` (textarea style
  order), `ExtensionStatusBar.test.mjs`, `e2e/chat-appearance.mjs` (`.chat-input-textarea`),
  `e2e/extension-dialog.mjs` (`Send` button by role).
- Visual check against the live dev server on `127.0.0.1:30141` (tmux `piweb`).
