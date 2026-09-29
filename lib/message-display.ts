import type { AgentMessage, AssistantContentBlock, AssistantMessage, ThinkingContent, ToolCallContent } from "./types";

interface DisplayOptions {
  isStreaming?: boolean;
}

export function getThinkingPreview(thinking: string): string {
  return thinking.trimStart().match(/^[^\r\n]{0,240}/u)?.[0].trimEnd() ?? "";
}

/**
 * Far wider than any collapsed chip, so the cap only bounds the markdown work while a block streams —
 * the chip scrolls to the end of whatever it is given.
 */
export const THINKING_TAIL_MAX_CHARS = 400;

/**
 * The newest line of a thinking block. A block streams from its first line down, so the last
 * non-blank line is what the model is working through right now; the collapsed chip shows it so the
 * text keeps moving while the model thinks. The head of an over-long line is dropped — the chip is
 * scrolled to the end anyway — and the result is never split mid code point.
 */
export function getThinkingTail(thinking: string, maxChars: number = THINKING_TAIL_MAX_CHARS): string {
  const lines = thinking.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;
    return line.length > maxChars ? [...line].slice(-maxChars).join("") : line;
  }
  return "";
}

export function isMessageGroupAnchor(message: { role?: AgentMessage["role"]; customType?: string }): boolean {
  return message.role === "user"
    || (message.role === "custom" && message.customType === "compaction");
}

export function isEmptyThinkingBlock(block: AssistantContentBlock, options: DisplayOptions = {}): block is ThinkingContent {
  return block.type === "thinking" && !block.deferred && !options.isStreaming && block.thinking.trim() === "";
}

export function getDisplayableAssistantBlocks(
  message: AssistantMessage,
  options: DisplayOptions = {},
): AssistantContentBlock[] {
  return (message.content ?? []).filter((block) => !isEmptyThinkingBlock(block, options));
}

export function getAssistantErrorMessage(
  message: AssistantMessage,
  options: DisplayOptions = {},
): string | null {
  if (options.isStreaming || message.stopReason !== "error") return null;
  return message.errorMessage?.trim() || "Unknown provider error";
}

function isFinalAnswerBlock(block: AssistantContentBlock): boolean {
  return block.type === "text" || block.type === "image";
}

export function splitFinalAssistantBlocks(
  message: AssistantMessage,
  options: DisplayOptions = {},
): { answerBlocks: AssistantContentBlock[]; processBlocks: AssistantContentBlock[] } {
  const blocks = getDisplayableAssistantBlocks(message, options);
  const lastProcessIndex = blocks.findLastIndex((block) => !isFinalAnswerBlock(block));
  if (lastProcessIndex === -1) {
    return { answerBlocks: blocks, processBlocks: [] };
  }
  return {
    answerBlocks: blocks.slice(lastProcessIndex + 1),
    processBlocks: blocks.slice(0, lastProcessIndex + 1),
  };
}

export function countToolCallBlocks(blocks: AssistantContentBlock[]): number {
  return blocks.filter((block): block is ToolCallContent => block.type === "toolCall").length;
}

/** An empty, non-deferred thinking block: filtered out of every render, so it can stand in for a hidden block. */
const HIDDEN_BLOCK: ThinkingContent = { type: "thinking", thinking: "" };

function isSpokenBlock(block: AssistantContentBlock): boolean {
  return block.type === "image" || (block.type === "text" && block.text.trim().length > 0);
}

export interface ProcessRun {
  /** `inline` runs are the assistant speaking (text/images); `fold` runs are thinking and tool calls. */
  kind: "inline" | "fold";
  /** The source message with every block outside this run masked, so block indices stay the originals. */
  message: AssistantMessage;
  toolCallCount: number;
}

/**
 * Splits an intermediate assistant message into contiguous runs: text and images are shown inline,
 * while thinking and tool calls fold into "Process details". Masking (rather than slicing) keeps each
 * block at its stored index, which deferred thinking loads by, and leaves `message.content` the same
 * length. Usage is kept on the last run only, so it is not repeated once per run.
 */
export function splitProcessRuns(message: AssistantMessage): ProcessRun[] {
  const content = message.content ?? [];
  const groups: { kind: ProcessRun["kind"]; indices: Set<number> }[] = [];
  content.forEach((block, index) => {
    if (isEmptyThinkingBlock(block)) return;
    const kind = isSpokenBlock(block) ? "inline" : "fold";
    const last = groups[groups.length - 1];
    if (last?.kind === kind) last.indices.add(index);
    else groups.push({ kind, indices: new Set([index]) });
  });
  return groups.map((group, position) => {
    const masked = content.map((block, index) => (group.indices.has(index) ? block : HIDDEN_BLOCK));
    const next: AssistantMessage = { ...message, content: masked };
    if (position < groups.length - 1) next.usage = undefined;
    return { kind: group.kind, message: next, toolCallCount: countToolCallBlocks(getDisplayableAssistantBlocks(next)) };
  });
}
