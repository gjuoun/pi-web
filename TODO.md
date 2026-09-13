# TODO

## Chat composer → pi-native (iteration 2)

Spec: `docs/plan/2026-09-13/pi-native-composer-status-bar/spec.md`

- [ ] **Slim the composer box to two icons** — in `components/ChatInput.tsx` keep only the textarea,
      an attach-image icon (left) and a send icon (right); the right icon becomes stop while
      streaming. Steer / Follow-up move to keyboard only (`Enter` / `Alt+Enter`, shortcuts already
      wired) plus a mono hint inside the box.
- [ ] **Delete the composer toolbar** (`ChatInput.tsx:2254-2709`): attach-image button, `ModelSelector`,
      thinking level, tool preset, compact, Stop, sound, mobile more/collapse controls.
- [ ] **Land the control segments in the status bar** (decision 1 in the spec):
  - `(provider) model • level` segment opens the model / thinking pickers
  - a tools-preset segment
  - the context segment (`26.6%/1.0M (auto)`) triggers compaction, replacing the compact button
- [ ] **Move the sound toggle into Settings → Chat** as a `ConfigSwitch` (it currently only exists as
      a composer button via the `soundEnabled` / `onSoundToggle` props).
- [ ] **Update the tests that lock the old composer** — `ChatInput.test.mjs` (compact composer = exactly
      one button; tool-preset / thinking titles), `ChatInput.mobile-thinking-menu.test.mjs`,
      `ChatAppearance.test.mjs` (one `--chat-content-max-width` occurrence), `MobilePwaLayout.test.mjs`
      (textarea style order), `e2e/extension-dialog.mjs` (`Send` button by role).

## Status bar follow-ups

- [ ] Line 2 ` (sub)` suffix — needs a subscription signal for the active provider; none exists today.
- [ ] Replace the distinct-provider proxy with pi's `getAvailableProviderCount()` semantics if the
      models API ever exposes it.
- [ ] `ChatStatusBar` renders extension widgets above line 1 (they belong to `ExtensionStatusBar`), so
      the visual order is `line 1, line 2, widgets, line 3`. Revisit if the gap shows in practice.

## Dev-server staleness (found 2026-09-13)

- [ ] `components/PwaRegistration.tsx` returns early in development, so a service worker left behind by a
      production instance on the same origin keeps controlling the dev server — `public/sw.js` is
      cache-first for `/_next/static/*`, so the tab silently keeps running the old bundle (hit today:
      `npm start` on `127.0.0.1:30141` registered `sw.js?v=0.9.1`, then `npm run dev` reused the port).
      Fix: in development, unregister any existing registration, delete `pi-web-*` caches, and reload
      once only when the page was actually controlled by a worker.

## Repo hygiene

- [ ] `.spike-stage{0..3}.mjs` are untracked leftovers at the repo root — delete or move them under
      `docs/plan/2026-09-13/pi-subagents-adapter/`.
