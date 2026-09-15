"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-device visibility preference for the chat chrome: whether the input is hidden. Hiding is
 * keyboard-only (`⌘/Ctrl+J`), so this is the only value here — the status row is always displayed.
 *
 * These are *visual* preferences, so they live in `localStorage` like every other one in this app
 * (theme, fonts, chat width, thinking expansion, panel widths). `~/.pi/agent/settings.json` is
 * reserved for agent and tool behaviour.
 *
 * A boolean is stored as the exact string `"true"`; anything else — a missing key, an empty string, a
 * half-written value — resolves to the default, so a corrupt entry can never leave the composer
 * hidden with no way back.
 */

export const COMPOSER_HIDDEN_STORAGE_KEY = "pi-chat-composer-hidden";

export interface ChromePreferences {
  composerHidden: boolean;
}

export const DEFAULT_CHROME_PREFERENCES: ChromePreferences = {
  composerHidden: false,
};

/** Minimal read shape, so the pure reader is testable without a DOM and without a full Storage. */
interface StorageReader {
  getItem(key: string): string | null;
}

/** The browser's own storage, which the setter also writes to. */
interface StorageLike extends StorageReader {
  setItem(key: string, value: string): void;
}

const STORAGE_KEYS: Record<keyof ChromePreferences, string> = {
  composerHidden: COMPOSER_HIDDEN_STORAGE_KEY,
};

function readBoolean(storage: StorageReader | null | undefined, key: string): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function readChromePreferences(storage: StorageReader | null | undefined): ChromePreferences {
  return { composerHidden: readBoolean(storage, COMPOSER_HIDDEN_STORAGE_KEY) };
}

let preferences: ChromePreferences | null = null;
const listeners = new Set<() => void>();

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSnapshot(): ChromePreferences {
  // Check the live snapshot first: without this the setter has no visible effect where there is no
  // `window` (tests, SSR), which would silently break the store.
  if (preferences) return preferences;
  if (typeof window === "undefined") return DEFAULT_CHROME_PREFERENCES;
  preferences = readChromePreferences(browserStorage());
  return preferences;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setChromePreference(key: keyof ChromePreferences, value: boolean): void {
  preferences = { ...getSnapshot(), [key]: value };
  try {
    browserStorage()?.setItem(STORAGE_KEYS[key], String(value));
  } catch {
    // Best-effort browser preference persistence.
  }
  listeners.forEach((listener) => listener());
}

export function useChromePreferences() {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_CHROME_PREFERENCES);
}

export const setComposerHidden = (hidden: boolean) => setChromePreference("composerHidden", hidden);

/** Test seam: drop the memoised snapshot so a fresh read happens. */
export function resetChromePreferences(): void {
  preferences = null;
  listeners.forEach((listener) => listener());
}

/** Store accessors, exposed so the store is testable without rendering a component. */
export const getChromePreferences = getSnapshot;
export const subscribeChromePreferences = subscribe;
