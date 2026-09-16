# 0007 — ChatGPT-style session management: all projects visible, sessions as tabs

- **Status:** accepted
- **Date:** 2026-09-16
- **Supersedes:** the single-selected-project sidebar shipped since the beginning
- **Plan:** `~/.notebook/project/gjuoun/pi-web/plan/2026-09-16/all-projects-session-tabs/plan.md`

## Context

Pi Web grouped sessions under one **selected project**: the sidebar filtered the session list to that
project's key, and the project was chosen from a dropdown. Seeing another codebase's sessions therefore
required switching, and switching was destructive — `handleCwdChange` nulled the open session, cleared every
file tab and reset the branch tree, because file tabs are keyed by absolute path and the assumed model was
"project changed ⇒ workspace changed".

That model fights how the sessions are actually used: one person accumulates sessions across a dozen
repositories, and the question is usually "what was I doing", not "which directory am I in".

Reference products were surveyed before designing (`/jun research`): Claude Code's CLI, ChatGPT desktop,
OpenAI Codex and `herdr`. Two conclusions drove this change:

1. The products that keep **many projects visible at once** (ChatGPT, Codex) do so because switching is
   cheap for them; the cwd-bound CLIs instead default to narrow and offer an explicit widen gesture.
   Pi Web's switch was expensive *by accident*, not by design.
2. **A tab is a thing that is open right now; the sidebar is what exists.** ChatGPT keeps its tab strip to
   open chats and its sidebar to projects/pins/archive — that division is what this ADR adopts.

`herdr`'s pane/tab/workspace hierarchy was deliberately **not** adopted: its leaf is a live PTY with its own
lifecycle, while pi-web's leaf is a chat that already lives server-side, so a pane level would add a
container with nothing in it. Panes remain unimplemented; one chat is visible at a time.

## Decision

1. **The sidebar lists every project.** There is no selected project. Project headers are rows in one flat,
   virtualized list (`lib/session-list-rows.ts`), ordered by activity, with sessions that resolve to no root
   under `standalone`. Expansion is the only project-level state, it is explicit, and **every project is
   open by default** — hiding sessions behind a default is the behaviour being removed.
2. **A session tab is an open session.** `components/SessionTabs.tsx` renders one tab per open session, any
   project. Only the active tab's `ChatWindow` is mounted.
3. **Shortcuts are Option-based** (`Alt+1-9`, `Alt+W`, `Alt+[`/`Alt+]`). `Cmd+digit` and `Cmd+W` are owned
   by the browser and cannot be prevented, so binding them would ship a shortcut that works only in an
   installed app.
4. **One persisted payload, one writer.** Tabs, project expansion and pins live in `pi-web:ui-state`, owned
   by `lib/ui-state-store.ts`. Two components holding private copies would clobber each other's half.
5. **Opening a session is not destructive.** A project change no longer closes the chat, drops file tabs or
   resets branch state; the project picker only decides where the next session starts. The new-session
   composer keeps one draft per project (parked on leave, restored on return).
6. **The file Explorer is hidden behind `EXPLORER_ENABLED`** while the session list needs the vertical space.
   Code, `/api/files`, upload and `@`-mention insertion stay wired, and the terminal action it hosted moved
   to the sidebar header so hiding the panel removes no capability.

## Consequences

- The list is no longer uniform-height: any new row type must go through `rowLayout`/`visibleRowIndices`.
- `lib/ui-state-store.ts` is the only place that may call `saveUiState`; adding a second writer reintroduces
  the clobbering bug it exists to prevent.
- A background tab is not mounted, so returning to it re-reads the session from disk. Concurrent live chats
  are the deferred follow-up, not an accident of this design.
- Two existing tests asserted the old destructive contract (`hooks/useAgentSession.test.mjs`,
  `components/AppShell.workspace-memory.test.mjs`); both now assert the new one and name the browser probe
  (`~/.notebook/project/gjuoun/pi-web/plan/2026-09-16/all-projects-session-tabs/scripts/probe-ui.mjs`) as
  the authority for those flows.
- Verification for this area is behavioural: the probe boots an isolated instance with a seeded fixture and
  drives a real browser. Source-slice tests are kept for wiring, not for behaviour.

## Known gaps at the time of writing

- Pins and archive exist in the store but have no UI yet (no row menu).
- `draft-survives-project-switch`'s round-trip (leave a project and return) does not repopulate the new-session
  composer; the per-tab drafts and the leave-side parking are verified.
