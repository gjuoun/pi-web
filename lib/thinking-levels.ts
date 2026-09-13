/**
 * Thinking-level vocabulary shared by the composer and the status bar.
 * Pi accepts these eight levels; a model only offers a subset of them.
 */

export const THINKING_LEVELS = ["auto", "off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type ThinkingLevelChoice = (typeof THINKING_LEVELS)[number];

export const THINKING_LEVEL_DESC_KEYS: Record<ThinkingLevelChoice, string> = {
  auto: "chat.thinkingUseDefault",
  off: "chat.thinkingOff",
  minimal: "chat.thinkingMinimal",
  low: "chat.thinkingLow",
  medium: "chat.thinkingMedium",
  high: "chat.thinkingHigh",
  xhigh: "chat.thinkingXhigh",
  max: "chat.thinkingMax",
};

/** Levels worth offering for a model; `auto` is always available. */
export function thinkingChoicesFor(
  available: readonly string[] | null | undefined,
): ThinkingLevelChoice[] {
  if (!available || available.length === 0) return [...THINKING_LEVELS];
  return THINKING_LEVELS.filter((level) => level === "auto" || available.includes(level));
}

/** `low (medium)` when the provider alias differs from the generic level name. */
export function thinkingLevelAlias(
  level: string,
  aliases?: Record<string, string | null> | null,
): string | null {
  const mapped = aliases?.[level];
  return mapped != null && mapped !== level ? mapped : null;
}
