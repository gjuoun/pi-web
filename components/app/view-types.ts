/**
 * Plain data shapes for the stateless view components in `components/app/*`. They are
 * presentational (what to draw), not the persisted session types in `lib/types.ts`.
 */

export interface SessionItem {
  id: string;
  title: string;
  /** Relative time label, e.g. "2h". */
  time: string;
  active?: boolean;
  pinned?: boolean;
  running?: boolean;
  /** 1 for a subagent child row nested under its parent. */
  depth?: 0 | 1;
}

export interface ProjectItem {
  name: string;
  /** The number in the group header; may exceed the rows shown. */
  count: number;
  expanded?: boolean;
  sessions: SessionItem[];
}

export type GitStatus = "modified" | "added" | "untracked";

export interface ExplorerRow {
  name: string;
  kind: "folder" | "file";
  depth: number;
  open?: boolean;
  status?: GitStatus;
}

export interface UsageLine {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export type ProcessStep =
  | { kind: "thinking"; text: string; duration?: string }
  | { kind: "tool"; name: string; summary: string; duration: string; failed?: boolean };

export interface ProcessRun {
  messages: number;
  toolCalls: number;
  model: string;
  steps: ProcessStep[];
  usage?: UsageLine;
}

export type AssistantBlock =
  | { kind: "p"; text: string }
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "list"; ordered?: boolean; items: string[] }
  | { kind: "code"; lang: string; code: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "process"; run: ProcessRun };

export type Turn =
  | { kind: "user"; lines: string[]; time: string }
  | { kind: "assistant"; model: string; blocks: AssistantBlock[]; usage: UsageLine; time: string }
  | { kind: "notice"; tone: "error" | "compaction"; title: string; text: string; time: string };

/** One row of an assistant outline in the hover preview: a heading (level 1-3) or, with no level, the first line of text. */
export interface OutlineItem {
  level?: 1 | 2 | 3;
  label: string;
}

export interface MinimapNode {
  /** The turn's text as the preview shows it (paragraphs separated by a blank line; clamped to four lines). */
  text: string;
  /** The assistant reply's outline under the turn; empty for a compaction entry. */
  outline: OutlineItem[];
  /** The turn nearest the top of the viewport. */
  active?: boolean;
}

export interface SessionStatsData {
  up: string;
  down: string;
  cache: string;
  cost: string;
  contextPercent: number;
  contextWindow: string;
}

export interface StatusBarData {
  project: string;
  branch?: string;
  sessionName?: string;
  /** The counters of line 2, one entry per segment (`↑13`, `R1.7M`, ... `51.6%/1.0M (auto)`). */
  stats?: string[];
  /** Colours the last stats segment like the real bar: above 70 warning, above 90 destructive. */
  contextPercent?: number;
  model: string;
  thinking?: string;
}

export interface ProviderItem {
  id: string;
  name: string;
}

export interface SkillItem {
  /** The skill's name as the real list shows it (its directory name). */
  name: string;
  description: string;
  /** Absolute path of its SKILL.md. */
  path: string;
  enabled: boolean;
}

export interface PluginItem {
  /** The package name. The real list prints the package's path, which is `path`. */
  name: string;
  path: string;
  version: string;
  status: "loaded" | "disabled";
  /** `1 ext`, or `disabled`. */
  resources: string;
  enabled: boolean;
  scope: "global" | "project";
}

export interface FileTabItem {
  id: string;
  label: string;
  kind: "file" | "terminal";
}

/** An attached image above the input (the real composer shows a 56px preview with a remove badge). */
export interface ComposerChipItem {
  id: string;
  label: string;
}

/** A queued steering or follow-up message row above the input. */
export interface QueuedMessage {
  kind: "steer" | "follow-up";
  text: string;
}
