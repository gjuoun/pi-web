/**
 * The single owner of `UiState` (open tabs, project expansion, pins) for the whole client.
 *
 * `lib/ui-state.ts` is the pure format + reducer; this module is the live copy. It exists because two
 * components need the same state: AppShell owns the open tab set, SessionSidebar owns the expansion
 * overrides and pins. Two components each holding a private copy and each persisting the whole payload
 * would clobber one another under the one `pi-web:ui-state` key — whichever wrote last would erase the
 * other's changes.
 *
 * Hydration happens in an effect, never during the first render, so the server render and the first
 * client render agree (both see the defaults) and React does not warn about a hydration mismatch.
 */

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { defaultUiState, loadUiState, saveUiState, type UiState } from "./ui-state";

/** Stable snapshot for the server render and the first client render. */
const INITIAL_SNAPSHOT: UiState = defaultUiState();

let state: UiState = INITIAL_SNAPSHOT;
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): UiState {
  return state;
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  const stored = loadUiState();
  if (stored === INITIAL_SNAPSHOT) return;
  state = stored;
  // A stored payload always differs from the defaults object, so any real payload notifies.
  emit();
}

export function getUiState(): UiState {
  return state;
}

/** Apply an update. Identical object identity is a no-op, so renders cannot loop. */
export function setUiState(update: UiState | ((current: UiState) => UiState)): void {
  const next = typeof update === "function" ? (update as (current: UiState) => UiState)(state) : update;
  if (next === state) return;
  state = next;
  saveUiState(next);
  emit();
}

/** Subscribe a component. Hydration is triggered once, by the first subscriber. */
export function useUiState(): UiState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    hydrate();
  }, []);
  return snapshot;
}

/** Test seam: reset the singleton (also used when signing out of a workspace). */
export function resetUiStateStore(): void {
  state = INITIAL_SNAPSHOT;
  hydrated = false;
  emit();
}
