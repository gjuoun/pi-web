"use client";

import { useEffect } from "react";

// ---------------------------------------------------------------------------
// "/" — focus the composer
// ---------------------------------------------------------------------------

/**
 * The elements that own the keyboard while they have it: anything the user types into, and any
 * dialog. A bare `/` must never pull the caret out of either.
 */
export const COMPOSER_FOCUS_BLOCKERS = "input, textarea, [contenteditable='true'], [role='dialog']";

/** The slice of a KeyboardEvent this decision needs, kept structural so it tests without a DOM. */
export interface ComposerFocusKeyEvent {
  key: string;
  repeat: boolean;
  isComposing?: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

/**
 * Whether this keydown should move the caret into the composer.
 *
 * `/` is the web's convention for "put my cursor in the box" (GitHub, Slack, Discord, Linear). It is
 * the first BARE key this app has bound, so the guards are the whole story: never while the user is
 * typing, never from inside a dialog, never on a held key or mid-IME, and never with a modifier —
 * Ctrl+K in particular is reserved for search-everything.
 *
 * Shift is deliberately NOT rejected: `key` is the resolved character, so a layout that needs Shift
 * to produce "/" still works, while Shift+/ ("?") fails the key check above and types normally.
 */
export function isComposerFocusKey(event: ComposerFocusKeyEvent, target?: unknown): boolean {
  if (event.repeat || event.isComposing) return false;
  if (event.key !== "/") return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  // Duck-typed rather than `instanceof Element`, so the rule stays testable without a DOM.
  const closest = (target as { closest?: unknown } | null | undefined)?.closest;
  if (typeof closest === "function" && closest.call(target, COMPOSER_FOCUS_BLOCKERS)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Module-level registry — ChatWindow registers the abort handler here so that
// the global Esc listener in AppShell can call it without prop-drilling.
// ---------------------------------------------------------------------------
let globalAbortHandler: (() => void) | null = null;

/**
 * Register (or clear) the abort handler for the global Esc shortcut.
 * Call this from ChatWindow whenever agentRunning or handleAbort changes.
 */
export function registerAbortHandler(handler: (() => void) | null): void {
  globalAbortHandler = handler;
}

// ---------------------------------------------------------------------------
// Hook: global keyboard shortcuts
// ---------------------------------------------------------------------------

interface UseGlobalKeyboardShortcutsOptions {
  /** Called when Ctrl+Alt+N is pressed. Receives current cwd. */
  onNewSession?: (cwd: string) => void;
  /** The currently selected project directory (sidebar cwd). */
  activeCwd?: string | null;
}

/**
 * Register global keyboard shortcuts for the application.
 *
 * Shortcuts handled here:
 *   Esc          – stop the running agent (via module-level abort handler)
 *   Ctrl+Alt+N   – create a new session in the active project directory
 *
 * Note: Esc inside <textarea> or <input> is deliberately NOT handled here.
 * ChatInput manages its own Esc logic (closing slash / @ file menus, stopping
 * the agent when no menu is open) because it needs intimate knowledge of menu
 * state that is local to that component.
 */
export function useGlobalKeyboardShortcuts(
  options: UseGlobalKeyboardShortcutsOptions,
): void {
  const { onNewSession, activeCwd } = options;

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // ---- Esc: stop agent ----
      if (e.key === "Escape") {
        if (!globalAbortHandler) return;

        const tag = (e.target as HTMLElement)?.tagName;
        // Let textarea/input handle Esc internally (ChatInput menus / stop).
        if (tag === "TEXTAREA" || tag === "INPUT") return;

        e.preventDefault();
        globalAbortHandler();
        return;
      }

      // ---- Ctrl+Alt+N: new session ----
      if (e.key === "n" && e.ctrlKey && e.altKey) {
        if (!activeCwd || !onNewSession) return;
        e.preventDefault();
        onNewSession(activeCwd);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeCwd, onNewSession]);
}
