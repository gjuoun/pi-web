"use client";

import { useSyncExternalStore } from "react";
import type { FontEnumerationSource, InstalledFont } from "@/lib/fonts-installed";
import { mergeMonospace, probeMonospaceFamilies, toInstalledFonts } from "@/lib/fonts-installed";

/**
 * The fonts installed on the machine, fetched once from `/api/fonts` and refined with the in-browser
 * monospace probe (which is what classifies fonts on Windows, where the OS reports no spacing).
 *
 * The store is deliberately forgiving: a failed or empty enumeration is not an error the settings UI
 * should surface — the picker simply falls back to its built-in presets.
 */

export interface InstalledFontsState {
  fonts: InstalledFont[];
  source: FontEnumerationSource;
  status: "idle" | "loading" | "ready" | "failed";
}

const IDLE_STATE: InstalledFontsState = { fonts: [], source: "unavailable", status: "idle" };

let state: InstalledFontsState = IDLE_STATE;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: InstalledFontsState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getSnapshot = (): InstalledFontsState => state;

/** Fetch once per page; later calls are no-ops while loading, ready, or already failed. */
export function loadInstalledFonts(): Promise<void> {
  if (inFlight) return inFlight;
  if (state.status !== "idle") return Promise.resolve();

  emit({ ...state, status: "loading" });
  inFlight = (async () => {
    try {
      const response = await fetch("/api/fonts", { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`font enumeration failed: ${response.status}`);
      const body = (await response.json()) as { fonts?: unknown; source?: unknown };
      const fonts = toInstalledFonts(Array.isArray(body.fonts) ? body.fonts : []);
      const probed = probeMonospaceFamilies(fonts.filter((font) => !font.mono).map((font) => font.family));
      emit({
        fonts: mergeMonospace(fonts, probed),
        source: typeof body.source === "string" ? (body.source as FontEnumerationSource) : "unavailable",
        status: "ready",
      });
    } catch {
      emit({ fonts: [], source: "unavailable", status: "failed" });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Test seam: drop the cached enumeration. */
export function resetInstalledFonts(): void {
  state = IDLE_STATE;
  inFlight = null;
  emit(IDLE_STATE);
}

export function useInstalledFonts(): InstalledFontsState {
  // Returns the store snapshot itself: a wrapper object would change identity on every render and
  // invalidate every consumer's memoisation (React Compiler flags the mismatch).
  return useSyncExternalStore(subscribe, getSnapshot, () => IDLE_STATE);
}
