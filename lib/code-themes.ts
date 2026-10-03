// Colours for the places that cannot read CSS custom properties, one entry per registry theme
// (lib/themes.ts): Prism's style objects, Mermaid's detached SVG and xterm's canvas. The literals
// mirror the raw shadcn variables in app/globals.css. `lib/code-themes.test.mjs` loops over the
// registry, so a theme cannot ship without all three.
import ghcolors from "react-syntax-highlighter/dist/cjs/styles/prism/ghcolors.js";
import oneDark from "react-syntax-highlighter/dist/cjs/styles/prism/one-dark.js";
import type { CSSProperties } from "react";
import type { ThemeId } from "@/lib/themes";

export type PrismStyle = Record<string, CSSProperties>;

// react-syntax-highlighter's style objects are untyped `any` in its own d.ts, so this is the
// practical shape we consume: a map of selector -> style object.
const PRISM_STYLES: Record<ThemeId, PrismStyle> = {
  default: ghcolors as unknown as PrismStyle,
  broismypro: oneDark as unknown as PrismStyle,
};

export function getPrismStyle(theme: ThemeId): PrismStyle {
  return PRISM_STYLES[theme];
}

export interface MermaidThemeVariables {
  theme: "base";
  themeVariables: Record<string, string>;
}

const MERMAID_THEMES: Record<ThemeId, MermaidThemeVariables> = {
  default: {
    theme: "base",
    themeVariables: {
      background: "#ffffff",
      primaryColor: "#e2f0f7",
      primaryTextColor: "#13005a",
      primaryBorderColor: "#1c82ad",
      lineColor: "#00337c",
      secondaryColor: "#e8eff8",
      tertiaryColor: "#f3f6fb",
      fontFamily: "var(--font-ui)",
    },
  },
  broismypro: {
    theme: "base",
    themeVariables: {
      background: "#0d0033",
      primaryColor: "#1f1466",
      primaryTextColor: "#e8ebff",
      primaryBorderColor: "#4db3df",
      lineColor: "#4db3df",
      secondaryColor: "#1b0a55",
      tertiaryColor: "#150046",
      fontFamily: "var(--font-ui)",
    },
  },
};

export function getMermaidTheme(theme: ThemeId): MermaidThemeVariables {
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

// The default theme's terminal keeps its own dark palette.
const DEFAULT_XTERM_THEME: XtermTheme = {
  background: "#111318", foreground: "#d7dce5", cursor: "#60a5fa",
  selectionBackground: "#365b8a",
  black: "#1d222b", red: "#f87171", green: "#4ade80", yellow: "#facc15",
  blue: "#60a5fa", magenta: "#c084fc", cyan: "#22d3ee", white: "#e5e7eb",
  brightBlack: "#6b7280", brightRed: "#fca5a5", brightGreen: "#86efac",
  brightYellow: "#fde047", brightBlue: "#93c5fd", brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9", brightWhite: "#ffffff",
};

// Same ANSI colours, on the dark theme's own canvas.
const BROISMYPRO_XTERM_THEME: XtermTheme = { ...DEFAULT_XTERM_THEME, background: "#0d0033", foreground: "#e8ebff", cursor: "#4db3df", selectionBackground: "#2b1f70" };

const XTERM_THEMES: Record<ThemeId, XtermTheme> = {
  default: DEFAULT_XTERM_THEME,
  broismypro: BROISMYPRO_XTERM_THEME,
};

export function getXtermTheme(theme: ThemeId): XtermTheme {
  return XTERM_THEMES[theme];
}
