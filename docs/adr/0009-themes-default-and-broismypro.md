# Themes: `default` and `broismypro`, as blocks of the raw shadcn variables

Status: accepted (2026-10-01). Supersedes decision 5 of ADR 0008 ("one palette, no theme system").
Plan: `~/.notebook/project/gjuoun/pi-web/plan/2026-10-01/ui-lib-theme/plan.md`. Tracks JW-161.

## Context

ADR 0008 left pi-web with one hard-coded palette and no theme machinery. A dark counterpart was
wanted, and goat-the-dashboard (`apps/dashboard`, merged 2026-09-25) already has a worked theme
system: a registry, `data-theme`, a pre-paint script, a dark block per theme, a guard that checks
every theme restates every variable, and a showcase section that renders each theme side by side.

## Decisions

1. **Two themes.** `default` is the existing Color Hunt palette, unchanged (still the `:root` values).
   `broismypro` is a dark theme: deep-indigo canvas, light text, a lightened teal-blue primary.
2. **A theme is a block of the raw shadcn variables.** There is no `--theme-*` bridge, optional keys or
   reset file as in goat — shadcn's variables have no optional keys, and `globals.css` keeps its native
   shape. The default block is `:root, [data-theme="default"]`; others are `[data-theme="<id>"]` and
   come after it. `app/globals.test.mjs` enforces the shape, the order, and that the registry
   (`lib/themes.ts`) and the CSS agree.
3. **Dark is a theme, not a second axis.** There is no separate light/dark mode, no "system"
   preference. A dark theme also gets the `dark` class on `<html>`, so the `dark:` utilities already in
   `components/ui/*` apply and `@custom-variant dark` stays native. `components/ui/*` was not touched
   (`scripts/ui-pristine.sh`).
4. **Values for the places that cannot read CSS variables** (Prism, Mermaid, xterm) live in
   `lib/code-themes.ts`, one entry per registry theme, enforced by a test over the registry.
5. **Selection** is `hooks/useTheme.ts` (`pi-theme` in `localStorage`, cross-tab sync) plus an inline
   pre-paint script, with a two-option control in Settings → General → Appearance.

## Consequences

- `/ui/lib` has a Themes section that renders the same sample once per registry theme in its own scope.
- Adding a theme is a registry entry, a full variable block, code-theme literals and locale labels; the
  tests fail on any omission.
- The static `themeColor` in `app/layout.tsx` stays white, so mobile browser chrome does not follow the
  dark theme. A follow-up can update the meta tag from `useTheme`.
- Prism's two styles mix `background`/`backgroundColor`, so highlighters remount on a theme change.
