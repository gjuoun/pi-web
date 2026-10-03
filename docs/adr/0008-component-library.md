# The component library: `/ui/lib`, named components, one palette

Status: accepted (2026-10-01). Partly supersedes ADR 0007 (the four-theme palette and the
`globals.css` layout described there). Plan: `~/.notebook/project/gjuoun/pi-web/plan/2026-10-01/ui-lib/plan.md`.
Tracks JW-161.

## Context

ADR 0007 moved the UI onto shadcn/ui, but nothing showed what the parts look like, `globals.css`
had grown to ~900 lines with app layout rules and four themes beside the shadcn variables, and the
"`components/ui/*` is pristine" rule pointed at a `scripts/ui-pristine.sh` that did not exist.

## Decisions

1. **`/ui/lib` is the library.** A static page rendering foundations, every native primitive and every
   named app component. It is kept complete by a test that globs `components/ui/` and
   `components/app/` and requires a `data-specimen` for each. It is public and reads no server data.
2. **Named components, derived by composition.** App code is built from `components/app/*`, which compose
   `components/ui/*` through public props, variants and role colours only. `scripts/ui-guard.mjs`
   enforces it in lint. A primitive's stock look being insufficient means a new `pi:`-marked variant,
   never an override.
3. **Native shadcn stays native.** `scripts/ui-pristine.sh` (run by `npm run ui:pristine` and CI) diffs
   every `components/ui/*.tsx` against `shadcn add <name> --view` of the pinned CLI. A file may differ
   only through marked variants named in `--allow`.
4. **`globals.css` has the native shape.** Only the raw shadcn variables in `:root` are edited. All other
   CSS moved to `app/app.css`, imported once from `globals.css` (Tailwind v4 only honours `@theme` in an
   imported file — probed, a file loaded separately from `layout.tsx` generates no utilities).
5. **One palette, no theme system.** *(Superseded by ADR 0009 the same day: the palette became the `default` theme and a dark theme was added.)* One set of raw variables (first GitHub Primer light, then the Color Hunt
   palette `13005A`/`00337C`/`1C82AD`/`03C988` the same day). The
   `light`/`dark`/`dracula`/`auto` themes, `useTheme`, `THEME_INIT_SCRIPT`, the picker and the View
   Transitions wipe were removed. `lib/code-themes.ts` keeps the same palette as literals for Prism,
   Mermaid and xterm, which cannot read CSS variables.

## Consequences

- The `dark:` utilities inside `components/ui/*` never match (no `.dark` class). That is inert, not
  broken, and keeps the primitives native.
- A future theme system is a new decision: it would swap the raw variables (goat-the-dashboard's
  `--jun-*` four-layer scheme is a worked example) and re-add a theme source for the three literal
  palettes.
- Adopting more screens into `components/app/*` (dialogs, session rows, pickers) and installing the
  shell primitives (`sidebar`, `tabs`, `resizable`, `sheet`, ...) are follow-up slices of JW-161.
- Known gap: the guard does not yet flag `*:data-[slot=…]` child selectors, which
  `components/app/settings-ui.tsx` (`ConfigFooter`) uses; it needs a variant or a prop.
