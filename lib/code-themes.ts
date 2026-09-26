// The @types package only declares these specifiers without a `.js` suffix, but Node's plain
// ESM loader (used by our `--experimental-strip-types --test` runner) requires the explicit
// extension for a CJS file with no package.json "exports" map. Ambient re-declarations below
// let tsc treat the `.js`-suffixed specifiers identically to the untyped ones.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import oneLight from "react-syntax-highlighter/dist/cjs/styles/prism/one-light.js";
import oneDark from "react-syntax-highlighter/dist/cjs/styles/prism/one-dark.js";
import ghcolors from "react-syntax-highlighter/dist/cjs/styles/prism/ghcolors.js";
import draculaPrism from "react-syntax-highlighter/dist/cjs/styles/prism/dracula.js";
import type { CSSProperties } from "react";
import type { ResolvedTheme } from "@/lib/theme";

export type PrismStyle = Record<string, CSSProperties>;

// react-syntax-highlighter's PrismLight/Prism style objects are untyped `any` in its own
// d.ts, so this is the practical shape we consume: a map of selector -> style object.

const PRISM_STYLES: Record<ResolvedTheme, PrismStyle> = {
  light: oneLight as unknown as PrismStyle,
  dark: oneDark as unknown as PrismStyle,
  github: ghcolors as unknown as PrismStyle,
  dracula: draculaPrism as unknown as PrismStyle,
};

export function getPrismStyle(theme: ResolvedTheme): PrismStyle {
  return PRISM_STYLES[theme];
}

export interface MermaidThemeVariables {
  theme: "base";
  themeVariables: Record<string, string>;
}

// Mermaid needs literal hex values (it renders into detached SVG, no access to CSS custom
// properties), so each theme's variables are hard-coded here rather than read from tokens.
const MERMAID_THEMES: Record<ResolvedTheme, MermaidThemeVariables> = {
  light: {
    theme: "base",
    themeVariables: {
      background: "#ffffff",
      primaryColor: "#f4f4f5",
      primaryTextColor: "#18181b",
      primaryBorderColor: "#d4d4d8",
      lineColor: "#71717a",
      secondaryColor: "#e4e4e7",
      tertiaryColor: "#fafafa",
      fontFamily: "var(--font-ui)",
    },
  },
  dark: {
    theme: "base",
    themeVariables: {
      background: "#18181b",
      primaryColor: "#27272a",
      primaryTextColor: "#fafafa",
      primaryBorderColor: "#3f3f46",
      lineColor: "#a1a1aa",
      secondaryColor: "#3f3f46",
      tertiaryColor: "#27272a",
      fontFamily: "var(--font-ui)",
    },
  },
  github: {
    theme: "base",
    themeVariables: {
      background: "#ffffff",
      primaryColor: "#f6f8fa",
      primaryTextColor: "#1f2328",
      primaryBorderColor: "#d1d9e0",
      lineColor: "#59636e",
      secondaryColor: "#eaeef2",
      tertiaryColor: "#f6f8fa",
      fontFamily: "var(--font-ui)",
    },
  },
  dracula: {
    theme: "base",
    themeVariables: {
      background: "#282a36",
      primaryColor: "#44475a",
      primaryTextColor: "#f8f8f2",
      primaryBorderColor: "#6272a4",
      lineColor: "#6272a4",
      secondaryColor: "#44475a",
      tertiaryColor: "#282a36",
      fontFamily: "var(--font-ui)",
    },
  },
};

export function getMermaidTheme(theme: ResolvedTheme): MermaidThemeVariables {
  return MERMAID_THEMES[theme];
}

export interface XtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

// Today's palette (used for light/dark/github, all of which share the same terminal look).
const DEFAULT_XTERM_THEME: XtermTheme = {
  background: "#111318", foreground: "#d7dce5", cursor: "#60a5fa",
  selectionBackground: "#365b8a",
  black: "#1d222b", red: "#f87171", green: "#4ade80", yellow: "#facc15",
  blue: "#60a5fa", magenta: "#c084fc", cyan: "#22d3ee", white: "#e5e7eb",
  brightBlack: "#6b7280", brightRed: "#fca5a5", brightGreen: "#86efac",
  brightYellow: "#fde047", brightBlue: "#93c5fd", brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9", brightWhite: "#ffffff",
};

// Dracula's official ANSI palette (https://draculatheme.com/contribute#color-palette).
const DRACULA_XTERM_THEME: XtermTheme = {
  background: "#282a36", foreground: "#f8f8f2", cursor: "#f8f8f2",
  selectionBackground: "#44475a",
  black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
  blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
  brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94",
  brightYellow: "#ffffa5", brightBlue: "#d6acff", brightMagenta: "#ff92df",
  brightCyan: "#a4ffff", brightWhite: "#ffffff",
};

const XTERM_THEMES: Record<ResolvedTheme, XtermTheme> = {
  light: DEFAULT_XTERM_THEME,
  dark: DEFAULT_XTERM_THEME,
  github: DEFAULT_XTERM_THEME,
  dracula: DRACULA_XTERM_THEME,
};

export function getXtermTheme(theme: ResolvedTheme): XtermTheme {
  return XTERM_THEMES[theme];
}
