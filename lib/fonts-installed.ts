/**
 * Installed-font enumeration.
 *
 * pi-web's server runs on the same machine as the browser, so the fonts that actually exist are best
 * listed **server-side** (`app/api/fonts/route.ts` shells out per OS) instead of through the browser's
 * `queryLocalFonts()`, which is Chromium-desktop-only, permission-gated, and rejected outright by WebKit.
 *
 * This module holds everything that does not need a server: the per-OS output parsers, the noise filter,
 * the role split, and the browser-side monospace probe used to refine classification where the OS has no
 * spacing flag (Windows) or an incomplete one (fontconfig misses Monaco).
 *
 * Research: `~/.notebook/project/gjuoun/pi-web/research/font-enumeration/research.md`.
 */

import type { FontRole } from "./fonts";

export interface InstalledFont {
  family: string;
  mono: boolean;
}

export type FontEnumerationSource = "coretext" | "fontconfig" | "windows" | "unavailable";

/** Faces macOS/Linux expose under dotted internal names — never user-selectable. */
export const INTERNAL_FAMILY_PATTERN = /^[.$]/;
/** Icon, emoji and dingbat faces: real families, but useless as UI or code typography. */
export const UTILITY_FAMILY_PATTERN =
  /emoji|symbol|dingbat|awesome|material icons|mdl2|fluent icons|webdings|wingdings|marlett|braille|last ?resort/i;

export function isUtilityFontFamily(family: string): boolean {
  const name = family.trim();
  return name.length === 0 || INTERNAL_FAMILY_PATTERN.test(name) || UTILITY_FAMILY_PATTERN.test(name);
}

/** `atsutil fonts -list`: only the sections ending in `Families:` carry family names, tab-indented. */
export function parseAtsutilFamilies(stdout: string): string[] {
  const families: string[] = [];
  let inFamilies = false;
  for (const line of stdout.split("\n")) {
    if (/^\S[^:]*:\s*$/.test(line)) {
      inFamilies = /Families:\s*$/.test(line);
      continue;
    }
    if (inFamilies && /^\t\S/.test(line)) families.push(line.trim());
  }
  return families;
}

/** `fc-list --format='%{family[0]}\t%{spacing}\n'` — mono is spacing 100 (mono) or 110 (charcell). */
export function parseFontconfigList(stdout: string): InstalledFont[] {
  const fonts: InstalledFont[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.includes("\t")) continue; // the format always emits a tab; anything else is not ours
    const [family, spacing] = line.split("\t");
    if (!family?.trim()) continue;
    const code = spacing?.trim();
    fonts.push({ family: family.trim(), mono: code === "100" || code === "110" });
  }
  return fonts;
}

/** Windows WPF/registry enumeration: one family per line, with no spacing information at all. */
export function parseWindowsFamilies(stdout: string): InstalledFont[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((family) => ({ family, mono: false }));
}

/**
 * Drop noise, collapse duplicates, sort for a picker.
 *
 * Dedupe is case-insensitive — a picker must not offer both `Menlo` and `menlo` — and the first spelling
 * seen wins while any mono hit sticks. Sorting uses the `en` collation so the order is stable across
 * machines.
 */
export function toInstalledFonts(raw: readonly { family?: unknown; mono?: unknown }[]): InstalledFont[] {
  const byKey = new Map<string, InstalledFont>();
  for (const entry of raw) {
    const family = typeof entry?.family === "string" ? entry.family.trim() : "";
    if (isUtilityFontFamily(family)) continue;
    const key = family.toLocaleLowerCase("en");
    const existing = byKey.get(key);
    if (existing) {
      existing.mono = existing.mono || entry.mono === true;
      continue;
    }
    byKey.set(key, { family, mono: entry.mono === true });
  }
  return [...byKey.values()].sort((a, b) => a.family.localeCompare(b.family, "en"));
}

/**
 * The families one role offers. Mono fonts belong to the monospace field; everything else — including
 * families the OS could not classify — belongs to the interface field, because a proportional font in
 * the UI list is harmless while a mis-sorted mono pick there is not.
 */
export function pickerFamilies(fonts: readonly InstalledFont[], role: FontRole): string[] {
  return fonts.filter((font) => (role === "mono" ? font.mono : !font.mono)).map((font) => font.family);
}

const PROBE_SENTINEL = "__pi_web_font_probe__";

/**
 * Browser-side monospace classifier: render ten `m`s and ten `i`s in the candidate family and compare
 * advances. A family that is not installed (or has no Latin glyphs) falls through to the sentinel, whose
 * widths are *equal*, so equality is only trusted once the family demonstrably changed the measurement.
 */
export function probeMonospaceFamilies(families: readonly string[]): string[] {
  if (typeof document === "undefined") return [];
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return [];
  const measure = (font: string, text: string): number => {
    context.font = font;
    return context.measureText(text).width;
  };
  const sentinelWidth = measure(`100px ${PROBE_SENTINEL}`, "mmmmmmmmmm");
  return families.filter((family) => {
    const wide = measure(`100px "${family}", ${PROBE_SENTINEL}`, "mmmmmmmmmm");
    if (Math.abs(wide - sentinelWidth) < 0.01) return false;
    const narrow = measure(`100px "${family}", ${PROBE_SENTINEL}`, "iiiiiiiiii");
    return Math.abs(narrow - wide) < 0.5;
  });
}

/** Union the OS classification with the browser probe — a font the OS calls mono stays mono. */
export function mergeMonospace(fonts: readonly InstalledFont[], probed: readonly string[]): InstalledFont[] {
  const probedFamilies = new Set(probed);
  return fonts.map((font) => (font.mono || probedFamilies.has(font.family) ? { family: font.family, mono: true } : font));
}
