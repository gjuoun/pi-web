/**
 * Temporary build-time switches.
 *
 * These are not user settings — they exist so a surface can be taken out of the layout without
 * deleting it. Flip a flag back to `true` to restore the surface; anything gated here must keep
 * compiling and keep its own tests green while it is off.
 */

/**
 * The sidebar's file Explorer panel (`components/FileExplorer.tsx`, open-state in
 * `lib/file-explorer-state.ts`).
 *
 * Off while the all-projects sidebar and session tabs land: the panel competes with the session list
 * for the sidebar's vertical space, and its toggle is the only entry point we want to hide. The
 * component, `/api/files`, upload, refresh keys and `@`-mention insertion stay wired, and the
 * terminal action that used to live in the panel's header moves to the sidebar header so hiding the
 * panel does not remove the only way to open a terminal.
 */
export const EXPLORER_ENABLED = false;
