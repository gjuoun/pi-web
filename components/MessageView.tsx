"use client";

import { memo, useState, useRef, useEffect, useMemo, createElement } from "react";
import ReactMarkdown from "react-markdown";
import { MarkdownBody } from "./MarkdownBody";
import { resolveToolRenderer } from "./tool-renderers/registry";
import { ImagePreview } from "./ImagePreview";
import { CodeBlock } from "./MermaidBlock";
import { ThinkingIcon } from "./ThinkingIcon";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/hooks/useI18n";
import { parseCompactionSummary } from "@/lib/compaction-summary";
import { getAssistantErrorMessage, getThinkingPreview, getThinkingTail, isEmptyThinkingBlock } from "@/lib/message-display";
import { parseUnifiedPatch, type SplitDiffCell } from "@/lib/patch";
import { isEditToolName, isJunCodeToolName } from "@/lib/tool-names";
// Value import, so it must come from a client-safe module: the bridge is server-side and pulls the
// pi SDK in with it (lib/pi-subagents-details.ts explains the failure mode).
import { isPiSubagentsAgentDetails } from "@/lib/pi-subagents-details";
import { isThinkingExpandedByDefault, THINKING_EXPANDED_EVENT } from "@/lib/thinking-expansion-preference";
import { TurnWrittenFiles } from "./TurnWrittenFiles";
import type { WrittenFile } from "@/lib/turn-written-files";
import { skillExpansionToCommand } from "@/lib/slash-display";
import type {
  AgentMessage,
  UserMessage,
  AssistantMessage,
  CustomMessage,
  ToolResultMessage,
  BashExecutionMessage,
  AssistantContentBlock,
  TextContent,
  ImageContent,
  ToolCallContent,
  ThinkingContent,
} from "@/lib/types";

// CJK chars ~1 token each (GLM/DeepSeek/GPT-o200k); other chars ~4 chars/token.
const CJK_PATTERN = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}\uac00-\ud7af]/u;
function estimateTokens(text: string): number {
  let cjk = 0;
  let rest = 0;
  for (const ch of text) {
    if (CJK_PATTERN.test(ch)) cjk++;
    else rest++;
  }
  return cjk + rest / 4;
}

interface TokenEstimateCacheEntry {
  text: string;
  tokens: number;
}

export function getTokenEstimateText(block: AssistantContentBlock): string | null {
  if (block.type === "text") return block.text;
  if (block.type === "thinking") return block.thinking;
  if (block.type === "toolCall") return block.rawInput ?? JSON.stringify(block.input ?? {}) ?? "";
  return null;
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function estimateUpdatedTokens(previous: TokenEstimateCacheEntry | undefined, text: string): number {
  if (!previous || !text.startsWith(previous.text)) return estimateTokens(text);

  let baseTokens = previous.tokens;
  let suffixStart = previous.text.length;
  // A streamed delta can complete a surrogate pair that was counted as two
  // non-CJK code points in the previous update.
  if (
    suffixStart > 0
    && suffixStart < text.length
    && isHighSurrogate(previous.text.charCodeAt(suffixStart - 1))
    && isLowSurrogate(text.charCodeAt(suffixStart))
  ) {
    baseTokens -= 1 / 4;
    suffixStart--;
  }
  return baseTokens + estimateTokens(text.slice(suffixStart));
}

const MAX_THINKING_CACHE_ENTRIES = 100;
const thinkingContentCache = new Map<string, Promise<string>>();

// Messages larger than this skip markdown rendering entirely. react-markdown +
// KaTeX + syntax highlighting on multi-hundred-KB payloads (e.g. pasted HAR or
// log dumps) freezes the browser main thread.
const MAX_MARKDOWN_CHARS = 100_000;

function formatMessageBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} KB`;
  return `${n} B`;
}

/**
 * MarkdownBody with an oversized-content guard: huge messages render as a
 * click-to-reveal plain-text <pre> instead of running the markdown pipeline.
 */
function SafeMarkdownBody({ children, className, ...props }: React.ComponentProps<typeof MarkdownBody>) {
  const { t } = useI18n();
  const [showRaw, setShowRaw] = useState(false);

  if (children.length <= MAX_MARKDOWN_CHARS) {
    return <MarkdownBody className={className} {...props}>{children}</MarkdownBody>;
  }
  if (!showRaw) {
    return (
      <button
        onClick={() => setShowRaw(true)}
        className="my-1 block w-full rounded-md border border-border bg-sidebar px-2.5 py-1.5 text-left text-xs text-muted-foreground"
      >
        ⚠ {t("i18n.largeMessageReveal", { size: formatMessageBytes(children.length) })}
      </button>
    );
  }
  return (
    <div className={`${className} max-h-[420px] overflow-auto text-[calc(12px+var(--chat-font-size-offset,0px))] leading-normal`}>
      <pre className="m-0 px-2.5 py-2 font-mono whitespace-pre-wrap break-words text-muted-foreground">
        {children}
      </pre>
    </div>
  );
}

// Cap the user "sent" bubble's height so an abnormally long message does not
// push the conversation off screen; overflow scrolls inside the bubble.
const USER_BUBBLE_MAX_HEIGHT = 300;

function loadThinkingContent(sessionId: string, entryId: string, blockIndex: number): Promise<string> {
  const key = `${sessionId}:${entryId}:${blockIndex}`;
  const cached = thinkingContentCache.get(key);
  if (cached) {
    thinkingContentCache.delete(key);
    thinkingContentCache.set(key, cached);
    return cached;
  }

  const request = fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/entries/${encodeURIComponent(entryId)}/thinking?blockIndex=${blockIndex}`,
  ).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { thinking?: unknown };
    if (typeof data.thinking !== "string") throw new Error("Invalid thinking response");
    return data.thinking;
  }).catch((error) => {
    thinkingContentCache.delete(key);
    throw error;
  });

  thinkingContentCache.set(key, request);
  if (thinkingContentCache.size > MAX_THINKING_CACHE_ENTRIES) {
    const oldestKey = thinkingContentCache.keys().next().value;
    if (oldestKey) thinkingContentCache.delete(oldestKey);
  }
  return request;
}

interface Props {
  message: AgentMessage;
  isStreaming?: boolean;
  toolResults?: Map<string, ToolResultMessage>;
  modelNames?: Record<string, string>;
  fallbackModel?: { provider: string; modelId: string } | null;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
  entryId?: string;
  searchBlock?: AssistantContentBlock;
  onFork?: (entryId: string) => void;
  forking?: boolean;
  onNavigate?: (entryId: string) => Promise<boolean>;
  onEditContent?: (message: UserMessage) => void;
  showTimestamp?: boolean;
  prevTimestamp?: number;
  sessionId?: string;
  /**
   * Files this turn wrote, derived by the caller from the whole turn's
   * successful write/edit tool calls. ChatWindow computes this because the
   * saved-message path splits tool calls into their own entries, leaving the
   * final answer text-only.
   */
  writtenFiles?: WrittenFile[];
}

