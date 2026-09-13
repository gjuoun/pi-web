# TODO

## Done — chat composer → pi-native

Spec: `docs/plan/2026-09-13/pi-native-composer-status-bar/spec.md`

- [x] Composer slimmed to two icons: attach image (left) + send (right), the right slot becoming
      stop while the agent runs and stop-compaction while a compaction runs.
- [x] Composer toolbar deleted (model selector, thinking level, tool preset, compact, sound, mobile
      more/collapse controls).
- [x] Model / reasoning / tools are now clickable status-bar segments, disabled (not hidden) while
      the agent runs. The context segment stays display-only.
- [x] Queueing follows pi: Enter → steering queue, Alt+Enter → follow-up queue, Esc → abort. The
      composer shows a one-line mono hint instead of the two buttons.
- [x] Completion sound moved to Settings → General → Chat.
- [x] Tests migrated: `ChatInput.test.mjs`, `ChatStatusBar.test.mjs`, `AgentsConfig.test.mjs`,
      `SettingsPanel.test.mjs`; `ChatInput.mobile-thinking-menu.test.mjs` replaced by status-bar
      menu/CSS assertions.
- [x] Segment menus close on `Escape` (`StatusMenu` had outside-click only, so the reasoning and
      tools menus could not be dismissed from the keyboard — the model selector already could).
- [x] Browser acceptance re-run on the final tree: `[attach] textarea [send]`, streaming swaps the
      right icon for `Stop agent` and disables (not hides) all three segments, `reply = ok`, no
      console errors. `tsc --noEmit` / `npm run lint` / `npm test` = 0 / 0 / 1036 pass.

## Status bar follow-ups

- [ ] Line 2 ` (sub)` suffix — needs a subscription signal for the active provider; none exists today.
- [ ] Replace the distinct-provider proxy with pi's `getAvailableProviderCount()` semantics if the
      models API ever exposes it.
- [ ] Extension widgets render between line 2 and line 3 (they belong to `ExtensionStatusBar`), so the
      visual order is `line 1, line 2, widgets, line 3`. Revisit if the gap shows in practice.

## Dev-server staleness (found 2026-09-13)

- [ ] `components/PwaRegistration.tsx` returns early in development, so a service worker left behind by a
      production instance on the same origin keeps controlling the dev server — `public/sw.js` is
      cache-first for `/_next/static/*`, so the tab silently keeps running the old bundle (hit today:
      `npm start` on `127.0.0.1:30141` registered `sw.js?v=0.9.1`, then `npm run dev` reused the port).
      Fix: in development, unregister any existing registration, delete `pi-web-*` caches, and reload
      once only when the page was actually controlled by a worker.
