/**
 * Path display helpers shared by the sidebar and the chat status bar.
 * Kept dependency-free so it can run in any client component.
 */

/** Collapse a leading home directory prefix to `~`, mirroring pi's `formatCwdForFooter`. */
export function collapseHomePath(target: string, homeDir?: string | null): string {
  if (!target || !homeDir) return target;
  if (target === homeDir) return "~";
  if (!target.startsWith(homeDir)) return target;
  const rest = target.slice(homeDir.length);
  // A sibling like `/Users/junguo2` shares the prefix but is not inside home.
  if (!rest.startsWith("/") && !rest.startsWith("\\")) return target;
  return "~" + rest;
}
