/**
 * Font selection model.
 *
 * Two roles — the interface font and the monospace font — each have a built-in default stack, a
 * fallback tail, and a list of suggested presets. Storage holds the *bare family* the user typed
 * (`""` meaning "built-in default"), never the composed stack, so changing a tail later cannot
 * strand a saved value; the stack is composed at apply time.
 *
 * `UI_FONT_DEFAULT` and `MONO_FONT_DEFAULT` are duplicated in `app/globals.css` because the
 * stylesheet must render before any JavaScript runs. `components/FontSettings.test.mjs` asserts the
 * two copies stay byte-equal.
 *
 * The pure helpers here are the only place that turns user input into CSS; `FONT_INIT_SCRIPT` is the
 * pre-hydration twin of the same logic and is asserted against `composeFontStack` in `fonts.test.mjs`.
 */

export type FontRole = "ui" | "mono";

export const UI_FONT_STORAGE_KEY = "pi-font-ui";
export const MONO_FONT_STORAGE_KEY = "pi-font-mono";

export interface FontPreset {
  /** Stable id for React keys and tests. */
  id: string;
  /** Shown verbatim in the datalist — font names are not translated. */
  label: string;
  /** `""` = the built-in default stack. */
  family: string;
}

export function fontStorageKey(role: FontRole): string {
  return role === "mono" ? MONO_FONT_STORAGE_KEY : UI_FONT_STORAGE_KEY;
}

/** Everything after the user's family. Keeps CJK text off whatever the OS picks last. */
export const UI_FONT_FALLBACK_TAIL =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif";

export const MONO_FONT_FALLBACK_TAIL =
  "var(--font-noto-mono), ui-monospace, 'SF Mono', Menlo, Consolas, 'PingFang SC', 'Microsoft YaHei', monospace";

export const UI_FONT_DEFAULT = UI_FONT_FALLBACK_TAIL;

export const MONO_FONT_DEFAULT =
  "var(--font-noto-mono), 'JetBrains Mono', 'Fira Code', 'Consolas', ui-monospace, 'PingFang SC', 'Microsoft YaHei', monospace";

export const UI_FONT_PRESETS: FontPreset[] = [
  { id: "system", label: "System default", family: "" },
  { id: "inter", label: "Inter", family: "Inter" },
  { id: "ibm-plex-sans", label: "IBM Plex Sans", family: "IBM Plex Sans" },
  { id: "noto-sans", label: "Noto Sans", family: "Noto Sans" },
  { id: "helvetica-neue", label: "Helvetica Neue", family: "Helvetica Neue" },
  { id: "segoe-ui", label: "Segoe UI", family: "Segoe UI" },
  { id: "pingfang-sc", label: "PingFang SC", family: "PingFang SC" },
];

export const MONO_FONT_PRESETS: FontPreset[] = [
  { id: "system", label: "System mono", family: "" },
  { id: "jetbrains-mono", label: "JetBrains Mono", family: "JetBrains Mono" },
  { id: "fira-code", label: "Fira Code", family: "Fira Code" },
  { id: "ibm-plex-mono", label: "IBM Plex Mono", family: "IBM Plex Mono" },
  // macOS does not let a page reach SF Mono by name (neither atsutil nor CoreText lists it; fontconfig
  // only knows `.SF NS Mono`), so the family is reached through the CSS generic instead.
  { id: "ui-monospace", label: "ui-monospace", family: "ui-monospace" },
  { id: "menlo", label: "Menlo", family: "Menlo" },
  { id: "consolas", label: "Consolas", family: "Consolas" },
  { id: "noto-sans-mono", label: "Noto Sans Mono", family: "Noto Sans Mono" },
];

export function fontPresets(role: FontRole): FontPreset[] {
  return role === "mono" ? MONO_FONT_PRESETS : UI_FONT_PRESETS;
}

export function fontDefaultStack(role: FontRole): string {
  return role === "mono" ? MONO_FONT_DEFAULT : UI_FONT_DEFAULT;
}

export function fontFallbackTail(role: FontRole): string {
  return role === "mono" ? MONO_FONT_FALLBACK_TAIL : UI_FONT_FALLBACK_TAIL;
}

export const FONT_FAMILY_MAX_LENGTH = 200;

/** Minimal storage surface, so the readers can be exercised without a browser. */
export interface StorageLike {
  getItem(key: string): string | null;
}

