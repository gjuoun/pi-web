import type { ExplorerRow } from "@/components/app/view-types";

/** The repo root listing the real Explorer shows, with its git status letters. */
export const explorerRows: ExplorerRow[] = [
  { name: ".github", kind: "folder", depth: 0, status: "modified" },
  { name: "app", kind: "folder", depth: 0, status: "modified" },
  { name: "bin", kind: "folder", depth: 0 },
  { name: "components", kind: "folder", depth: 0, status: "modified" },
  { name: "docs", kind: "folder", depth: 0, status: "modified" },
  { name: "e2e", kind: "folder", depth: 0, status: "modified" },
  { name: "hooks", kind: "folder", depth: 0, status: "modified" },
  { name: "lib", kind: "folder", depth: 0, status: "modified" },
  { name: "public", kind: "folder", depth: 0 },
  { name: "scripts", kind: "folder", depth: 0, status: "modified" },
  { name: "test-results", kind: "folder", depth: 0 },
  { name: ".gitignore", kind: "file", depth: 0 },
  { name: "AGENTS.md", kind: "file", depth: 0, status: "modified" },
  { name: "bun.lock", kind: "file", depth: 0, status: "untracked" },
];
