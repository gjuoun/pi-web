#!/usr/bin/env node
// ui-guard — app components may only use a shadcn primitive's PUBLIC surface: its props/variants,
// role colours (`bg-primary`, `text-muted-foreground`, ...) and composition. Anything that needs
// more is a missing variant (added to components/ui/* with a `pi:` marker, see ui-pristine.sh).
// Scans components/app and app/ui/lib. Usage: node scripts/ui-guard.mjs [--scope <dir> ...]
// A violation can be waived with `// ui-guard-allow: <reason>` on the same or the previous line.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DEFAULT_SCOPES = ["components/app", "app/ui/lib", "app/ui/preview"];

const STRING_LITERAL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const PALETTE = "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";
const COLOUR_UTIL = "bg|text|border(?:-[trblxy])?|ring|outline|fill|stroke|from|via|to|shadow|decoration|divide|caret|accent";

// Rules over the contents of string literals (class names live there).
const STRING_RULES = [
  { rule: "important", message: "important modifier (`!`) forces a primitive; add a variant instead", re: /(?:^|[\s:])!(?=[a-z[])|[\w\])%]!(?=\s|$)/g },
  { rule: "slot-selector", message: "selector into a primitive's internal slot; add a variant instead", re: /\[&[^\]\s]*data-slot|\[\[data-slot=|\[&_?\[data-slot/g },
  { rule: "hardcoded-colour", message: "hard-coded colour in a class; use a role colour token", re: /-\[[^\]\s]*?(?:#[0-9a-fA-F]{3,8}\b|rgba?\()/g },
  {
    rule: "raw-palette",
    message: "raw palette colour; use a role (primary, muted, destructive, success, warning, ...)",
    re: new RegExp(`(?:^|[\\s:])(?:${COLOUR_UTIL})-(?:white|black|(?:${PALETTE})-\\d{2,3})\\b`, "g"),
  },
];

/** @returns {{file: string, line: number, rule: string, message: string, match: string}[]} */
export function checkSource(file, text) {
  const lines = text.split("\n");
  const out = [];
  lines.forEach((line, i) => {
    const waived = /ui-guard-allow:/.test(line) || /ui-guard-allow:/.test(lines[i - 1] ?? "");
    if (waived) return;
    const add = (rule, message, match) => out.push({ file, line: i + 1, rule, message, match });
    if (/style=\{\{/.test(line)) add("static-style", "static style object; use classes (runtime geometry needs `ui-guard-allow: <reason>`)", "style={{");
    for (const lit of line.match(STRING_LITERAL) ?? []) {
      const body = lit.slice(1, -1);
      for (const { rule, message, re } of STRING_RULES) {
        for (const m of body.matchAll(re)) add(rule, message, m[0].trim());
      }
    }
  });
  return out;
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) files.push(p);
  }
  return files;
}

function main() {
  const args = process.argv.slice(2);
  const scopes = args.flatMap((a, i) => (args[i - 1] === "--scope" ? [a] : []));
  const dirs = (scopes.length ? scopes : DEFAULT_SCOPES).map((d) => join(ROOT, d)).filter((d) => existsSync(d));
  const files = dirs.flatMap(walk);
  const violations = files.flatMap((f) => checkSource(relative(ROOT, f), readFileSync(f, "utf8")));
  for (const v of violations) console.log(`${v.file}:${v.line}  [${v.rule}] ${v.match} — ${v.message}`);
  if (violations.length) {
    console.log(`ui-guard: ${violations.length} violation(s) in ${files.length} files`);
    process.exit(1);
  }
  console.log(`ui-guard: ok (${files.length} files scanned)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