/** The stored family for one role, sanitized; `null` means "use the built-in default". */
export function readStoredFont(storage: StorageLike | null | undefined, role: FontRole): string | null {
  if (!storage) return null;
  let raw: unknown = null;
  try {
    raw = storage.getItem(fontStorageKey(role));
  } catch {
    return null;
  }
  return sanitizeFontFamily(raw);
}

/** Both stored families at once — what the store hydrates from. */
export function resolveStoredFont(storage: StorageLike | null | undefined): { ui: string | null; mono: string | null } {
  return { ui: readStoredFont(storage, "ui"), mono: readStoredFont(storage, "mono") };
}

/** The two CSS variables a preference pair resolves to, as a plain map. */
export function fontVariableValues(state: { ui?: unknown; mono?: unknown }): Record<string, string> {
  return {
    "--font-ui": composeFontStack("ui", state.ui),
    "--font-mono": composeFontStack("mono", state.mono),
  };
}

/** Every character that could end the declaration, start a new one, or smuggle in a `url()`. */
const UNSAFE_FONT_CHARACTERS = /[;{}()@"'\\:\n\r\t]+/g;
const CSS_COMMENT = /\/\*|\*\//g;
const WHITESPACE = /\s+/g;
const SIMPLE_FONT_FAMILY = /^[A-Za-z0-9_-]+$/;

/**
 * What the settings field round-trips: dangerous characters removed and whitespace collapsed, but
 * deliberately NOT trimmed. A controlled input that trimmed on every keystroke would swallow the
 * space in "Comic Sans MS" — the trailing space is stripped, the value snaps back, and the next
 * character lands immediately after the previous word.
 */
export function normalizeFontFamilyInput(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(CSS_COMMENT, " ")
    .replace(UNSAFE_FONT_CHARACTERS, " ")
    .replace(WHITESPACE, " ")
    .slice(0, FONT_FAMILY_MAX_LENGTH);
}

/**
 * Reduce arbitrary user input to a family list that cannot break out of a `font-family` value.
 * Quotes are dropped rather than escaped — `quoteFontFamily` adds them back where they are needed,
 * so a stray quote can never pair with the one we emit.
 */
export function sanitizeFontFamily(raw: unknown): string | null {
  const cleaned = normalizeFontFamilyInput(raw).trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Wrap a family in quotes exactly once, when it is not a single bare identifier. */
export function quoteFontFamily(family: string): string {
  const cleaned = sanitizeFontFamily(family);
  if (!cleaned) return "";
  return SIMPLE_FONT_FAMILY.test(cleaned) ? cleaned : `"${cleaned}"`;
}

/** The full `font-family` value for a role: the picked family first, then the role's tail. */
export function composeFontStack(role: FontRole, family: unknown): string {
  const cleaned = sanitizeFontFamily(family);
  if (!cleaned) return fontDefaultStack(role);
  return `${quoteFontFamily(cleaned)}, ${fontFallbackTail(role)}`;
}

/** True when nothing usable is stored, i.e. the role is on its built-in stack. */
export function isDefaultFont(family: unknown): boolean {
  return sanitizeFontFamily(family) === null;
}

const FONT_INIT_ROLES = {
  ui: [UI_FONT_STORAGE_KEY, UI_FONT_FALLBACK_TAIL, UI_FONT_DEFAULT],
  mono: [MONO_FONT_STORAGE_KEY, MONO_FONT_FALLBACK_TAIL, MONO_FONT_DEFAULT],
};

/**
 * Applies the stored fonts before first paint, mirroring `THEME_INIT_SCRIPT`. Written as a compact
 * IIFE because it is inlined into the server-rendered `<head>`; `fonts.test.mjs` runs it against a
 * stub DOM and asserts it writes exactly what `composeFontStack` would.
 */
export const FONT_INIT_SCRIPT = [
  "(function(){",
  `var R=${JSON.stringify(FONT_INIT_ROLES)};`,
  "var d=document.documentElement;",
  "for(var k in R){",
  "var v=null;",
  "try{v=localStorage.getItem(R[k][0])}catch(e){}",
  "var c=typeof v==='string'?v.replace(/\\/\\*|\\*\\//g,' ').replace(/[;{}()@\"'\\\\:\\n\\r\\t]+/g,' ').replace(/\\s+/g,' ').trim().slice(0,200):'';",
  "var s=c?(/^[A-Za-z0-9_-]+$/.test(c)?c:'\"'+c+'\"')+', '+R[k][1]:R[k][2];",
  "d.style.setProperty('--font-'+k,s)",
  "}})();",
].join("");
