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
