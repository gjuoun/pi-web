/**
 * Custom entry types for pin/archive session flags.
 *
 * `session_info` is a fixed SDK type with no extension point (research:
 * ~/.notebook/project/gjuoun/pi-web/research/session-management/research.md) — pin/archive
 * state is modeled as separate `CustomEntry<boolean>` types instead, same naming convention
 * as `SUBAGENT_META_TYPE` in `lib/subagents.ts`. Each type is independently last-write-wins.
 */

export const SESSION_PINNED_TYPE = "pi-web:session-pinned";
export const SESSION_ARCHIVED_TYPE = "pi-web:session-archived";
