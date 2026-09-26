# The UI system is shadcn/ui on Tailwind v4

Pi Web's UI moved from hand-rolled CSS (inline `style` attributes, two large legacy stylesheets
`app/globals.css` + `app/settings.css`, JS hover mutations, a scattering of custom classes and one
CSS module) onto `components/ui/*` (shadcn) composed with Tailwind utilities. This is a pure
restyle: behaviour, copy, i18n keys, API routes, server code and layout mechanics (resizable
sidebar/file panel, virtualised lists, scroll restoration, mobile slide-in, top-bar popover
positioning) are unchanged. Plan: `~/.notebook/project/gjuoun/pi-web/plan/2026-09-24/shadcn-ready/plan.md`.

Measured start (`style-audit.mjs` on main): 43 files, 5 clean, 635 static inline styles, 4,127
literal CSS properties, 684 legacy-token references, 88 JS hover mutations, 265 custom-class uses, 1
CSS module, 13 orphan CSS rules, `globals.css` 2,059 lines / 141 class rules, `settings.css` 1,348
lines / 124 class rules.

## Decision 1 — Radix + nova

`npx shadcn@4.21.0 init -t next -b radix -p nova --pointer -y`. Radix over Base UI (CLI 4.21's
default) because it is mature, ships as one `radix-ui` package, and its SSR behaviour (see Decision
6) was probe-verified before committing. `nova` is the compact style (`h-8` controls, `text-sm`),
matching this app's density. `--pointer` adds `cursor: pointer` on enabled buttons/`role="button"`
in the base layer, which the app already relied on via cursor defaults.

## Decision 2 — Tokens

shadcn's own colour contract is the single source of truth, extended with exactly two pairs:
`--success`/`--success-foreground` and `--warning`/`--warning-foreground`, registered in `@theme
inline` the same way every other shadcn colour is. Theme blocks are `:root` (light), `.dark`,
`:root[data-theme="github"]` and `:root[data-theme="dracula"]`; the last two use `(0,2,0)`
specificity so they win over both `:root` and `.dark`. The legacy `--accent` (brand blue) was
renamed to `--primary` *before* `shadcn init` ran (plan Step 4), because shadcn's own `--accent`
means "hover surface" — running init first would have silently recoloured the app. A temporary
alias block (`--bg` → `--background`, `--bg-panel` → `--sidebar`, `--bg-hover`/`--bg-selected` →
`--accent`, `--bg-subtle` → a `color-mix` on `--foreground`, `--text` → `--foreground`,
`--text-muted`/`--text-dim` → `--muted-foreground`, `--user-bg`/`--tool-bg` → `--muted`,
`--assistant-bg` → `--background`, `--primary-hover` → a `color-mix` on `--primary`) carried the app
through the conversion (Step 6 through Step 28) and was deleted in Step 29 once no `.tsx` file read
a legacy name directly.

## Decision 3 — Theme runtime

`hooks/useTheme.ts` keeps its `useSyncExternalStore` store, the View Transitions circular-wipe
animation, and the `auto` media-query listener; the app never adopted `next-themes`. The `data-theme`
attribute plus a `.dark` class remain the two hooks CSS reads. `THEME_OPTIONS` is
`light, dark, github, dracula, auto`; `isDarkTheme` is true for `dark` or `dracula` (so `.dark` and
`dark:` utilities also apply to Dracula). Previously stored `mist`, `rose` or `pine` values fall back
to `auto` through the existing `isThemePreference` guard — no migration code was needed.

## Decision 4 — Composition

`components/ui/*` is never hand-edited (Decision 5 covers the one sanctioned exception).
`components/SettingsUi.tsx` kept every export name and prop while its internals became shadcn
(`Button`, `Switch`, `Dialog`, `Label`, `Empty`, `Spinner`, …), so every consumer (`SettingsPanel`,
`ModelsConfig`, `SkillsConfig`, `PluginsConfig`) converted independently without touching call
sites. A shared app composition — `components/IconButton.tsx` (ghost icon `Button` + `Tooltip` +
`aria-label`) — was created once two or more call sites needed the same shape, not before. Generic
glyphs moved to `lucide-react` (`components.json`'s declared `iconLibrary`); custom marks (the π
glyph, provider logos, catppuccin file icons, `ThinkingIcon`) stayed literal.

## Decision 5 — Recipe: what "converted" means for a component

1. Interactive pieces become shadcn components, composed and never edited.
2. Static styles become utilities on tokens; dynamic values stay in `style` or pass through a CSS
   custom property (`style={{ "--w": … }}` with `w-(--w)`).
3. JS hover/focus mutations become `hover:`, `focus-visible:`, `aria-*:` or `data-[state=…]:`
   variants.
