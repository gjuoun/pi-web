/**
 * Theme registry. A theme is one block of the raw shadcn variables in `app/globals.css`
 * (`default` is `:root`, every other id is `[data-theme="<id>"]`); `app/globals.test.mjs` keeps the
 * registry and the CSS in sync. A `dark` theme also carries the `dark` class on <html>, so the
 * `dark:` utilities shipped inside `components/ui/*` apply with `@custom-variant dark` left native.
 */
export const THEMES = [
  { id: "default", label: "Default", dark: false },
  { id: "broismypro", label: "broismypro", dark: true },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "default";

/** localStorage key shared by the pre-paint script and `useTheme`. */
export const THEME_STORAGE_KEY = "pi-theme";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function isDarkTheme(id: ThemeId): boolean {
  return THEMES.some((theme) => theme.id === id && theme.dark);
}

interface ThemeRoot {
  dataset: { theme?: string } | DOMStringMap;
  classList: { toggle(name: string, force?: boolean): unknown };
}

/** Apply a theme to <html>: the `data-theme` attribute plus the `dark` class for dark themes. */
export function applyTheme(root: ThemeRoot, id: ThemeId): void {
  root.dataset.theme = id;
  root.classList.toggle("dark", isDarkTheme(id));
}

// Apply the saved theme before first paint, including when storage is blocked. Compact inline
// copy of `applyTheme`; `lib/themes.test.mjs` runs it against a stub root and asserts they agree.
export const THEME_INIT_SCRIPT = `(function(){var t=${JSON.stringify(DEFAULT_THEME)};try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(THEMES.map((theme) => theme.id))}.indexOf(s)>-1)t=s}catch(e){}var r=document.documentElement;r.dataset.theme=t;r.classList.toggle("dark",${JSON.stringify(THEMES.filter((theme) => theme.dark).map((theme) => theme.id))}.indexOf(t)>-1)})();`;
