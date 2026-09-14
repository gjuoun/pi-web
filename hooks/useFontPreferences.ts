"use client";

import { useSyncExternalStore } from "react";
import {
  composeFontStack,
  fontStorageKey,
  fontVariableValues,
  normalizeFontFamilyInput,
  resolveStoredFont,
  type FontRole,
} from "@/lib/fonts";

/**
 * Font preferences for the two selectable roles.
 *
 * Same shape as `useChatAppearance`: a module-level snapshot plus `useSyncExternalStore`, so every
 * consumer (Settings, and the terminal panel which must push the new family into xterm) re-renders
 * from one source and no context provider is needed. The stored value is the bare family the user
 * typed; the CSS stack is composed here on every apply, which is why a change to a fallback tail
 * takes effect without touching storage.
 */

export interface FontPreferences {
  ui: string | null;
  mono: string | null;
}

const DEFAULT_PREFERENCES: FontPreferences = { ui: null, mono: null };

let preferences: FontPreferences | null = null;
const listeners = new Set<() => void>();

/** Which CSS variable a role drives. */
export function fontVariableName(role: FontRole): string {
  return role === "mono" ? "--font-mono" : "--font-ui";
}

/** Writes both variables onto the document root. Safe to call without a DOM. */
export function applyFontPreferences(state: FontPreferences): void {
  if (typeof document === "undefined") return;
  const style = document.documentElement.style;
  for (const [name, value] of Object.entries(fontVariableValues(state))) {
    style.setProperty(name, value);
  }
}

function getSnapshot(): FontPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  if (!preferences) {
    preferences = resolveStoredFont(window.localStorage);
    applyFontPreferences(preferences);
  }
  return preferences;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Persist one role and re-apply. The value kept here is the field's draft text (whitespace
 * collapsed, dangerous characters gone, but not trimmed) so the input round-trips exactly what was
 * typed; the CSS stack is sanitized separately when it is composed. An empty draft means "built-in
 * default".
 */
export function setFont(role: FontRole, family: string): void {
  const draft = normalizeFontFamilyInput(family);
  preferences = { ...getSnapshot(), [role]: draft === "" ? null : draft };
  applyFontPreferences(preferences);
  try {
    window.localStorage.setItem(fontStorageKey(role), draft);
  } catch {
    // Best-effort browser preference persistence.
  }
  listeners.forEach((listener) => listener());
}

/** Back to the built-in stack for one role. */
export function resetFont(role: FontRole): void {
  setFont(role, "");
}

export function useFontPreferences() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PREFERENCES);
  return {
    uiFont: snapshot.ui,
    monoFont: snapshot.mono,
    uiStack: composeFontStack("ui", snapshot.ui),
    monoStack: composeFontStack("mono", snapshot.mono),
    setUiFont: (family: string) => setFont("ui", family),
    setMonoFont: (family: string) => setFont("mono", family),
    resetFont,
  };
}