4. Semantic literal colours become tokens (`text-destructive`, `bg-success/15`, `text-warning`).
5. The component's own CSS rules leave `globals.css`/`settings.css` in the same step that converts
   it — never left "for later".
6. Hook classes used by tests or e2e become `data-slot="<same-name>"` (shadcn's own convention), and
   every selector that read the old class is updated in the same step.
7. The proof is `verify-step.sh`: style-audit clean on the step's files, zero new orphan CSS rules,
   gates, and a `drive-themes.mjs` snapshot across every theme and both widths.

If a step ever needs a new cva variant on a `components/ui/*` file, it is recorded here as
"`<component>`: `<variant>` — why" and passed to `ui-pristine.sh --allow <component>`. **None were
added by this migration** — every generated `components/ui/*` file is byte-for-byte the registry
output.

## Decision 6 — Test policy

Probe-verified before any component converted: under `renderToStaticMarkup` (this repo's jiti unit
tests), shadcn `Button` and `Switch` render with `data-slot`, and overlay *triggers* render with
`aria-expanded` — but Radix portal content (open `Dialog`, `DropdownMenu`, `Popover`, `Tooltip`)
never renders under SSR; a unit test that "opens" one of these sees nothing. Consequence: pure logic
stays unit-tested, but open-overlay behaviour (content, focus return, Escape, keyboard nav) is proven
only in Playwright (`e2e/*.mjs`, `drive-themes.mjs`). A source-text assertion that pins a CSS
declaration or a class name is replaced by an assertion on role, label, `data-slot`, `data-state` or
`aria-*` — never by an assertion on a Tailwind class string, which would just re-pin the same
fragility one layer down.

## Decision 7 — What stays custom

These keep their own mechanics after being restyled onto tokens and utilities, because a full
primitive swap either changes behaviour that must not change or could not be e2e-verified given the
harness's known flake (see Risks below):

- the composer rail and textarea (`ChatInput.tsx`)
- the chat scroll container and render-window logic (`ChatWindow.tsx`)
- the minimap (`ChatMinimap.tsx`)
- xterm (`TerminalPanel.tsx`)
- the `.markdown-body` element rules for react-markdown output — one `@layer components` scope,
  the only allowlisted class besides `catppuccin-file-icon`
- the Prism, KaTeX and Mermaid output (theme-mapped via `lib/code-themes.ts`, but not tokenised
  markup)
- catppuccin icon masks
- the view-transition wipe
- the PWA standalone rules (a `standalone:` custom variant, `@custom-variant standalone (@media
  (display-mode: standalone))`)
- the structural layout-shell classes in `AppShell.tsx` (`sidebar-container`, `sidebar-open`,
  `sidebar-closed`, `sidebar-resizing`, `sidebar-overlay-backdrop`, `panel-resize-handle`,
  `right-panel-container`, `right-panel-open`, `right-panel-closed`, `right-panel-resizing`,
  `right-panel-resize-handle`, `right-panel-overlay-backdrop`, `is-open`, `is-resizing`) — plain
  classNames rather than `data-slot`, passed to `style-audit.mjs --allow` rather than converted,
  because the sidebar/file-panel width animation and resize/overlay state machine is easiest to read
  and least risky to touch as compound selectors on stable class names
- `ExtensionDialog`/`ExtensionCustomPanel` and the quote-selection popover in `ChatWindow.tsx` —
  token/utility-styled but not swapped onto Radix `Dialog`/`Popover` roots, keeping their own Esc,
  collapse, countdown and keyboard-nav mechanics; a full swap could not be safely proven given the
  e2e harness's own pre-existing flake

## Known, accepted, non-blocking loose ends

- `e2e/run.mjs:314` ("Returning to older history must restore its reading offset" / a minimap-node
  Playwright locator timeout) is a pre-documented flake, confirmed to reproduce on an unmodified
  `main`, unrelated to any converted markup. It blocks the harness from reaching some later
  sequential checks (`checkModelPicker`, `checkExtensionDialogs`); those are exercised separately
  where possible, and this is a pass-with-known-caveat, not a regression.
- `DirectoryPicker` is unreachable in the running UI (the sidebar's `+ New` is
  `disabled={!selectedCwd}`, so its cold-start fallback never runs) — pre-existing, out of scope;
  proven instead through its extracted body component and unit tests.
- `npm run test:terminal` has a pre-existing timeout, confirmed by bisection to predate all
  conversion work.
- No `Collapsible` primitive exists in `components/ui/*`; the established disclosure pattern
  everywhere in this codebase is a plain `<button>` + `aria-expanded` + `data-slot`.
- No `info`/cyan token exists; anything that would have used one maps to `primary`.