export function getModelDisplayName(
  provider: string,
  responseModel: string,
  modelNames?: Record<string, string>,
): string {
  const normalizedProvider = provider.toLowerCase();
  const normalizedResponse = responseModel.toLowerCase();
  const configured = Object.entries(modelNames ?? {}).flatMap(([key, name]) => {
    const separator = key.indexOf(":");
    return separator > 0 && key.slice(0, separator).toLowerCase() === normalizedProvider
      ? [{ id: key.slice(separator + 1).toLowerCase(), name }]
      : [];
  });
  return configured.find((model) => model.id === normalizedResponse)?.name
    ?? configured.find((model) => normalizedResponse.endsWith(`/${model.id}`))?.name
    ?? Object.entries(modelNames ?? {}).find(([key]) => key.toLowerCase() === normalizedResponse)?.[1]
    ?? `${provider}/${responseModel}`;
}

function formatTime(ts?: number): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  return `${date} ${time}`;
}

export function replaceUserMessageText(message: UserMessage, text: string): UserMessage {
  if (typeof message.content === "string") return { ...message, content: text };

  const content: Array<TextContent | ImageContent> = [];
  let replaced = false;
  for (const block of message.content) {
    if (block.type !== "text") {
      content.push(block);
      continue;
    }
    if (!replaced) {
      content.push({ ...block, text });
      replaced = true;
    }
  }
  if (!replaced) content.unshift({ type: "text", text });
  return { ...message, content };
}

function haveSameRelevantToolResults(
  message: AgentMessage,
  previous: Map<string, ToolResultMessage> | undefined,
  next: Map<string, ToolResultMessage> | undefined,
): boolean {
  if (previous === next || message.role !== "assistant") return true;
  for (const block of (message as AssistantMessage).content ?? []) {
    if (block.type === "toolCall" && previous?.get(block.toolCallId) !== next?.get(block.toolCallId)) {
      return false;
    }
  }
  return true;
}

export const MessageView = memo(function MessageView({ message, isStreaming, toolResults, modelNames, fallbackModel, cwd, onOpenFile, entryId, searchBlock, onFork, forking, onNavigate, onEditContent, showTimestamp, prevTimestamp, sessionId, writtenFiles }: Props) {
  if (message.role === "user") {
    return <UserMessageView message={message as UserMessage} cwd={cwd} onOpenFile={onOpenFile} entryId={entryId} onFork={onFork} forking={forking} onNavigate={onNavigate} onEditContent={onEditContent} />;
  }
  if (message.role === "assistant") {
    return <AssistantMessageView message={message as AssistantMessage} isStreaming={isStreaming} toolResults={toolResults} modelNames={modelNames} fallbackModel={fallbackModel} cwd={cwd} onOpenFile={onOpenFile} showTimestamp={showTimestamp} prevTimestamp={prevTimestamp} sessionId={sessionId} entryId={entryId} searchBlock={searchBlock} writtenFiles={writtenFiles} />;
  }
  if (message.role === "toolResult") {
    // Rendered inline under its toolCall — skip standalone rendering if paired
    return null;
  }
  if (message.role === "custom") {
    if ((message as CustomMessage).customType === "compaction") {
      return <CompactionMessageView message={message as CustomMessage} />;
    }
    return <CustomMessageView message={message as CustomMessage} cwd={cwd} onOpenFile={onOpenFile} />;
  }
  if (message.role === "bashExecution") {
    return <BashExecutionView message={message as BashExecutionMessage} sessionId={sessionId} />;
  }
  return null;
}, (prev, next) => {
  return prev.message === next.message
    && prev.isStreaming === next.isStreaming
    && haveSameRelevantToolResults(prev.message, prev.toolResults, next.toolResults)
    && prev.modelNames === next.modelNames
    && prev.cwd === next.cwd
    && prev.onOpenFile === next.onOpenFile
    && prev.entryId === next.entryId
    && prev.searchBlock === next.searchBlock
    && prev.onFork === next.onFork
    && prev.forking === next.forking
    && prev.onNavigate === next.onNavigate
    && prev.onEditContent === next.onEditContent
    && prev.showTimestamp === next.showTimestamp
    && prev.prevTimestamp === next.prevTimestamp
    && prev.writtenFiles === next.writtenFiles
    && prev.sessionId === next.sessionId;
});

function UserMessageView({ message, cwd, onOpenFile, entryId, onFork, forking, onNavigate, onEditContent }: {
  message: UserMessage;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
  entryId?: string;
  onFork?: (entryId: string) => void;
  forking?: boolean;
  onNavigate?: (entryId: string) => Promise<boolean>;
  onEditContent?: (message: UserMessage) => void;
}) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const content =
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((b): b is TextContent => b.type === "text")
          .map((b) => b.text)
          .join("\n");

  const imageBlocks: ImageContent[] =
    typeof message.content === "string"
      ? []
      : message.content.filter((b): b is ImageContent => b.type === "image");

  const commandText = skillExpansionToCommand(content);
  const commandSeparator = commandText?.search(/\s/) ?? -1;
  const commandName = commandText
    ? commandSeparator === -1 ? commandText : commandText.slice(0, commandSeparator)
    : "";
  const commandArgs = commandText && commandSeparator !== -1
    ? commandText.slice(commandSeparator + 1)
    : "";

  const time = formatTime(message.timestamp);
  const canFork = !!entryId && !!onFork;
  const copyTarget = commandText ?? content;
  const editTarget = commandText ? replaceUserMessageText(message, commandText) : message;

  const imageBlocksNode = imageBlocks.length > 0 && (
    <div className={`flex flex-wrap gap-1.5 ${content ? "mb-2" : ""}`}>
      {imageBlocks.map((img, i) => {
        // lib/types.ts ImageContent uses {source:{type,data,media_type,url}}
        // pi-ai on-disk format uses flat {data, mimeType} — handle both
        const flat = img as unknown as { data?: string; mimeType?: string };
        const src = img.source
          ? img.source.type === "base64"
            ? `data:${img.source.media_type};base64,${img.source.data}`
            : img.source.url ?? ""
          : flat.data
            ? `data:${flat.mimeType};base64,${flat.data}`
            : "";
        return (
          <ImagePreview key={i} src={src}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="block max-h-60 max-w-60 rounded-md border border-primary/15 object-contain"
            />
          </ImagePreview>
        );
      })}
    </div>
  );
  const canNavigate = !!entryId && !!onNavigate;

  const copyContent = () => {
    copyText(copyTarget).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className="mb-4 flex flex-col items-end"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex max-w-[85%] items-end gap-1.5">
        <div
          className="max-h-[300px] flex-1 min-w-0 overflow-y-auto rounded-xl border border-primary/20 bg-muted px-3 py-2 text-[calc(14px+var(--chat-font-size-offset,0px))] leading-relaxed break-words text-foreground"
        >
          {commandText ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              {imageBlocksNode}
              <div className="flex flex-wrap items-start gap-2">
                <button
                  onClick={() => setExpanded((prev) => !prev)}
                  title={expanded ? t("i18n.collapse") : t("i18n.expand")}
                  aria-expanded={expanded}
                  className="flex shrink-0 items-center gap-1.5 border-none bg-transparent p-0 text-left font-mono text-[calc(13px+var(--chat-font-size-offset,0px))] text-primary"
                >
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                    {commandName}
                  </span>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`shrink-0 opacity-75 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {commandArgs && (
                  <span className="min-w-0 flex-1 text-[calc(14px+var(--chat-font-size-offset,0px))] leading-relaxed whitespace-pre-wrap break-words text-foreground">
                    {commandArgs}
                  </span>
                )}
              </div>
              {expanded && (
                <MarkdownBody className="markdown-user-message" cwd={cwd} onOpenFile={onOpenFile}>{content}</MarkdownBody>
              )}
            </div>
          ) : (
          <>
          {imageBlocksNode}
          {content && <SafeMarkdownBody className="markdown-user-message" cwd={cwd} onOpenFile={onOpenFile}>{content}</SafeMarkdownBody>}
          </>
          )}
        </div>

      </div>

      {/* Bottom row: action buttons + timestamp */}
      {(time || canFork || canNavigate || true) && (
        <div className="mt-[3px] flex items-center justify-end gap-1.5">
          <div className={`flex gap-[3px] transition-opacity duration-100 ${hovered ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <button
              onClick={copyContent}
               title={t("i18n.copyMessage")}
              className={`flex h-[22px] items-center gap-1 rounded-[5px] border-none bg-none px-2 text-[11px] font-normal whitespace-nowrap transition-colors ${copied ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
            >
              {copied ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
               {copied ? t("i18n.copied") : t("i18n.copy")}
            </button>
          </div>
          {(canFork || canNavigate) && (
            <div className={`flex gap-[3px] transition-opacity duration-100 ${(hovered || forking) ? "opacity-100" : "pointer-events-none opacity-0"}`}>
              {canNavigate && (
                <button
                  onClick={() => void onNavigate!(entryId!).then((navigated) => {
                    if (navigated) onEditContent?.(editTarget);
                  })}
                   title={t("i18n.editFromHereTitle")}
                  className="flex h-[22px] items-center gap-1 rounded-[5px] border-none bg-none px-2 text-[11px] font-normal whitespace-nowrap text-muted-foreground transition-colors hover:text-primary"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 10 20 15 15 20" />
                    <path d="M4 4v7a4 4 0 0 0 4 4h12" />
                  </svg>
                   {t("i18n.editFromHere")}
                </button>
              )}
              {canFork && (
                <button
                  onClick={() => { onFork!(entryId!); }}
                  disabled={forking}
                   title={forking ? t("i18n.creatingSession") : t("i18n.newSessionTitle")}
                  className={`flex h-[22px] items-center gap-1 rounded-[5px] border-none bg-none px-2 text-[11px] font-normal whitespace-nowrap transition-colors ${forking ? "cursor-not-allowed text-primary" : "text-muted-foreground hover:text-primary"}`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                   {forking ? t("i18n.creating") : t("i18n.newSession")}
                </button>
              )}
            </div>
          )}
          {time && <span className="text-[10px] text-muted-foreground">{time}</span>}
        </div>
      )}
    </div>
  );
}

function AssistantMessageView({
  message,
  isStreaming,
  toolResults,
  modelNames,
  fallbackModel,
  cwd,
  onOpenFile,
  showTimestamp,
  prevTimestamp,
  sessionId,
  entryId,
  searchBlock,
  writtenFiles,
}: {
  message: AssistantMessage;
  isStreaming?: boolean;
  toolResults?: Map<string, ToolResultMessage>;
  modelNames?: Record<string, string>;
  fallbackModel?: { provider: string; modelId: string } | null;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
  showTimestamp?: boolean;
  prevTimestamp?: number;
  sessionId?: string;
  entryId?: string;
  searchBlock?: AssistantContentBlock;
  writtenFiles?: WrittenFile[];
}) {
  const { t } = useI18n();
  const time = showTimestamp ? formatTime(message.timestamp) : null;
  const blockItems = useMemo(() => (message.content ?? [])
    .map((block, originalIndex) => ({ block, originalIndex }))
    .filter(({ block }) => !isEmptyThinkingBlock(block, { isStreaming })), [message.content, isStreaming]);
  const blocks = useMemo(() => blockItems.map(({ block }) => block), [blockItems]);
  const providerError = getAssistantErrorMessage(message, { isStreaming });
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const blockItemsRef = useRef(blockItems);
  blockItemsRef.current = blockItems;
  const tokenEstimateCacheRef = useRef<Map<number, TokenEstimateCacheEntry>>(new Map());
  const estimatedTokens = useMemo(() => {
    if (!isStreaming) {
      tokenEstimateCacheRef.current = new Map();
      return 0;
    }
    const nextCache = new Map<number, TokenEstimateCacheEntry>();
    let total = 0;
    for (const { block, originalIndex } of blockItems) {
      const text = getTokenEstimateText(block);
      if (text === null) continue;
      const tokens = estimateUpdatedTokens(tokenEstimateCacheRef.current.get(originalIndex), text);
      nextCache.set(originalIndex, { text, tokens });
      total += tokens;
    }
    tokenEstimateCacheRef.current = nextCache;
    return total;
  }, [blockItems, isStreaming]);

  // Streaming-based timing for thinking blocks
  const blockStartTimesRef = useRef<Map<number, number>>(new Map());
  const [streamingDurations, setStreamingDurations] = useState<Map<number, number>>(new Map());

  // Thinking duration derived from file timestamps: time from prev message end to this message end
  // This is the total generation time (thinking + any text before first tool call)
  const thinkingDurationFromFile = useMemo<number | undefined>(() => {
    if (!message.timestamp || !prevTimestamp) return undefined;
    const secs = Math.round((message.timestamp - prevTimestamp) / 1000);
    return secs > 0 ? secs : undefined;
  }, [message.timestamp, prevTimestamp]);

  // Tool call durations derived from session file timestamps (accurate for completed messages)
  // assistant message timestamp = when generation ended = when tools started running
  // toolResult timestamp = when tool execution finished
  const toolCallDurations = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    if (!toolResults || !message.timestamp) return map;
    for (const [callId, result] of toolResults) {
      if (result.timestamp && message.timestamp) {
        const secs = Math.round((result.timestamp - message.timestamp) / 1000);
        if (secs > 0) map.set(callId, secs);
      }
    }
    return map;
  }, [toolResults, message.timestamp]);

  const textContent = blocks
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const copyContent = () => {
    copyText(textContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  useEffect(() => {
    if (!isStreaming) {
      // Finalise any un-finished thinking block durations on stream end
      const now = new Date().getTime();
      setStreamingDurations((prev: Map<number, number>) => {
        const next = new Map(prev);
        for (const [idx, start] of blockStartTimesRef.current) {
          if (!next.has(idx)) next.set(idx, Math.round((now - start) / 1000));
        }
        return next;
      });
      return;
    }
    const tick = () => {
      const items = blockItemsRef.current;
      const now = Date.now();

      // Record start time for each block the first time we see it
      items.forEach(({ originalIndex }) => {
        if (!blockStartTimesRef.current.has(originalIndex)) blockStartTimesRef.current.set(originalIndex, now);
      });

      // When a non-last block has a successor already started, finalise its duration
      setStreamingDurations((prev: Map<number, number>) => {
        let changed = false;
        const next = new Map(prev);
        for (let i = 0; i < items.length - 1; i++) {
          const originalIndex = items[i].originalIndex;
          const nextOriginalIndex = items[i + 1].originalIndex;
          if (!next.has(originalIndex) && blockStartTimesRef.current.has(originalIndex)) {
            const start = blockStartTimesRef.current.get(originalIndex)!;
            const nextStart = blockStartTimesRef.current.get(nextOriginalIndex) ?? now;
            next.set(originalIndex, Math.round((nextStart - start) / 1000));
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
  }, [isStreaming]);

  if (blocks.length === 0 && !isStreaming && !providerError) return null;

  return (
    <div
      data-message-role="assistant"
      data-entry-id={entryId}
      className="mb-4"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Model label */}
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {(() => {
          const labelProvider = message.provider || fallbackModel?.provider;
          const labelModel = message.model || fallbackModel?.modelId;
          return (
            labelProvider && (
              <span>{getModelDisplayName(labelProvider, labelModel ?? "", modelNames)}</span>
            )
          );
        })()}
        {isStreaming && (() => {
          const est = Math.round(estimatedTokens);
          return (
            <>

              {est > 0 && (
                <span className="flex items-center gap-1 text-foreground" title={t("i18n.estimatedTokens")}>
                  <span className="flex items-center gap-0.5 text-[11px] font-normal">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="1.5" x2="5" y2="8.5" /><polyline points="2 6 5 8.5 8 6" />
                    </svg>
                    {est}
                  </span>
                </span>
              )}
            </>
          );
        })()}
      </div>

      <div className="flex flex-col gap-2">
        {blockItems.map(({ block, originalIndex }) => (
          <BlockView key={`${entryId ?? "stream"}-${originalIndex}`} block={block} searchTarget={block === searchBlock} toolResults={toolResults} isStreaming={isStreaming} streamingDuration={streamingDurations.get(originalIndex) ?? (block.type === "thinking" ? thinkingDurationFromFile : undefined)} toolCallDurations={toolCallDurations} cwd={cwd} onOpenFile={onOpenFile} sessionId={sessionId} entryId={entryId} blockIndex={originalIndex} />
        ))}
      </div>

      {providerError && (
        <div
          role="alert"
          className={`${blocks.length > 0 ? "mt-2" : "mt-0"} rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-destructive`}
        >
          Error: {providerError}
        </div>
      )}

      {writtenFiles && writtenFiles.length > 0 && (
        <TurnWrittenFiles files={writtenFiles} onOpenFile={onOpenFile} />
      )}

      <div className="mt-1 flex items-center gap-2">
        {message.usage && !isStreaming && (
          <div className="text-[11px] text-muted-foreground">
            {formatUsage(message.usage)}
          </div>
        )}
        {textContent && !isStreaming && (
          <button
            onClick={copyContent}
             title={t("i18n.copyMessage")}
            className={`flex h-[22px] items-center gap-1 rounded-[5px] border-none bg-none px-2 text-[11px] font-normal whitespace-nowrap transition-opacity transition-colors duration-100 ${hovered ? "opacity-100" : "pointer-events-none opacity-0"} ${copied ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
          >
            {copied ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
             {copied ? t("i18n.copied") : t("i18n.copy")}
          </button>
        )}
        {time && !isStreaming && (
          <span className="ml-auto text-[10px] text-muted-foreground">{time}</span>
        )}
      </div>
    </div>
  );
}

function BlockView({ block, searchTarget, toolResults, isStreaming, streamingDuration, toolCallDurations, cwd, onOpenFile, sessionId, entryId, blockIndex }: { block: AssistantContentBlock; searchTarget?: boolean; toolResults?: Map<string, ToolResultMessage>; isStreaming?: boolean; streamingDuration?: number; toolCallDurations?: Map<string, number>; cwd?: string; onOpenFile?: (filePath: string) => void; sessionId?: string; entryId?: string; blockIndex: number }) {
  if (block.type === "text") {
    return <div data-message-text data-search-target={searchTarget || undefined}><TextBlock block={block as TextContent} isStreaming={isStreaming} cwd={cwd} onOpenFile={onOpenFile} /></div>;
  }
  if (block.type === "thinking") {
    return <ThinkingBlock block={block as ThinkingContent} duration={streamingDuration} sessionId={sessionId} entryId={entryId} blockIndex={blockIndex} />;
  }
  if (block.type === "toolCall") {
    const tc = block as ToolCallContent;
    const result = toolResults?.get(tc.toolCallId);
    const duration = toolCallDurations?.get(tc.toolCallId);
    return <ToolCallBlock block={tc} result={result} duration={duration} />;
  }
  return null;
}

function TextBlock({ block, isStreaming, cwd, onOpenFile }: { block: TextContent; isStreaming?: boolean; cwd?: string; onOpenFile?: (filePath: string) => void }) {
  return <SafeMarkdownBody isStreaming={isStreaming} cwd={cwd} onOpenFile={onOpenFile}>{block.text}</SafeMarkdownBody>;
}

export function ThinkingBlock({ block, duration, sessionId, entryId, blockIndex }: {
  block: ThinkingContent;
  duration?: number;
  sessionId?: string;
  entryId?: string;
  blockIndex: number;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(isThinkingExpandedByDefault);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tRef = useRef(t);
  tRef.current = t;
  // Deferred history blocks carry a first-line preview instead of the full text, so the tail falls
  // back to it and the chip reads the same for a block that has not been loaded yet.
  const preview = getThinkingPreview(block.thinking);
  const tail = getThinkingTail(block.thinking) || preview;
  const tailRef = useRef<HTMLSpanElement>(null);

  // The chip is one line tall: keep its end — the newest characters — in view instead of letting a
  // long line sit there showing the words it started with.
  useEffect(() => {
    const element = tailRef.current;
    if (element && !expanded) element.scrollLeft = element.scrollWidth;
  }, [tail, expanded]);

  // Keep already-mounted blocks in sync when the preference changes.
  useEffect(() => {
    const onChange = () => setExpanded(isThinkingExpandedByDefault());
    window.addEventListener(THINKING_EXPANDED_EVENT, onChange);
    return () => window.removeEventListener(THINKING_EXPANDED_EVENT, onChange);
  }, []);

  // Load deferred history content whenever the block is expanded.
  // loadThinkingContent() memoizes in-flight promises and drops failed ones
  // from its cache, so re-running this effect is cheap and a failed load can
  // be retried by collapsing and expanding the block again.
  useEffect(() => {
    if (!expanded || !block.deferred || content !== null) return;
    if (!sessionId || !entryId) {
      setError(tRef.current("i18n.thinkingUnavailable"));
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadThinkingContent(sessionId, entryId, blockIndex)
      .then((value) => {
        if (!cancelled) {
          setContent(value);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, block.deferred, content, sessionId, entryId, blockIndex]);

  return (
    <div className="flex min-w-0 items-start gap-1.5 rounded-[7px] border border-border bg-background px-2.5 py-1.5 font-mono text-[calc(11px+var(--chat-font-size-offset,0px))] leading-relaxed">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`${t("i18n.thinking")}${tail ? `: ${tail}` : ""}`}
        title={t("i18n.thinking")}
        onClick={() => setExpanded((v) => !v)}
        className={`inline-flex min-h-[1.5em] min-w-0 items-center gap-1.5 border-none bg-transparent p-0 text-left font-inherit text-muted-foreground ${expanded ? "w-3.5 shrink-0" : "w-full shrink"}`}
      >
        <ThinkingIcon active={expanded} />
        {!expanded && (
          <span ref={tailRef} className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
            {tail ? <ReactMarkdown allowedElements={[]} unwrapDisallowed skipHtml>{tail}</ReactMarkdown> : "..."}
          </span>
        )}
      </button>
      {expanded && (
        <div className={`min-w-0 flex-1 overflow-wrap-anywhere whitespace-pre-wrap ${error ? "text-destructive" : "text-muted-foreground"}`}>
           {loading ? t("i18n.loadingThinking") : error ?? (block.deferred ? content : block.thinking)}
        </div>
      )}
      {duration !== undefined && (
        <span className="shrink-0 text-muted-foreground tabular-nums">{duration}s</span>
      )}
    </div>
  );
}

function ToolCallBlock({ block, result, duration }: { block: ToolCallContent; result?: ToolResultMessage; duration?: number }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  // Custom tool renderers (preset UI components — see components/tool-renderers/registry.ts)
  // take over the block entirely when one matches. Nothing registers at startup, so the
  // default body below renders unchanged for every built-in tool.
  const CustomRenderer = resolveToolRenderer(block.toolName);
  if (CustomRenderer) {
    return createElement(CustomRenderer, { block, result, duration });
  }
  const inputStr = getToolCallInputText(block);
  const isStreamingInput = block.rawInput !== undefined;
  const isEditTool = isEditToolName(block.toolName);
  // `jun_code` is our own code-mode tool and runs TypeScript, so expanding a
  // call shows the code rather than the argument JSON — see lib/tool-names.ts.
  // Streamed input is partial JSON, so it waits.
  const junCode = !isStreamingInput && isJunCodeToolName(block.toolName) &&
      typeof block.input.code === "string" && block.input.code
    ? block.input.code
    : null;
  const resultDiff = result && !result.isError ? getResultDiff(result) : null;

  // Result display
  const resultText = result
    ? result.content.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("\n")
    : null;
  const resultImages = getMessageImages(result?.content ?? []);
  const resultIsEmpty = resultText === null ? false : (resultText.trim() === "(no output)" || resultText.trim() === "");
  const isError = result?.isError ?? false;
  // The `pi-subagents` package's own Agent tool result — the only sub-agent card shape left
  // (docs/adr/0006). It carries no session id, so the card links nowhere.
  const packageAgent = isPiSubagentsAgentDetails(result?.details) ? result.details : null;

  return (
    <div
      className={`overflow-hidden rounded-[7px] text-xs ${isError ? "border border-destructive/45 bg-destructive/5" : "border border-success/25 bg-success/4"}`}
    >
      {/* ── Tool call header ── */}
      <div className="flex min-w-0 items-stretch">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 border-none bg-none px-2.5 py-1.5 text-left text-xs text-muted-foreground"
        >
          <span className={`shrink-0 font-mono text-[11px] font-semibold ${isError ? "text-destructive" : "text-success"}`}>
            {block.toolName}
          </span>
          <span className="min-w-0 flex-1 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-nowrap text-muted-foreground">
            {isStreamingInput ? t("chat.generatingToolInput") : getToolPreview(block)}
          </span>
          {duration !== undefined && (
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{duration}s</span>
          )}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-muted-foreground transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}>
            <polyline points="2 3.5 5 6.5 8 3.5" />
          </svg>
        </button>
      </div>

      {/* ── The pi-subagents package's run, at a glance ── */}
      {packageAgent && (
        <div
          data-testid="pi-subagents-agent-card"
          className="flex flex-wrap items-center gap-2 border-t border-border bg-foreground/4 px-2.5 py-[5px] text-[11px] leading-tight text-muted-foreground tabular-nums"
        >
          <span data-testid="pi-subagents-agent-status" className={`font-semibold ${packageAgentStatusColor(packageAgent.status)}`}>
            {t(`piSubagents.status.${packageAgentStatusKey(packageAgent.status)}`)}
          </span>
          {packageAgent.modelName && <span>{packageAgent.modelName}</span>}
          {typeof packageAgent.turnCount === "number" && (
            <span>
              {packageAgent.turnCount}
              {typeof packageAgent.maxTurns === "number" && packageAgent.maxTurns > 0 ? `/${packageAgent.maxTurns}` : ""}
              {" "}{t("piSubagents.turns")}
            </span>
          )}
          <span>{packageAgent.toolUses} {t("piSubagents.tools")}</span>
          {packageAgent.tokens && <span>{packageAgent.tokens}</span>}
          {typeof packageAgent.durationMs === "number" && <span>{formatPackageDuration(packageAgent.durationMs)}</span>}
          {typeof packageAgent.cost === "number" && packageAgent.cost > 0 && <span>${packageAgent.cost.toFixed(4)}</span>}
          {packageAgent.error && <span className="text-destructive">{packageAgent.error}</span>}
        </div>
      )}

      {/* ── Expanded: input args ── */}
      {expanded && (isStreamingInput || !isEditTool) && (
        junCode ? (
          <CodeBlock code={junCode} lang="typescript" />
        ) : (
          <pre
            className={`m-0 overflow-auto bg-foreground/4 px-2.5 py-2 text-[calc(12px+var(--chat-font-size-offset,0px))] leading-relaxed break-all whitespace-pre-wrap text-muted-foreground ${isError ? "border-t border-destructive/25" : "border-t border-success/20"}`}
          >
            {inputStr}
          </pre>
        )
      )}

      {/* ── Paired result — only shown when expanded ── */}
      {expanded && result && (
        resultDiff ? (
          <PairedDiffResult
            diff={resultDiff}
          />
        ) : (
          <PairedResult
            text={resultText ?? ""}
            images={resultImages}
            isEmpty={resultIsEmpty}
            isError={isError}
          />
        )
      )}
    </div>
  );
}

interface ResultDiff {
  text: string;
}

function PairedDiffResult({ diff }: {
  diff: ResultDiff;
}) {
  return (
    <div className="border-t border-success/15 bg-background">
      <SplitPatchView text={diff.text} />
    </div>
  );
}

function SplitPatchView({ text }: { text: string }) {
  const { t } = useI18n();
  const files = useMemo(() => parseUnifiedPatch(text), [text]);
  if (!files) return <PatchTextView text={text} />;
  const showFileHeaders = files.length > 1;

  return (
    <div className="max-h-[560px] overflow-x-hidden overflow-y-auto bg-background">
      {files.map((file, fileIndex) => (
        <div
          key={fileIndex}
          className={`min-w-0 font-mono text-[calc(12px+var(--chat-font-size-offset,0px))] leading-relaxed ${fileIndex === 0 ? "border-t-0" : "border-t border-border"}`}
        >
          {showFileHeaders && (
            <div className="sticky top-0 z-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-b border-border bg-sidebar">
               <SplitDiffHeader title={file.oldPath || t("i18n.before")} side="left" />
               <SplitDiffHeader title={file.newPath || t("i18n.after")} side="right" />
            </div>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {file.rows.map((row, rowIndex) => {
              if (row.type === "hunk") {
                return null;
              }

              return (
                <div key={rowIndex} className="contents">
                  <SplitDiffCellView cell={row.left} side="left" />
                  <SplitDiffCellView cell={row.right} side="right" />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SplitDiffHeader({ title, side }: { title: string; side: "left" | "right" }) {
  return (
    <div
      title={title}
      className={`overflow-hidden px-2.5 py-[5px] text-ellipsis whitespace-nowrap text-muted-foreground ${side === "left" ? "border-r border-border" : ""}`}
    >
      {title}
    </div>
  );
}

function SplitDiffCellView({ cell, side }: { cell: SplitDiffCell; side: "left" | "right" }) {
  const bgClass =
    cell.type === "added"
      ? "bg-success/12"
      : cell.type === "removed"
      ? "bg-destructive/13"
      : cell.type === "empty"
      ? "bg-foreground/4"
      : "bg-transparent";
  const marker =
    cell.type === "added" ? "+" : cell.type === "removed" ? "-" : " ";
  const markerClass =
    cell.type === "added" ? "text-success" : cell.type === "removed" ? "text-destructive" : "text-muted-foreground";

  return (
    <div
      className={`flex min-w-0 ${bgClass} ${side === "left" ? "border-r border-border" : ""}`}
    >
      <span className="w-[42px] shrink-0 border-r border-border bg-sidebar px-1.5 text-right text-muted-foreground select-none">
        {cell.lineNo ?? ""}
      </span>
      <span
        className={`w-[18px] shrink-0 px-[5px] select-none ${markerClass} ${cell.type === "context" || cell.type === "empty" ? "font-normal" : "font-bold"}`}
      >
        {marker}
      </span>
      <span
        className={`min-w-0 flex-1 py-0 pr-2.5 pl-0 overflow-wrap-anywhere whitespace-pre-wrap ${cell.type === "empty" ? "text-muted-foreground" : "text-foreground"}`}
      >
        {cell.text || "\u00a0"}
      </span>
    </div>
  );
}

function PatchTextView({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);

  return (
    <div className="min-w-0 max-h-[520px] overflow-x-hidden overflow-y-auto font-mono text-[calc(12px+var(--chat-font-size-offset,0px))] leading-relaxed">
      {lines.map((line, i) => {
        const kind =
          line.startsWith("@@") ? "hunk" :
          line.startsWith("+") && !line.startsWith("+++") ? "added" :
          line.startsWith("-") && !line.startsWith("---") ? "removed" :
          "context";
        const bgClass =
          kind === "added" ? "bg-success/12" :
          kind === "removed" ? "bg-destructive/13" :
          kind === "hunk" ? "bg-primary/12" :
          "bg-transparent";
        const borderClass =
          kind === "added" ? "border-l-3 border-success" :
          kind === "removed" ? "border-l-3 border-destructive" :
          kind === "hunk" ? "border-l-3 border-primary" :
          "border-l-3 border-transparent";
        const textClass =
          kind === "added" ? "text-success" :
          kind === "removed" ? "text-destructive" :
          kind === "hunk" ? "text-primary" :
          "text-foreground";

        return (
          <div
            key={i}
            className={`flex ${bgClass} ${borderClass}`}
          >
            <span className="w-12 shrink-0 border-r border-border bg-sidebar px-2 text-right text-muted-foreground select-none">
              {i + 1}
            </span>
            <span className={`overflow-wrap-anywhere px-2.5 whitespace-pre-wrap ${textClass}`}>
              {line || "\u00a0"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function getResultDiff(result: ToolResultMessage): ResultDiff | null {
  const details = (result as ToolResultMessage & { details?: unknown }).details;
  if (!isRecord(details)) return null;

  const patch = typeof details.patch === "string" ? details.patch : null;
  if (patch) return { text: patch };

  const diff = typeof details.diff === "string" ? details.diff : null;
  if (diff) return { text: diff };

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function PairedResult({ text, images, isEmpty, isError }: {
  text: string;
  images: ImageContent[];
  isEmpty: boolean;
  isError: boolean;
}) {
  const { t } = useI18n();
  const showText = !isEmpty || images.length === 0;
  return (
    <div
      className={`border-t ${isError ? "border-destructive/30 bg-destructive/4" : "border-success/15 bg-foreground/4"}`}
    >
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 bg-background p-2.5">
          {images.map((image, index) => {
            const src = imageSource(image);
            if (!src) return null;
            return (
              <ImagePreview
                key={`${src}-${index}`}
                src={src}
                className="max-w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  className="block max-h-[520px] max-w-[min(100%,720px)] rounded-md border border-border object-contain"
                />
              </ImagePreview>
            );
          })}
        </div>
      )}
      {showText && (
        <pre
          className={`m-0 max-h-[400px] overflow-auto bg-background px-2.5 py-2 text-[calc(12px+var(--chat-font-size-offset,0px))] leading-relaxed break-all whitespace-pre-wrap ${isEmpty ? "italic opacity-60" : "not-italic opacity-100"} ${isError ? "text-destructive" : (isEmpty ? "text-muted-foreground" : "text-muted-foreground")}`}
        >
           {isEmpty ? t("i18n.noOutput") : text}
        </pre>
      )}
    </div>
  );
}

function CompactionMessageView({ message }: { message: CustomMessage }) {
  const { t } = useI18n();
  const summary = getMessageText(message.content);
  const parsedSummary = useMemo(() => parseCompactionSummary(summary), [summary]);
  const time = formatTime(message.timestamp);

  return (
    <div className="mb-4">
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border bg-sidebar px-2.5 py-1.5 text-muted-foreground">
          <span className="font-mono text-[11px] font-semibold">
            compaction
          </span>
          {time && <span className="ml-auto text-[10px] text-muted-foreground">{time}</span>}
        </div>

        <div className="px-[13px] pt-[11px] pb-3">
          <div className="text-[calc(15px+var(--chat-font-size-offset,0px))] leading-snug font-bold text-foreground">
             {t("i18n.conversationCompacted")}
          </div>
          <div className="mt-[3px] mb-2.5 text-[calc(14px+var(--chat-font-size-offset,0px))] leading-relaxed text-foreground">
             {t("i18n.compactionDescription")}
          </div>
          {parsedSummary.body ? (
            <MarkdownBody className="markdown-compaction-message">{parsedSummary.body}</MarkdownBody>
          ) : (
             <span className="text-xs text-muted-foreground">{t("i18n.noSummary")}</span>
          )}
          <CompactionFileMetadata readFiles={parsedSummary.readFiles} modifiedFiles={parsedSummary.modifiedFiles} />
        </div>
      </div>
    </div>
  );
}

function CompactionFileMetadata({ readFiles, modifiedFiles }: { readFiles: string[]; modifiedFiles: string[] }) {
  const { t } = useI18n();
  const total = readFiles.length + modifiedFiles.length;
  if (total === 0) return null;

  const parts = [];
  if (readFiles.length > 0) parts.push(`${readFiles.length} read`);
  if (modifiedFiles.length > 0) parts.push(`${modifiedFiles.length} modified`);

  return (
    <details className="mt-2.5 border-t border-border pt-2 text-xs text-muted-foreground">
       <summary className="cursor-pointer leading-snug font-semibold">{t("i18n.fileContext", { details: parts.join(", ") })}</summary>
       {modifiedFiles.length > 0 && <CompactionFileList title={t("i18n.modifiedFiles")} files={modifiedFiles} />}
       {readFiles.length > 0 && <CompactionFileList title={t("i18n.readFiles")} files={readFiles} />}
    </details>
  );
}

function CompactionFileList({ title, files }: { title: string; files: string[] }) {
  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] font-semibold text-foreground">{title}</div>
      <ul className="m-0 max-h-[180px] list-none overflow-auto rounded-md border border-border bg-sidebar px-2 py-[7px] font-mono text-[11px] leading-snug [&_li]:overflow-wrap-anywhere [&_li+li]:mt-[3px]">
        {files.map((file) => (
          <li key={file}>{file}</li>
        ))}
      </ul>
    </div>
  );
}

function CustomMessageView({ message, cwd, onOpenFile }: { message: CustomMessage; cwd?: string; onOpenFile?: (filePath: string) => void }) {
  const { t } = useI18n();
  const isHiddenDisplay = message.display === false;
  const [contentExpanded, setContentExpanded] = useState(!isHiddenDisplay);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = getMessageText(message.content);
  const images = getMessageImages(message.content);
  const hasDetails = message.details !== undefined;
  const detailsText = hasDetails ? safeJson(message.details) : "";
  const title = formatCustomType(message.customType);
  const time = formatTime(message.timestamp);

  const copyContent = () => {
    copyText(text || detailsText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="mb-4">
      <div
        className={`overflow-hidden rounded-lg border border-border ${isHiddenDisplay ? "bg-foreground/4" : "bg-background"} ${isHiddenDisplay && !contentExpanded ? "opacity-[0.82]" : "opacity-100"}`}
      >
        <div className="flex items-center gap-2 border-b border-border bg-sidebar px-2.5 py-1.5 text-xs text-muted-foreground">
          <span className="font-mono text-[11px] font-semibold text-muted-foreground">
            {title}
          </span>
           {isHiddenDisplay && <span className="text-[11px] text-muted-foreground">{t("i18n.hiddenExtensionMessage")}</span>}
          {time && <span className="ml-auto text-[10px] text-muted-foreground">{time}</span>}
        </div>

        {contentExpanded ? (
          <div className="px-[9px] py-1.5">
            {images.length > 0 && (
              <div className={`flex flex-wrap gap-1.5 ${text ? "mb-2" : ""}`}>
                {images.map((img, i) => {
                  const src = imageSource(img);
                  if (!src) return null;
                  return (
                    <ImagePreview key={i} src={src}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        className="block max-h-60 max-w-60 rounded-md border border-border object-contain"
                      />
                    </ImagePreview>
                  );
                })}
              </div>
            )}
             {text ? <MarkdownBody className="markdown-custom-message" cwd={cwd} onOpenFile={onOpenFile}>{text}</MarkdownBody> : <span className="text-xs text-muted-foreground">{t("i18n.noMessage")}</span>}
          </div>
        ) : (
          <button
            onClick={() => setContentExpanded(true)}
            className="block w-full border-none bg-transparent px-2.5 py-2 text-left text-xs text-muted-foreground"
          >
             {text ? previewText(text) : t("i18n.showExtensionMessage")}
          </button>
        )}

        <div className="flex items-center gap-2 border-t border-border bg-foreground/4 px-[9px] py-1">
          {text || detailsText ? (
            <button
              onClick={copyContent}
              className={`border-none bg-none px-[7px] py-[3px] text-[11px] ${copied ? "text-primary" : "text-muted-foreground"}`}
            >
               {copied ? t("i18n.copied") : t("i18n.copy")}
            </button>
          ) : null}
          {(hasDetails || isHiddenDisplay) && (
            <button
              onClick={() => {
                if (isHiddenDisplay) setContentExpanded((v) => !v);
                else setDetailsExpanded((v) => !v);
              }}
              className="ml-auto border-none bg-none px-[7px] py-[3px] text-[11px] text-muted-foreground"
            >
              {isHiddenDisplay
                 ? (contentExpanded ? t("i18n.collapse") : t("i18n.expand"))
                 : (detailsExpanded ? t("i18n.hideDetails") : t("i18n.showDetails"))}
            </button>
          )}
        </div>

        {hasDetails && ((isHiddenDisplay && contentExpanded) || (!isHiddenDisplay && detailsExpanded)) && (
          <pre
            className="m-0 max-h-[360px] overflow-auto border-t border-border bg-background px-2.5 py-[9px] font-mono text-[calc(12px+var(--chat-font-size-offset,0px))] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground"
          >
            {detailsText}
          </pre>
        )}
      </div>
    </div>
  );
}

function getMessageText(content: CustomMessage["content"] | UserMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function getMessageImages(content: CustomMessage["content"] | UserMessage["content"]): ImageContent[] {
  if (typeof content === "string") return [];
  return content.filter((b): b is ImageContent => b.type === "image");
}

function imageSource(img: ImageContent): string {
  const flat = img as unknown as { data?: string; mimeType?: string };
  if (img.source) {
    return img.source.type === "base64"
      ? `data:${img.source.media_type};base64,${img.source.data}`
      : img.source.url ?? "";
  }
  return flat.data ? `data:${flat.mimeType};base64,${flat.data}` : "";
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function getToolCallInputText(block: ToolCallContent): string {
  return block.rawInput ?? JSON.stringify(block.input, null, 2);
}

function formatCustomType(type: string): string {
  return type || "extension";
}

/** Map the package's status vocabulary onto the `piSubagents.status.*` keys. */
function packageAgentStatusKey(status: string): string {
  switch (status) {
    case "queued": return "starting";
    case "completed": return "completed";
    case "steered": return "steered";
    case "aborted": return "aborted";
    case "stopped": return "stopped";
    case "error":
    case "failed":
      return "error";
    case "running":
    case "background":
      return "running";
    default: return "unknown";
  }
}

function packageAgentStatusColor(status: string): string {
  switch (packageAgentStatusKey(status)) {
    case "running":
    case "steered":
    case "starting":
      return "text-primary";
    case "completed": return "text-success";
    case "error": return "text-destructive";
    case "aborted":
    case "stopped":
      return "text-warning";
    default: return "text-muted-foreground";
  }
}

/** Compact duration for the run strip: 850ms, 12s, 3m 05s, 1h 04m. */
function formatPackageDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function previewText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "Show extension message";
  return normalized.length > 140 ? `${normalized.slice(0, 140)}...` : normalized;
}


function getToolPreview(block: ToolCallContent): string {
  const input = block.input;
  if (!input || typeof input !== "object") return "";
  const keys = Object.keys(input);
  if (keys.length === 0) return "";

  // Common tool input patterns
  if ("command" in input) return String(input.command).slice(0, 120);
  if ("path" in input) return String(input.path).slice(0, 120);
  if ("file_path" in input) return String(input.file_path).slice(0, 120);
  if ("pattern" in input) return String(input.pattern).slice(0, 120);
  if ("query" in input) return String(input.query).slice(0, 120);

  const first = input[keys[0]];
  return String(first).slice(0, 120);
}

function formatUsage(usage: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: { total: number };
}): string {
  const parts = [];
  if (usage.input) parts.push(`${usage.input.toLocaleString()} in`);
  if (usage.output) parts.push(`${usage.output.toLocaleString()} out`);
  if (usage.cacheRead) parts.push(`${usage.cacheRead.toLocaleString()} cache R`);
  if (usage.cacheWrite) parts.push(`${usage.cacheWrite.toLocaleString()} cache W`);
  if (usage.cost?.total) parts.push(`$${usage.cost.total.toFixed(4)}`);
  return parts.join(" · ");
}

function BashExecutionView({ message, sessionId }: { message: BashExecutionMessage; sessionId?: string }) {
  const [fullOutput, setFullOutput] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [fullError, setFullError] = useState<string | null>(null);

  const isPending = !message.output && message.exitCode === undefined && !message.cancelled;
  const isError = message.cancelled || (message.exitCode !== undefined && message.exitCode !== 0);
  const fullOutputUrl = sessionId && message.fullOutputPath
    ? `/api/agent/${encodeURIComponent(sessionId)}/bash-output?path=${encodeURIComponent(message.fullOutputPath)}`
    : null;
  const showFullButton = message.truncated && fullOutputUrl && fullOutput === null;
  const displayOutput = fullOutput ?? message.output;

  async function loadFullOutput() {
    if (!fullOutputUrl) return;
    setLoadingFull(true);
    setFullError(null);
    try {
      const res = await fetch(fullOutputUrl);
      const d = await res.json() as { success?: boolean; data?: { output?: string }; error?: string };
      if (d.success) {
        setFullOutput(d.data?.output ?? "");
      } else {
        setFullError(d.error ?? "failed");
      }
    } catch (e) {
      setFullError(String(e));
    } finally {
      setLoadingFull(false);
    }
  }

  // Reuse the existing ToolCallBlock so user-run bash looks identical to an
  // agent-run bash tool call: same header, collapse behavior, result pane.
  // Synthesize an equivalent ToolCallContent + ToolResultMessage pair.
  const toolName = message.excludeFromContext ? "bash (local)" : "bash";
  const block: ToolCallContent = {
    type: "toolCall",
    toolCallId: `bash-${message.timestamp ?? ""}`,
    toolName,
    input: { command: message.command },
  };
  const result: ToolResultMessage | undefined = isPending
    ? undefined
    : {
        role: "toolResult",
        toolCallId: block.toolCallId,
        toolName,
        content: displayOutput ? [{ type: "text", text: displayOutput }] : [],
        isError,
        timestamp: message.timestamp,
      };

  return (
    <div className="my-1.5">
      <ToolCallBlock block={block} result={result} />
      {message.truncated && fullOutputUrl && (
        <div className="-mt-px px-2.5 py-1 text-[11px]">
          {showFullButton && (
            <button
              onClick={loadFullOutput}
              disabled={loadingFull}
              className={`border-none bg-none p-0 text-[11px] text-primary underline ${loadingFull ? "cursor-default" : "cursor-pointer"}`}
            >
              {loadingFull ? "loading…" : "view full output"}
            </button>
          )}
          <a
            href={`${fullOutputUrl}&download=1`}
            className={`text-[11px] text-primary underline ${showFullButton ? "ml-2.5" : "ml-0"}`}
          >
            download full output
          </a>
          {fullError && <span className="ml-1.5 text-[11px] text-muted-foreground">({fullError})</span>}
        </div>
      )}
    </div>
  );
}
