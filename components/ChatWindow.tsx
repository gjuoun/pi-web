"use client";
import { isComposerFocusKey, registerAbortHandler } from "@/hooks/useKeyboardShortcuts";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IconButton } from "@/components/IconButton";
import type { AgentMessage, AssistantContentBlock, AssistantMessage, BashExecutionMessage, BlockingExtensionUiRequest, ExtensionUiRequest, SessionInfo, SessionTreeNode, ToolEntry, ToolResultMessage, UserMessage } from "@/lib/types";
import { normalizeCustomPanelLines } from "@/lib/ansi";
import { asBracketedPaste, toTerminalKeyData } from "@/lib/terminal-input";
import { countToolCallBlocks, getAssistantErrorMessage, getDisplayableAssistantBlocks, isMessageGroupAnchor, splitFinalAssistantBlocks } from "@/lib/message-display";
import { extractTurnWrittenFiles, type WrittenFile } from "@/lib/turn-written-files";
import { setComposerHidden, useChromePreferences } from "@/lib/chrome-preferences";
import { buildQuotedSelection } from "@/lib/quoted-selection";
import { MessageView } from "./MessageView";
import { MarkdownBody } from "./MarkdownBody";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ChatMinimap, useMessageRefs } from "./ChatMinimap";
import { ChatStatusBar } from "./ChatStatusBar";
import { ListPicker, type PickerAnchorRect, type PickerItem } from "./ListPicker";
import { THINKING_LEVEL_DESC_KEYS, thinkingChoicesFor, thinkingLevelAlias } from "@/lib/thinking-levels";
import { ExtensionStatusBar, ExtensionStatusLine } from "./ExtensionStatusBar";
import { AnsiText } from "./AnsiText";
import { useI18n } from "@/hooks/useI18n";
import { useAgentSession, type AgentPhase, type NoticeItem, type ThinkingLevelOption } from "@/hooks/useAgentSession";
import { useDragDrop } from "@/hooks/useDragDrop";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { SessionStatsInfo } from "@/lib/pi-types";
import type { AppUpdateResponse } from "@/lib/api-types";
import { findChatScrollAnchor, type ChatScrollPosition } from "@/lib/chat-scroll-position";
import {
  captureScrollDistance,
  getPromptAnchorSpacerHeight,
  getVisibleRenderWindow,
  isScrollAtTail,
  restoreScrollTop,
  VISIBLE_PAGE_SIZE,
} from "@/lib/chat-lazy-load";

interface Props {
  session: SessionInfo | null;
  searchTarget?: { sessionId: string; entryId: string; blockIndex?: number } | null;
  onSearchTargetHandled?: (target: { sessionId: string; entryId: string }) => void;
  initialScrollPosition?: ChatScrollPosition | null;
  onScrollPositionChange?: (sessionId: string, position: ChatScrollPosition) => void;
  sessionRunning?: boolean;
  newSessionCwd: string | null;
  newSessionDraftKey: string | null;
  onAgentEnd?: () => void;
  onAttentionNeeded?: (request: BlockingExtensionUiRequest) => void;
  onSessionCreated?: (session: SessionInfo, sourceDraftKey: string) => void;
  onSessionForked?: (newSessionId: string) => void;
  modelsRefreshKey?: number;
  chatInputRef?: React.RefObject<ChatInputHandle | null>;
  onBranchDataChange?: (tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => void;
  onSystemPromptChange?: (prompt: string | null) => void;
  onSystemToolsChange?: (tools: ToolEntry[] | null) => void;
  onSystemInfoLoaderChange?: (loader: (() => Promise<void>) | null) => void;
  onSessionStatsChange?: (stats: SessionStatsInfo | null) => void;
  onSessionStatsPanelOpen?: () => void;
  onContextUsageChange?: (usage: { percent: number | null; contextWindow: number; tokens: number | null } | null) => void;
  onOpenFile?: (filePath: string) => void;
  onAskInNewChat?: (prompt: string, sourceSessionId: string, sourceEntryId: string) => Promise<void>;
  quoteSelectionEnabled?: boolean;
  initialPrompt?: string;
  onInitialPromptConsumed?: () => void;
  /** Completion sound state + controls, owned by AppShell so tasks finishing in
   *  a non-active workspace can still ring. */
  soundEnabled?: boolean;
  playDoneSound?: () => void;
  unlockAudio?: () => void;
}

function phaseLabel(phase: AgentPhase, t: (key: string, params?: Record<string, string | number>) => string): string | null {
  if (phase?.kind === "running_tools") {
    const latest = phase.tools[phase.tools.length - 1];
    if (latest?.progress) {
      return `${t("chat.runningNamedTool", { name: latest.name })} ${latest.progress}`;
    }
    const names = phase.tools.map((t) => t.name);
    if (names.length === 0) return t("chat.runningTool");
    if (names.length === 1) return t("chat.runningNamedTool", { name: names[0] });
    if (names.length <= 3) return t("chat.runningTools", { names: names.join(", ") });
    return t("chat.runningToolsMore", { names: names.slice(0, 2).join(", "), count: names.length - 2 });
  }
  if (phase?.kind === "waiting_model") return t("chat.waitingModel");
  if (phase?.kind === "running_command") return t("chat.runningCommand");
  return null;
}

function NewSessionUpdateLink({
  label,
}: {
  label: (version: string) => string;
}) {
  const [update, setUpdate] = useState<AppUpdateResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/app-update", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<AppUpdateResponse>;
      })
      .then((result) => {
        if (result?.updateAvailable && result.latestVersion && result.releaseUrl) {
          setUpdate(result);
        }
      })
      .catch(() => {
        // Update checks are best-effort and must not interrupt a new session.
      });
    return () => controller.abort();
  }, []);

  if (!update) return null;
  const accessibleLabel = label(update.latestVersion);

  return (
    <a
      href={update.releaseUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={accessibleLabel}
      aria-label={accessibleLabel}
      className="inline-flex min-h-8 min-w-0 shrink-0 items-center gap-[3px] self-center rounded-[5px] bg-transparent px-1 text-xs leading-tight font-semibold whitespace-nowrap text-primary no-underline transition-colors hover:bg-muted"
    >
      <span className="overflow-hidden text-ellipsis">v{update.latestVersion}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
        <path d="M7 17 17 7" />
        <path d="M7 7h10v10" />
      </svg>
    </a>
  );
}

function hasFinalAssistantAnswer(message: AgentMessage): boolean {
  if (message.role !== "assistant") return false;
  return splitFinalAssistantBlocks(message as AssistantMessage).answerBlocks.some((block) => (
    block.type === "image" || (block.type === "text" && block.text.trim().length > 0)
  ));
}

function findFinalAssistantIndex(messages: AgentMessage[], userIdx: number, endIdx: number): number {
  for (let candidateIdx = endIdx - 1; candidateIdx > userIdx; candidateIdx--) {
    if (hasFinalAssistantAnswer(messages[candidateIdx])) return candidateIdx;
  }
  for (let candidateIdx = endIdx - 1; candidateIdx > userIdx; candidateIdx--) {
    if (messages[candidateIdx]?.role === "assistant") return candidateIdx;
  }
  return -1;
}

function getUserInputText(message: AgentMessage): string | null {
  if (message.role !== "user") return null;
  if (typeof message.content === "string") {
    const text = message.content.trim();
    return text.length > 0 ? text : null;
  }
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text.length > 0 ? text : null;
}

function withAssistantBlocks(
  message: AssistantMessage,
  content: AssistantContentBlock[],
  options: { omitUsage?: boolean } = {},
): AssistantMessage {
  const next = { ...message, content };
  if (options.omitUsage) next.usage = undefined;
  return next;
}

function ProcessDetailsGroup({ messageCount, toolCallCount, defaultExpanded = false, reveal = false, children, t }: { messageCount: number; toolCallCount: number; defaultExpanded?: boolean; reveal?: boolean; children: ReactNode; t: (key: string, params?: Record<string, string | number>) => string }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  useLayoutEffect(() => {
    if (reveal) setExpanded(true);
  }, [reveal]);
  const parts = [t("chat.processDetails"), `${messageCount} ${t(messageCount === 1 ? "chat.message" : "chat.messages")}`];
  if (toolCallCount > 0) parts.push(`${toolCallCount} ${t(toolCallCount === 1 ? "chat.toolCall" : "chat.toolCalls")}`);

  return (
    <div className="mb-3.5">
      <button
        type="button"
        data-slot="process-details-toggle"
        aria-expanded={expanded || reveal}
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? t("chat.collapseProcess") : t("chat.expandProcess")}
        className="flex min-h-6 w-auto items-center gap-2 border-none bg-transparent py-0.5 text-left text-xs text-muted-foreground"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cn("shrink-0 transition-transform duration-150", expanded && "rotate-90")}>
          <polyline points="4 2.5 7.5 6 4 9.5" />
        </svg>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {parts.join(" · ")}
        </span>
      </button>
      {(expanded || reveal) && (
        <div className="mt-2">
          {children}
        </div>
      )}
    </div>
  );
}

export function ChatWindow({ session, searchTarget, onSearchTargetHandled, initialScrollPosition, onScrollPositionChange, sessionRunning, newSessionCwd, newSessionDraftKey, onAgentEnd, onAttentionNeeded, onSessionCreated, onSessionForked, modelsRefreshKey, chatInputRef, onBranchDataChange, onSystemPromptChange, onSystemToolsChange, onSystemInfoLoaderChange, onSessionStatsChange, onSessionStatsPanelOpen, onContextUsageChange, onOpenFile, onAskInNewChat, quoteSelectionEnabled = false, initialPrompt, onInitialPromptConsumed, soundEnabled = true, playDoneSound = () => {}, unlockAudio }: Props) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  // Both toggles are per-device visual preferences; the store keeps them in localStorage.
  // Hiding the input is keyboard-only now: the row no longer carries a control for it.
  const { composerHidden } = useChromePreferences();

  // ⌘/Ctrl+J toggles the input, so hiding it is never a one-way trip.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "j") return;
      event.preventDefault();
      setComposerHidden(!composerHidden);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [composerHidden]);

  // "/" puts the caret in the composer — the web convention for "focus the box". Pressed while the
  // composer is hidden it reveals it first; pressed with a draft in it, it only focuses. It lives here
  // beside the Cmd/Ctrl+J toggle because this component owns both the composer and its hidden state.
  // Ctrl+K is deliberately left free: it is reserved for search-everything.
  const focusComposerPendingRef = useRef(false);
  const focusComposer = useCallback(() => {
    const input = chatInputRef?.current;
    if (input) {
      input.focus();
      // An empty composer takes the "/" too, so the slash palette opens in the same keystroke;
      // insertIfEmpty is a no-op once there is a draft, so half-written text is never touched.
      input.insertIfEmpty("/");
      return;
    }
    if (!composerHidden) return;
    // Revealing it mounts ChatInput, so the focus has to wait for that commit.
    focusComposerPendingRef.current = true;
    setComposerHidden(false);
  }, [chatInputRef, composerHidden]);

  useEffect(() => {
    if (!focusComposerPendingRef.current || composerHidden) return;
    const input = chatInputRef?.current;
    if (!input) return;
    focusComposerPendingRef.current = false;
    input.focus();
    input.insertIfEmpty("/");
  }, [composerHidden, chatInputRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isComposerFocusKey(event, event.target)) return;
      event.preventDefault();
      focusComposer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusComposer]);
  const completionNotificationsEnabled = session?.relation?.kind !== "subagent";

  // Wrap onAgentEnd to play the completion sound. This is more reliable than
  // wrapping handleAgentEventRef because useAgentSession overwrites that ref
  // on every render (it syncs the latest callback), which would blow away an
  // externally-installed wrapper after the first re-render.
  const playDoneSoundRef = useRef(playDoneSound);
  playDoneSoundRef.current = playDoneSound;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const soundedExtensionDialogIdRef = useRef<string | null>(null);
  const wrappedOnAgentEnd = useCallback(() => {
    if (completionNotificationsEnabled && soundEnabledRef.current) {
      playDoneSoundRef.current();
    }
    onAgentEnd?.();
  }, [completionNotificationsEnabled, onAgentEnd]);

  // 稳定化 onEditContent 引用，配合 React.memo 防止历史消息重渲染
  const handleEditContent = useCallback((message: UserMessage) => {
    chatInputRef?.current?.replaceMessage(message);
  }, [chatInputRef]);

  const initialScrollPositionRef = useRef(searchTarget ? null : initialScrollPosition ?? null);
  const [pendingScrollRestore, setPendingScrollRestore] = useState<Extract<ChatScrollPosition, { atBottom: false }> | null>(() => {
    const position = initialScrollPositionRef.current;
    return position && !position.atBottom ? position : null;
  });
  const [restoreAnchorReady, setRestoreAnchorReady] = useState(false);

  const {
    loading, error, messages, activeToolResults, entryIds, historyCursor, hasEarlierMessages, streamState,
    agentRunning, bashRunning, pendingBash, modelNames, modelList, modelError, modelScopeWarnings, modelThinkingLevels, modelThinkingLevelMaps, thinkingLevel,
    retryInfo, contextUsage, forkingEntryId,
    isCompacting, autoCompactionEnabled, compactError, compactResult, displayModel: displayModelValue, sessionStats,
    slashCommands, slashCommandsLoading, queuedMessages,
    notices, extensionDialog, extensionCustomUi, extensionStatuses, extensionWidgets, respondToExtensionUi, sendExtensionCustomInput, setNoticePaused,
    agentPhase,
    isNew,
    sessionIdRef, scrollContainerRef,
    lastUserMsgRef, promptAnchorActive,
    handleSend, handleAbort, handleFork, handleNavigate, handleModelChange,
    handleSteer, handleFollowUp, handlePromptWithStreamingBehavior, handleAbortCompaction,
    handleRecallQueue,
    handleBuiltinSlashCommand,
    handleThinkingLevelChange, loadSlashCommands, scrollUserMsgToTop,
    loadContext, activeLeafId, scrollToBottom, scrollToMessage,
  } = useAgentSession({
    session, sessionRunning, newSessionCwd, newSessionDraftKey, onAgentEnd: wrappedOnAgentEnd, onAttentionNeeded, onSessionCreated, onSessionForked,
    modelsRefreshKey, chatInputRef, onBranchDataChange, onSystemPromptChange, onSystemToolsChange, onSystemInfoLoaderChange, onSessionStatsPanelOpen,
    deferInitialScroll: Boolean(pendingScrollRestore),
  });
  const sessionBusy = agentRunning || bashRunning;
  const [quotedSelection, setQuotedSelection] = useState<{
    text: string;
    top: number;
    left: number;
    sourceEntryId?: string;
  } | null>(null);
  const [quoteInputOpen, setQuoteInputOpen] = useState(false);
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quotePopoverRef = useRef<HTMLDivElement | null>(null);
  const quoteChatInputRef = useRef<ChatInputHandle | null>(null);
  const closeQuotedSelection = useCallback(() => {
    setQuotedSelection(null);
    setQuoteInputOpen(false);
    setQuoteError(null);
  }, []);

  useEffect(() => {
    if (!quoteSelectionEnabled) closeQuotedSelection();
  }, [quoteSelectionEnabled, closeQuotedSelection]);

  const captureQuotedSelection = useCallback(() => {
    if (!quoteSelectionEnabled || quoteInputOpen) return;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const root = messageContentRef.current;
    if (!selection || selection.isCollapsed || !range || !root || !root.contains(range.commonAncestorContainer)) {
      setQuotedSelection(null);
      return;
    }
    const text = selection.toString().trim();
    if (!text) {
      setQuotedSelection(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer as Element
      : range.commonAncestorContainer.parentElement;
    const start = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer as Element
      : range.startContainer.parentElement;
    const end = range.endContainer.nodeType === Node.ELEMENT_NODE
      ? range.endContainer as Element
      : range.endContainer.parentElement;
    const sourceEntryId = [ancestor, start, end]
      .map((element) => element?.closest<HTMLElement>("[data-message-role=\"assistant\"]")?.dataset.entryId)
      .find((entryId): entryId is string => Boolean(entryId));
    setQuotedSelection({
      text,
      top: Math.min(window.innerHeight - 44, rect.bottom + 8),
      left: Math.max(64, Math.min(window.innerWidth - 64, rect.left + rect.width / 2)),
      sourceEntryId,
    });
  }, [quoteSelectionEnabled, quoteInputOpen]);

  useEffect(() => {
    if (!quoteInputOpen || !quotedSelection) return;
    quoteChatInputRef.current?.insertIfEmpty(buildQuotedSelection(
      quotedSelection.text,
      t("chat.quoteIntro"),
      t("chat.quoteQuestion"),
    ));
  }, [quoteInputOpen, quotedSelection, t]);

  useLayoutEffect(() => {
    const popover = quotePopoverRef.current;
    if (!popover || !quotedSelection) return;
    const viewport = window.visualViewport;
    const position = () => {
      const rect = popover.getBoundingClientRect();
      const top = viewport?.offsetTop ?? 0;
      const left = viewport?.offsetLeft ?? 0;
      popover.style.top = `${Math.max(top + 8, Math.min(quotedSelection.top, top + (viewport?.height ?? window.innerHeight) - rect.height - 8))}px`;
      popover.style.left = `${Math.max(left + 8, Math.min(quotedSelection.left - rect.width / 2, left + (viewport?.width ?? window.innerWidth) - rect.width - 8))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(popover);
    window.addEventListener("resize", position);
    viewport?.addEventListener("resize", position);
    viewport?.addEventListener("scroll", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      viewport?.removeEventListener("resize", position);
      viewport?.removeEventListener("scroll", position);
    };
  }, [quotedSelection, quoteInputOpen, quoteError]);

  useEffect(() => {
    if (!quotedSelection) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!quoteInputOpen && !quotePopoverRef.current?.contains(event.target as Node)) closeQuotedSelection();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (!quoteSubmitting) closeQuotedSelection();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [quotedSelection, quoteInputOpen, quoteSubmitting, closeQuotedSelection]);

  const askSelectionHere = useCallback(() => {
    if (!quotedSelection) return;
    chatInputRef?.current?.insertText(buildQuotedSelection(
      quotedSelection.text,
      t("chat.quoteIntro"),
      t("chat.quoteQuestion"),
    ));
    window.getSelection()?.removeAllRanges();
    closeQuotedSelection();
  }, [chatInputRef, quotedSelection, closeQuotedSelection, t]);

  const askSelectionInNewChat = useCallback(async (prompt: string) => {
    const sourceSessionId = sessionIdRef.current ?? session?.id;
    if (quoteSubmitting || !prompt.trim() || !quotedSelection?.sourceEntryId || !sourceSessionId || !onAskInNewChat) return;
    setQuoteSubmitting(true);
    setQuoteError(null);
    unlockAudio?.();
    try {
      await onAskInNewChat(
        prompt,
        sourceSessionId,
        quotedSelection.sourceEntryId,
      );
      closeQuotedSelection();
    } catch (error) {
      quoteChatInputRef.current?.restoreSubmission(prompt);
      setQuoteError(error instanceof Error ? error.message : String(error));
    } finally {
      setQuoteSubmitting(false);
    }
  }, [onAskInNewChat, quotedSelection, quoteSubmitting, session?.id, sessionIdRef, closeQuotedSelection, unlockAudio]);

  const initialPromptSentRef = useRef(false);
  useEffect(() => {
    if (loading || error || !initialPrompt || initialPromptSentRef.current) return;
    initialPromptSentRef.current = true;
    onInitialPromptConsumed?.();
    void handleSend(initialPrompt);
  }, [initialPrompt, loading, error, handleSend, onInitialPromptConsumed]);

  useEffect(() => {
    if (
      !completionNotificationsEnabled
      || !extensionDialog
      || soundedExtensionDialogIdRef.current === extensionDialog.id
    ) return;
    soundedExtensionDialogIdRef.current = extensionDialog.id;
    playDoneSoundRef.current();
  }, [completionNotificationsEnabled, extensionDialog]);

  // Register the abort handler for the global Esc shortcut
  useEffect(() => {
    registerAbortHandler(sessionBusy ? handleAbort : null);
  }, [sessionBusy, handleAbort]);

  // --- Lazy-load historical messages ---
  // Only render the last N messages initially. When the user scrolls to the
  // top, load another page while keeping the scroll position stable.
  const [visibleCount, setVisibleCount] = useState(VISIBLE_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const messageContentRef = useRef<HTMLDivElement | null>(null);
  const prevScrollDistanceRef = useRef<number | null>(null);
  const loadingOlderRef = useRef(false);
  const restoreStartedRef = useRef(false);
  const pendingScrollRestoreRef = useRef(pendingScrollRestore);
  pendingScrollRestoreRef.current = pendingScrollRestore;
  const [pendingSearchScroll, setPendingSearchScroll] = useState<Props["searchTarget"]>(null);
  const searchMessage = messages[entryIds.indexOf(pendingSearchScroll?.entryId ?? "")];
  const searchBlock = searchMessage?.role === "assistant"
    ? (pendingSearchScroll?.blockIndex === undefined
      ? searchMessage.content.find((block) => block.type === "text")
      : searchMessage.content[pendingSearchScroll.blockIndex])
    : undefined;
  const searchHistoryRef = useRef({ entryIds, historyCursor, hasEarlierMessages });
  searchHistoryRef.current = { entryIds, historyCursor, hasEarlierMessages };

  useLayoutEffect(() => {
    const sessionId = session?.id;
    const container = scrollContainerRef.current;
    const content = messageContentRef.current;
    if (!sessionId || !onScrollPositionChange || !container || !content) return;
    return () => {
      if (pendingScrollRestoreRef.current) return;
      if (isScrollAtTail(container.scrollTop, container.clientHeight, container.scrollHeight)) {
        onScrollPositionChange(sessionId, { atBottom: true });
        return;
      }
      const viewportTop = container.getBoundingClientRect().top;
      const candidates = Array.from(content.children).flatMap((element) => {
        if (!(element instanceof HTMLElement) || !element.dataset.entryId) return [];
        const rect = element.getBoundingClientRect();
        return [{ entryId: element.dataset.entryId, top: rect.top, bottom: rect.bottom }];
      });
      const anchor = findChatScrollAnchor(candidates, viewportTop);
      if (!anchor) return;
      onScrollPositionChange(sessionId, {
        atBottom: false,
        ...anchor,
        oldestEntryId: searchHistoryRef.current.historyCursor,
      });
    };
  }, [loading, onScrollPositionChange, scrollContainerRef, session?.id]);

  useEffect(() => {
    if (searchTarget) setPendingScrollRestore(null);
  }, [searchTarget]);

  useEffect(() => {
    const position = pendingScrollRestore;
    const sessionId = session?.id;
    if (!position || !sessionId || loading || searchTarget || restoreStartedRef.current) return;
    restoreStartedRef.current = true;
    const controller = new AbortController();

    const locate = async () => {
      const initialHistory = searchHistoryRef.current;
      if (initialHistory.entryIds.includes(position.anchorEntryId)) {
        setVisibleCount((current) => Math.max(current, initialHistory.entryIds.length * 2));
        setRestoreAnchorReady(true);
        return;
      }

      loadingOlderRef.current = true;
      let before = initialHistory.historyCursor;
      let hasMore = initialHistory.hasEarlierMessages;
      try {
        while (hasMore && before && !controller.signal.aborted) {
          const context = await loadContext(sessionId, activeLeafId, before, { signal: controller.signal });
          if (controller.signal.aborted) return;
          if (!context) {
            scrollToBottom("instant");
            setPendingScrollRestore(null);
            return;
          }
          setVisibleCount((current) => current + Math.max(VISIBLE_PAGE_SIZE, context.messages.length * 2));
          if (context.entryIds.includes(position.anchorEntryId)) {
            setRestoreAnchorReady(true);
            return;
          }
          if (context.oldestEntryId === position.oldestEntryId) break;
          before = context.oldestEntryId;
          hasMore = context.hasMore;
        }
        if (!controller.signal.aborted) {
          scrollToBottom("instant");
          setPendingScrollRestore(null);
        }
      } finally {
        loadingOlderRef.current = false;
      }
    };

    void locate();
    return () => {
      controller.abort();
      // A branch change cancels restoration and must reveal the new context.
      setPendingScrollRestore(null);
    };
  }, [activeLeafId, loadContext, loading, pendingScrollRestore, scrollToBottom, searchTarget, session?.id]);

  useLayoutEffect(() => {
    const position = pendingScrollRestore;
    const content = messageContentRef.current;
    if (!position || !content || searchTarget) return;
    const element = Array.from(content.children).find((candidate) => (
      candidate instanceof HTMLElement && candidate.dataset.entryId === position.anchorEntryId
    ));
    if (element instanceof HTMLElement) {
      scrollToMessage(element, position.anchorOffset);
      setPendingScrollRestore(null);
      return;
    }
    if (restoreAnchorReady) {
      scrollToBottom("instant");
      setPendingScrollRestore(null);
    }
  }, [entryIds, pendingScrollRestore, restoreAnchorReady, scrollToBottom, scrollToMessage, searchTarget, visibleCount]);

  useEffect(() => {
    if (!searchTarget || loading) return;
    const controller = new AbortController();
    const locate = async () => {
      const history = searchHistoryRef.current;
      let found = history.entryIds.includes(searchTarget.entryId);
      if (!found && !sessionBusy && history.hasEarlierMessages && history.historyCursor && !loadingOlderRef.current) {
        loadingOlderRef.current = true;
        const container = scrollContainerRef.current;
        if (container) prevScrollDistanceRef.current = captureScrollDistance(container.scrollHeight, container.scrollTop);
        // ponytail: one extra page of 200 entries; deeper or other-branch hits just open the session.
        const context = await loadContext(searchTarget.sessionId, activeLeafId, history.historyCursor, { tail: 200, signal: controller.signal });
        loadingOlderRef.current = false;
        found = Boolean(context?.entryIds.includes(searchTarget.entryId));
      }
      if (controller.signal.aborted) return;
      if (found) {
        prevScrollDistanceRef.current = null;
        setVisibleCount((current) => Math.max(current, (searchHistoryRef.current.entryIds.length + 200) * 2));
        setPendingSearchScroll(searchTarget);
      } else {
        onSearchTargetHandled?.(searchTarget);
      }
    };
    void locate();
    return () => controller.abort();
  }, [searchTarget, loading, activeLeafId, sessionBusy, loadContext, onSearchTargetHandled, scrollContainerRef]);

  useLayoutEffect(() => {
    if (!pendingSearchScroll || pendingSearchScroll !== searchTarget) return;
    const selector = `[data-entry-id="${CSS.escape(pendingSearchScroll.entryId)}"]`;
    const element = scrollContainerRef.current?.querySelector<HTMLElement>(searchMessage?.role === "user" ? selector : `${selector} [data-search-target]`);
    if (element) {
      scrollToMessage(element);
      element.animate([
        { backgroundColor: "var(--accent)" },
        { backgroundColor: "transparent" },
      ], { duration: 2500 });
    }
    setPendingSearchScroll(null);
    onSearchTargetHandled?.(pendingSearchScroll);
  }, [pendingSearchScroll, searchTarget, searchMessage, scrollContainerRef, scrollToMessage, onSearchTargetHandled]);

  // IntersectionObserver on the sentinel div at the top of the message list.
  // When it becomes visible, load the next page of older messages.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        // No older history loaded yet: fetch the previous page from the server
        // and prepend it (loadContext handles prepend + scroll anchoring).
        // Skip while a page is already loading or nothing older exists.
        if (loadingOlderRef.current) return;
        if (!hasEarlierMessages) return;
        const oldestId = historyCursor;
        if (!oldestId) return;
        const sid = session?.id ?? sessionIdRef.current;
        if (!sid) return;
        loadingOlderRef.current = true;
        prevScrollDistanceRef.current = captureScrollDistance(container.scrollHeight, container.scrollTop);
        void loadContext(sid, activeLeafId, oldestId).finally(() => {
          loadingOlderRef.current = false;
        });
      },
      { root: container, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [historyCursor, hasEarlierMessages, session, activeLeafId, loadContext, sessionIdRef, scrollContainerRef]);

  // Keep the rendered window at least as large as what's loaded, so prepended
  // (older) pages stay visible instead of being sliced off the top.
  useEffect(() => {
    setVisibleCount((current) => Math.max(current, messages.length));
  }, [messages.length]);

  // After visibleCount increases (more messages prepended), restore the
  // scroll position so the viewport doesn't jump.
  useEffect(() => {
    if (prevScrollDistanceRef.current == null) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = restoreScrollTop(container.scrollHeight, prevScrollDistanceRef.current);
    prevScrollDistanceRef.current = null;
  }, [visibleCount, scrollContainerRef]);
  // Push session stats up to AppShell for the top bar.
  // Compare scalar fields to avoid loops from new object identity each render.
  const statsKey = sessionStats
    ? [
      sessionStats.sessionId,
      sessionStats.sessionFile ?? "",
      sessionStats.sessionName ?? "",
      sessionStats.userMessages,
      sessionStats.assistantMessages,
      sessionStats.toolCalls,
      sessionStats.toolResults,
      sessionStats.totalMessages,
      sessionStats.tokens.input,
      sessionStats.tokens.output,
      sessionStats.tokens.cacheRead,
      sessionStats.tokens.cacheWrite,
      sessionStats.tokens.total,
      sessionStats.cost ?? 0,
      sessionStats.totalActiveMs ?? 0,
    ].join("|")
    : null;
  const sessionStatsRef = useRef(sessionStats);
  sessionStatsRef.current = sessionStats;
  useEffect(() => {
    onSessionStatsChange?.(sessionStatsRef.current);
  }, [statsKey, onSessionStatsChange]);
  useEffect(() => () => { onSessionStatsChange?.(null); }, [onSessionStatsChange]);

  // Push context usage up to AppShell as well.
  const ctxKey = contextUsage
    ? `${contextUsage.percent ?? "null"}|${contextUsage.contextWindow}|${contextUsage.tokens ?? "null"}`
    : null;
  const contextUsageRef = useRef(contextUsage);
  contextUsageRef.current = contextUsage;
  useEffect(() => {
    onContextUsageChange?.(contextUsageRef.current);
  }, [ctxKey, onContextUsageChange]);
  useEffect(() => () => { onContextUsageChange?.(null); }, [onContextUsageChange]);

  const onDrop = useCallback((files: File[]) => {
    chatInputRef?.current?.addImages(files);
  }, [chatInputRef]);

  const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(onDrop);

  const visibleMessages = messages.filter((m) => isMessageGroupAnchor(m) || m.role === "assistant");
  // Stable Map identity: `messages` doesn't change during streaming updates
  // (the streaming message lives in streamState), so memoized MessageViews
  // skip re-rendering on every message_update event. An inline `new Map()`
  // here used to defeat MessageView's memo() on each streamed chunk.
  const toolResultsMap = useMemo(() => {
    const map = new Map(activeToolResults);
    for (const msg of messages) {
      if (msg.role === "toolResult") {
        map.set((msg as ToolResultMessage).toolCallId, msg as ToolResultMessage);
      }
    }
    return map;
  }, [activeToolResults, messages]);
  const inputHistory = useMemo(() => {
    const seen = new Set<string>();
    const history: string[] = [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const text = getUserInputText(messages[i]);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      history.push(text);
      if (history.length >= 50) break;
    }
    return history.reverse();
  }, [messages]);
  const messageRefs = useMessageRefs(visibleMessages.length);
  const revealHistoryForMinimap = useCallback(() => {
    setVisibleCount((current) => Math.max(current, messages.length * 2));
  }, [messages.length]);

  const isEmptyNew = isNew && messages.length === 0 && !streamState.isStreaming && !sessionBusy;
  const hasStreamingContent = Boolean(streamState.streamingMessage?.content.length);
  const messageCwd = session?.cwd ?? newSessionCwd ?? undefined;
  const promptAnchorSpacerRef = useRef<HTMLDivElement | null>(null);
  const promptAnchorSpacerHeightRef = useRef(0);
  const promptAnchorMeasureFrameRef = useRef<number | null>(null);
  const promptAnchorAdjustmentDoneRef = useRef(false);
  const promptAnchorUpdateRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const spacer = promptAnchorSpacerRef.current;
    if (!agentRunning || !promptAnchorActive) {
      promptAnchorUpdateRef.current = null;
      promptAnchorSpacerHeightRef.current = 0;
      promptAnchorAdjustmentDoneRef.current = false;
      if (spacer) spacer.style.height = "";
      return;
    }

    const container = scrollContainerRef.current;
    const messageContent = messageContentRef.current;
    const userMessage = lastUserMsgRef.current;
    if (!container || !messageContent || !userMessage || !spacer) return;

    let disposed = false;
    const updatePromptAnchorSpacer = () => {
      if (
        disposed
        || scrollContainerRef.current !== container
        || messageContentRef.current !== messageContent
        || lastUserMsgRef.current !== userMessage
        || promptAnchorSpacerRef.current !== spacer
      ) return;

      const containerTop = container.getBoundingClientRect().top;
      const userMessageTop = userMessage.getBoundingClientRect().top
        - containerTop
        + container.scrollTop;
      const targetTop = Math.max(0, userMessageTop - 16);
      const contentEnd = spacer.getBoundingClientRect().top
        - containerTop
        + container.scrollTop;
      const nextPromptAnchorSpacerHeight = getPromptAnchorSpacerHeight(
        targetTop,
        contentEnd,
        container.clientHeight,
      );

      const isInitialMeasurement = !promptAnchorAdjustmentDoneRef.current;
      const needsInitialAdjustment = isInitialMeasurement
        && nextPromptAnchorSpacerHeight > 0;
      if (isInitialMeasurement) promptAnchorAdjustmentDoneRef.current = true;
      if (nextPromptAnchorSpacerHeight === promptAnchorSpacerHeightRef.current) return;

      promptAnchorSpacerHeightRef.current = nextPromptAnchorSpacerHeight;
      spacer.style.height = nextPromptAnchorSpacerHeight > 0
        ? `${nextPromptAnchorSpacerHeight}px`
        : "";
      if (needsInitialAdjustment) scrollUserMsgToTop();
    };

    promptAnchorUpdateRef.current = updatePromptAnchorSpacer;
    const schedulePromptAnchorMeasure = () => {
      if (disposed || promptAnchorMeasureFrameRef.current !== null) return;
      promptAnchorMeasureFrameRef.current = requestAnimationFrame(() => {
        promptAnchorMeasureFrameRef.current = null;
        updatePromptAnchorSpacer();
      });
    };

    updatePromptAnchorSpacer();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(schedulePromptAnchorMeasure);
    observer?.observe(container);
    observer?.observe(messageContent);
    observer?.observe(userMessage);
    return () => {
      disposed = true;
      if (promptAnchorUpdateRef.current === updatePromptAnchorSpacer) {
        promptAnchorUpdateRef.current = null;
      }
      observer?.disconnect();
      if (promptAnchorMeasureFrameRef.current !== null) {
        cancelAnimationFrame(promptAnchorMeasureFrameRef.current);
        promptAnchorMeasureFrameRef.current = null;
      }
    };
  }, [
    agentRunning,
    lastUserMsgRef,
    messages.length,
    promptAnchorActive,
    scrollContainerRef,
    scrollUserMsgToTop,
  ]);

  useLayoutEffect(() => {
    promptAnchorUpdateRef.current?.();
  }, [streamState.streamingMessage]);

  const availableThinkingLevels = displayModelValue
    ? (modelThinkingLevels[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;

  // One picker serves all four entry points: the composer's /model and /thinking, and the bottom
  // bar's model and thinking segments. It hangs off whatever opened it — the composer's textarea, or
  // the clicked segment's own rect.
  const [picker, setPicker] = useState<{ mode: "model" | "thinking"; query?: string; anchorRect: PickerAnchorRect } | null>(null);

  const openPickerFromComposer = useCallback((mode: "model" | "thinking", query?: string) => {
    if (sessionBusy) return;
    const composer = typeof document === "undefined" ? null : document.querySelector("textarea.chat-input-textarea");
    const box = composer?.getBoundingClientRect();
    const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
    const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
    // The fallback is a band just above the bottom of the window, which is where the composer sits.
    const anchorRect: PickerAnchorRect = box
      ? { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width }
      : { top: viewportHeight - 140, right: viewportWidth, bottom: viewportHeight - 100, left: 16, width: 480 };
    setPicker({ mode, query, anchorRect });
  }, [sessionBusy]);

  // The bottom bar's two segments take the same path, anchored to whichever trigger was clicked.
  const openPickerFromSegment = useCallback((mode: "model" | "thinking") => {
    if (sessionBusy) return;
    const selector = mode === "model" ? "[data-slot='chat-status-model'] button" : "[data-slot='chat-status-thinking'] button";
    const trigger = typeof document === "undefined" ? null : document.querySelector(selector);
    const box = trigger?.getBoundingClientRect();
    const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
    const anchorRect: PickerAnchorRect = box
      ? { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width }
      : { top: viewportHeight - 140, right: 340, bottom: viewportHeight - 120, left: 16, width: 320 };
    setPicker({ mode, anchorRect });
  }, [sessionBusy]);

  // The picker unmounts on close, which drops focus to <body>. Put the caret back in the composer:
  // the picker is opened either from there or from the bar, and either way the next thing typed is a
  // message. A layout effect, so it runs after the removal and nothing can take focus back.
  const pickerWasOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (picker) {
      pickerWasOpenRef.current = true;
      return;
    }
    if (!pickerWasOpenRef.current) return;
    pickerWasOpenRef.current = false;
    chatInputRef?.current?.focus();
  }, [picker, chatInputRef]);


  // pi prefixes the provider on the status bar only while several providers are in play.
  const statusProviderCount = useMemo(
    () => new Set((modelList ?? []).map((entry) => entry.provider)).size,
    [modelList],
  );

  // The status bar owns the model / level / tools menus now, so it builds the same option rows.
  const statusModelOptions = useMemo(
    () => (modelList && modelList.length > 0
      ? modelList.map((entry) => ({ provider: entry.provider, modelId: entry.id, name: entry.name }))
      : Object.entries(modelNames ?? {}).map(([key, name]) => ({
          provider: key.includes(":") ? key.slice(0, key.indexOf(":")) : "",
          modelId: key.includes(":") ? key.slice(key.indexOf(":") + 1) : key,
          name,
        }))),
    [modelList, modelNames],
  );

  const currentThinkingLevelMap = displayModelValue
    ? (modelThinkingLevelMaps[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;

  // The same rows the bar's two menus used to build, now fed to the one picker. `data-key` is the
  // value the picker hands back on Enter.
  const pickerItems: PickerItem[] = useMemo(() => {
    if (!picker) return [];
    if (picker.mode === "model") {
      return statusModelOptions.map((option) => ({
        key: option.provider + ":" + option.modelId,
        label: option.name || option.modelId,
        description: option.provider,
        active: displayModelValue
          ? option.provider === displayModelValue.provider && option.modelId === displayModelValue.modelId
          : false,
      }));
    }
    return thinkingChoicesFor(availableThinkingLevels).map((level) => {
      const alias = thinkingLevelAlias(level, currentThinkingLevelMap);
      return {
        key: level,
        label: alias ?? level,
        description: t(THINKING_LEVEL_DESC_KEYS[level]),
        active: (thinkingLevel ?? "auto") === level,
      };
    });
  }, [picker, statusModelOptions, displayModelValue, availableThinkingLevels, currentThinkingLevelMap, thinkingLevel, t]);

  const handlePickerSelect = useCallback((key: string) => {
    const mode = picker?.mode;
    setPicker(null);
    if (mode === "model") {
      const separator = key.indexOf(":");
      if (separator > 0) void handleModelChange(key.slice(0, separator), key.slice(separator + 1));
      return;
    }
    if (mode === "thinking") void handleThinkingLevelChange(key as ThinkingLevelOption);
  }, [picker?.mode, handleModelChange, handleThinkingLevelChange]);

  const chatInputElement = (
    <ChatInput
      ref={chatInputRef}
      onSend={handleSend}
      onAbort={handleAbort}
      onSteer={agentRunning ? handleSteer : undefined}
      onFollowUp={agentRunning ? handleFollowUp : undefined}
      onPromptWithStreamingBehavior={agentRunning ? handlePromptWithStreamingBehavior : undefined}
      isStreaming={sessionBusy}
      model={displayModelValue}
      modelList={modelList}
      modelError={modelError}
      modelScopeWarnings={modelScopeWarnings}
      onAbortCompaction={handleAbortCompaction}
      isCompacting={isCompacting}
      compactError={compactError}
      compactResult={compactResult}
      retryInfo={retryInfo}
      queuedMessages={queuedMessages}
      inputHistory={inputHistory}
      onRecallQueue={handleRecallQueue}
      slashCommands={slashCommands}
      slashCommandsLoading={slashCommandsLoading}
      onLoadSlashCommands={loadSlashCommands}
      onBuiltinCommand={handleBuiltinSlashCommand}
      onOpenPicker={openPickerFromComposer}
      onAudioUnlock={unlockAudio}
      draftKey={session?.id ?? newSessionDraftKey ?? undefined}
      cwd={session?.cwd ?? newSessionCwd}
    />
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
         {t("chat.loadingSession")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div
      data-slot="chat-content"
      className="relative flex h-full min-w-0 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex animate-[drop-zone-in_0.15s_ease_both] items-center justify-center bg-primary/6 backdrop-blur-[1px]">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {[0, 0.8, 1.6].map((delay) => (
              <div
                key={delay}
                className="absolute h-[720px] w-[720px] origin-center rounded-full border-[1.5px] border-solid border-primary/50 animate-[drop-ripple_2.4s_ease-out_infinite_backwards]"
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
          </div>
          <svg
            width="280" height="280" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg"
            className="text-primary drop-shadow-[0_6px_18px_color-mix(in_srgb,var(--primary)_18%,transparent)]"
          >
            <rect x="28" y="44" width="84" height="60" rx="8" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.50" strokeWidth="1.8"/>
            <path d="M36 100 L54 72 L68 88 L80 74 L104 100Z" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeOpacity="0.40" strokeWidth="1.4" strokeLinejoin="round"/>
            <circle cx="96" cy="58" r="8" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.6"/>
            <g stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.4" strokeLinecap="round">
              <line x1="96" y1="46" x2="96" y2="43"/>
              <line x1="96" y1="70" x2="96" y2="73"/>
              <line x1="84" y1="58" x2="81" y2="58"/>
              <line x1="108" y1="58" x2="111" y2="58"/>
              <line x1="87.5" y1="49.5" x2="85.4" y2="47.4"/>
              <line x1="104.5" y1="66.5" x2="106.6" y2="68.6"/>
              <line x1="104.5" y1="49.5" x2="106.6" y2="47.4"/>
              <line x1="87.5" y1="66.5" x2="85.4" y2="68.6"/>
            </g>
          </svg>
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none absolute top-3 left-0 z-40 flex justify-end px-4",
          isMobile ? "right-0" : "right-9",
        )}
      >
        <NoticeShelf notices={notices} floating onPauseChange={setNoticePaused} />
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {extensionDialog && (
          <ExtensionDialog key={extensionDialog.id} request={extensionDialog} onRespond={respondToExtensionUi} />
        )}
        {extensionCustomUi && (
          <ExtensionCustomPanel key={extensionCustomUi.id} request={extensionCustomUi} onInput={sendExtensionCustomInput} />
        )}
        {!isEmptyNew && <>
        <div
          ref={scrollContainerRef}
          className={cn("min-w-0 flex-1 overflow-x-hidden overflow-y-auto pt-4 [scrollbar-width:none]", pendingScrollRestore && "invisible")}
        >
          <div className="min-w-0 px-4">
            <div ref={messageContentRef} onPointerUp={captureQuotedSelection} className="mx-auto w-full min-w-0 max-w-[var(--chat-content-max-width,820px)]">
            {(() => {
              let lastUserIdx = -1;
              for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === "user") { lastUserIdx = i; break; }
              }
              // Anchor for live-tail detection: the last user message, or a
              // compaction summary when compaction has replaced it mid-turn.
              // Computed independently from lastUserIdx (which is kept for the
              // scroll-to-user ref) because a compaction summary can sit after
              // the last user message and anchor the still-streaming segment.
              let lastAnchorIdx = -1;
              for (let i = messages.length - 1; i >= 0; i--) {
                if (isMessageGroupAnchor(messages[i])) { lastAnchorIdx = i; break; }
              }

              const visibleRefIndexByMessage = new Map<number, number>();
              let refIdx = 0;
              messages.forEach((msg, idx) => {
                if (isMessageGroupAnchor(msg) || msg.role === "assistant") {
                  visibleRefIndexByMessage.set(idx, refIdx++);
                }
              });

              const attachVisibleRef = (idx: number, refIndex: number) => (el: HTMLDivElement | null) => {
                messageRefs.current[refIndex] = el;
                if (idx === lastUserIdx) { (lastUserMsgRef as { current: HTMLDivElement | null }).current = el; }
              };

              const renderMessage = (idx: number, options: { attachRef?: boolean; keyPrefix?: string; messageOverride?: AgentMessage; showTimestamp?: boolean; writtenFiles?: WrittenFile[] } = {}): ReactNode => {
                const msg = options.messageOverride ?? messages[idx];
                const isVisible = isMessageGroupAnchor(msg) || msg.role === "assistant";
                const currentRefIdx = visibleRefIndexByMessage.get(idx);
                const keyPrefix = options.keyPrefix ?? "message";
                const messageKey = entryIds[idx] ?? idx;
                let showTimestamp = false;
                if (msg.role === "assistant") {
                  showTimestamp = true;
                  for (let j = idx + 1; j < messages.length; j++) {
                    const r = messages[j].role;
                    if (r === "user") break;
                    if (r === "assistant") { showTimestamp = false; break; }
                  }
                  // Hide on the currently-streaming tail (the streaming bubble owns the live timestamp)
                  if (showTimestamp && streamState.isStreaming && idx === messages.length - 1) {
                    showTimestamp = false;
                  }
                }
                if (options.showTimestamp !== undefined) showTimestamp = options.showTimestamp;
                const view = (
                  <MessageView
                    key={`${keyPrefix}-view-${messageKey}`}
                    message={msg}
                    toolResults={toolResultsMap}
                    modelNames={modelNames}
                    fallbackModel={displayModelValue}
                    cwd={messageCwd}
                    onOpenFile={onOpenFile}
                    entryId={entryIds[idx]}
                    searchBlock={entryIds[idx] === pendingSearchScroll?.entryId ? searchBlock : undefined}
                    onFork={sessionBusy || isNew ? undefined : handleFork}
                    forking={forkingEntryId === entryIds[idx]}
                    onNavigate={sessionBusy ? undefined : handleNavigate}
                    onEditContent={handleEditContent}
                    showTimestamp={showTimestamp}
                    prevTimestamp={idx > 0 ? (messages[idx - 1] as AgentMessage & { timestamp?: number }).timestamp : undefined}
                    sessionId={session?.id ?? sessionIdRef.current ?? undefined}
                    writtenFiles={options.writtenFiles}
                  />
                );
                if (!isVisible || currentRefIdx === undefined) return view;
                return (
                  <div key={`${keyPrefix}-${messageKey}`} data-entry-id={entryIds[idx]} ref={options.attachRef === false ? undefined : attachVisibleRef(idx, currentRefIdx)}>
                    {view}
                  </div>
                );
              };

              const rendered: ReactNode[] = [];
              for (let idx = 0; idx < messages.length;) {
                const msg = messages[idx];
                if (!isMessageGroupAnchor(msg)) {
                  rendered.push(renderMessage(idx));
                  idx += 1;
                  continue;
                }

                const userIdx = idx;
                let endIdx = userIdx + 1;
                while (endIdx < messages.length && !isMessageGroupAnchor(messages[endIdx])) endIdx += 1;

                const finalAssistantIdx = findFinalAssistantIndex(messages, userIdx, endIdx);

                if (finalAssistantIdx === -1) {
                  for (let renderIdx = userIdx; renderIdx < endIdx; renderIdx++) {
                    rendered.push(renderMessage(renderIdx));
                  }
                  idx = endIdx;
                  continue;
                }

                const isLiveTail = (sessionBusy || streamState.isStreaming) && endIdx === messages.length && userIdx === lastAnchorIdx;
                if (isLiveTail) {
                  for (let renderIdx = userIdx; renderIdx < endIdx; renderIdx++) {
                    rendered.push(renderMessage(renderIdx));
                  }
                  idx = endIdx;
                  continue;
                }

                rendered.push(renderMessage(userIdx));

                const finalAssistant = messages[finalAssistantIdx] as AssistantMessage;
                const finalSplit = splitFinalAssistantBlocks(finalAssistant);
                const finalAnswerMessage = finalSplit.answerBlocks.length > 0 || getAssistantErrorMessage(finalAssistant)
                  ? withAssistantBlocks(finalAssistant, finalSplit.answerBlocks)
                  : null;

                const finalProcessEnd = finalAssistant.content.indexOf(finalSplit.answerBlocks[0]);
                // Keep the original prefix so deferred thinking retains its stored block indices.
                const finalProcessBlocks = finalAssistant.content.slice(0, finalProcessEnd < 0 ? undefined : finalProcessEnd);

                const processViews: ReactNode[] = [];
                let processToolCount = 0;
                let processRefIdx: number | undefined;
                let revealProcess = false;

                for (let processIdx = userIdx + 1; processIdx <= finalAssistantIdx; processIdx++) {
                  const processMessage = messages[processIdx];
                  if (processMessage.role === "custom") {
                    revealProcess ||= Boolean(pendingSearchScroll && pendingSearchScroll.entryId === entryIds[processIdx]);
                    processViews.push(renderMessage(processIdx, { attachRef: false, keyPrefix: "process" }));
                    continue;
                  }
                  if (processMessage.role !== "assistant") continue;
                  const message = processIdx === finalAssistantIdx
                    ? withAssistantBlocks(processMessage, finalProcessBlocks, { omitUsage: Boolean(finalAnswerMessage) })
                    : processMessage;
                  const blocks = getDisplayableAssistantBlocks(message);
                  if (blocks.length === 0) continue;
                  processRefIdx ??= visibleRefIndexByMessage.get(processIdx);
                  processToolCount += countToolCallBlocks(blocks);
                  revealProcess ||= Boolean(pendingSearchScroll && entryIds[processIdx] === pendingSearchScroll.entryId && (!searchBlock || blocks.includes(searchBlock)));
                  processViews.push(renderMessage(processIdx, {
                    attachRef: false,
                    keyPrefix: "process",
                    messageOverride: message,
                    showTimestamp: false,
                  }));
                }

                if (processViews.length > 0) {
                  rendered.push(
                    <div
                      key={`process-group-${entryIds[userIdx] ?? userIdx}`}
                      ref={processRefIdx === undefined ? undefined : (el) => { messageRefs.current[processRefIdx] = el; }}
                    >
                      <ProcessDetailsGroup messageCount={processViews.length} toolCallCount={processToolCount} defaultExpanded={!finalAnswerMessage} reveal={revealProcess} t={t}>
                        {processViews}
                      </ProcessDetailsGroup>
                    </div>,
                  );
                }

                if (finalAnswerMessage) {
                  // Each tool call is stored as its own assistant entry, so the
                  // final answer alone carries no record of what the turn wrote.
                  // Gather the turn's assistant blocks and derive the file list
                  // from the write/edit calls among them.
                  const turnContent: AssistantContentBlock[] = [];
                  for (let i = userIdx + 1; i <= finalAssistantIdx; i++) {
                    const m = messages[i];
                    if (m?.role === "assistant") {
                      for (const b of (m as AssistantMessage).content ?? []) turnContent.push(b);
                    }
                  }
                  const writtenFiles = extractTurnWrittenFiles(turnContent, toolResultsMap, messageCwd);
                  rendered.push(renderMessage(finalAssistantIdx, {
                    messageOverride: finalAnswerMessage,
                    writtenFiles,
                  }));
                }
                for (let renderIdx = finalAssistantIdx + 1; renderIdx < endIdx; renderIdx++) {
                  rendered.push(renderMessage(renderIdx));
                }
                idx = endIdx;
              }
              const { startIndex } = getVisibleRenderWindow(rendered.length, visibleCount);
              const hasMore = startIndex > 0 || hasEarlierMessages;
              return (
                <>
                  {hasMore && (
                     <div ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">
                       {t("chat.loadEarlier")}
                    </div>
                  )}
                  {rendered.slice(startIndex)}
                </>
              );
            })()}
            {streamState.isStreaming && hasStreamingContent && streamState.streamingMessage && (
              <MessageView message={streamState.streamingMessage as AgentMessage} toolResults={toolResultsMap} isStreaming modelNames={modelNames} fallbackModel={displayModelValue} cwd={messageCwd} onOpenFile={onOpenFile} />
            )}

            {agentRunning && !hasStreamingContent && agentPhase && (
              <div className="break-words py-2 text-[13px] text-muted-foreground">
                <span className="animate-[pulse_1.5s_infinite]">{phaseLabel(agentPhase, t)}</span>
              </div>
            )}

            {bashRunning && !pendingBash && (
              <div className="py-2 text-[13px] text-muted-foreground">
                 <span className="animate-[pulse_1.5s_infinite]">{t("chat.runningCommand")}</span>
              </div>
            )}

            {pendingBash && (
              <MessageView
                fallbackModel={displayModelValue}
                message={{
                  role: "bashExecution",
                  command: pendingBash.command,
                  output: "",
                  excludeFromContext: pendingBash.excludeFromContext,
                } as BashExecutionMessage}
                sessionId={session?.id ?? sessionIdRef.current ?? undefined}
              />
            )}

            <div ref={promptAnchorSpacerRef} aria-hidden="true" />
            </div>
          </div>
        </div>
        {isMobile || pendingScrollRestore ? null : (
          <ChatMinimap
            messages={messages}
            streamingMessage={streamState.streamingMessage}
            scrollContainer={scrollContainerRef}
            messageRefs={messageRefs}
            onRevealHistory={revealHistoryForMinimap}
          />
        )}
        </>}
      </div>

      {quoteSelectionEnabled && quotedSelection && createPortal(
        <div
          ref={quotePopoverRef}
          role={quoteInputOpen ? "dialog" : "toolbar"}
          aria-label={t(quoteInputOpen ? "chat.newQuoteChat" : "chat.askSelection")}
          className={cn(
            "fixed z-[130] flex max-w-[calc(100vw-16px)] max-h-[calc(var(--app-viewport-height,100dvh)-16px)] flex-wrap gap-[3px] overflow-y-auto rounded-md border border-border bg-background shadow-[0_2px_10px_rgba(0,0,0,0.12)]",
            quoteInputOpen ? "w-[min(420px,calc(100vw-16px))] p-3" : "p-[3px]",
          )}
          style={{
            top: quotedSelection.top,
            left: quotedSelection.left,
          }}
        >
          {quoteInputOpen ? (
            <fieldset
              disabled={quoteSubmitting}
              aria-busy={quoteSubmitting}
              className="m-0 flex w-full min-w-0 flex-col gap-2.5 border-none p-0"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-xs font-semibold">{t("chat.askInNewChat")}</span>
                <IconButton title={t("i18n.close")} disabled={quoteSubmitting} onClick={closeQuotedSelection} className="border-none">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                </IconButton>
              </div>
              <ChatInput
                ref={quoteChatInputRef}
                compact
                onSend={askSelectionInNewChat}
                onAbort={closeQuotedSelection}
                isStreaming={false}
              />
              {quoteError && <div role="alert" className="text-xs text-destructive break-words">{quoteError}</div>}
            </fieldset>
          ) : <>
          <Button
            type="button"
            variant="ghost"
            title={t("chat.askInCurrent")}
            aria-label={t("chat.askInCurrent")}
            onPointerDown={(event) => event.preventDefault()}
            onClick={askSelectionHere}
            className="h-[35px] w-auto flex-none gap-[5px] border-none px-2.5 text-xs font-medium"
          >
            <span aria-hidden="true" className="text-[15px]">@</span>
            <span>{t("chat.askInCurrent")}</span>
          </Button>
          {onAskInNewChat && quotedSelection.sourceEntryId && !sessionBusy && (
            <Button
              type="button"
              variant="ghost"
              title={t("chat.askInNewChat")}
              aria-label={t("chat.askInNewChat")}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => { setQuoteInputOpen(true); window.getSelection()?.removeAllRanges(); }}
              className="h-[35px] w-auto flex-none gap-[5px] border-none px-2.5 text-xs font-medium"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3v12M18 9a9 9 0 0 1-9 9" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
              </svg>
              <span>{t("chat.askInNewChat")}</span>
            </Button>
          )}
          </>}
        </div>,
        document.body,
      )}

      <div className="relative shrink-0">
        {isEmptyNew && (
          <div
            className={cn("mx-auto mb-3 w-full max-w-[var(--chat-content-max-width,820px)] pl-8", isMobile ? "pr-8" : "pr-[68px]")}
          >
            <div className="flex items-center justify-between gap-3 font-mono">
              <div className={cn("flex min-w-0 flex-1 items-baseline overflow-hidden leading-[1.4]", isMobile ? "gap-[7px]" : "gap-2.5")}>
                <span className="shrink-0 text-[28px] font-bold whitespace-nowrap text-foreground">π</span>
                <NewSessionUpdateLink label={(version) => t("appUpdate.releaseNotes", { version })} />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-[11px] text-muted-foreground">
                  web <span className="text-foreground">v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"}</span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  pi <span className="text-foreground">v{process.env.NEXT_PUBLIC_PI_VERSION ?? "0.0.0"}</span>
                </span>
              </div>
            </div>
          </div>
        )}
        {!composerHidden && chatInputElement}
        <ExtensionStatusBar widgets={extensionWidgets} />
        {/* The whole bar is one scroll surface: the status lines and the extension line share it, so a
            bar that outgrows the window scrolls together instead of per line. */}
        <div data-slot="chat-bottom-bar" className="overflow-x-auto overflow-y-auto overscroll-contain [max-height:min(144px,18dvh)]">
          {/* Same horizontal frame as the composer box: the fieldset in ChatInput reserves 16px plus the
              36px minimap rail on the right (:1499-1510), so a centred 820px box lands 18px left of this
              column's centre. The footer follows that frame instead of the raw column — and the inset
              lives on this inner block rather than on the scroll container, because a scroll container's
              right padding is not honoured past the overflow edge. */}
          <div data-slot="chat-bottom-bar-inner" className={cn("flex w-max min-w-full flex-col py-1 pl-4", isMobile ? "pr-4" : "pr-[52px]")}>
            <ChatStatusBar
              cwd={session?.cwd ?? newSessionCwd}
              projectRoot={session?.projectRoot ?? null}
              fresh={isEmptyNew}
              branch={session?.branch ?? null}
              sessionName={session?.name ?? null}
              usage={sessionStats}
              messages={messages}
              contextUsage={contextUsage}
              autoCompactionEnabled={autoCompactionEnabled}
              model={displayModelValue}
              providerCount={statusProviderCount}
              thinkingLevel={thinkingLevel}
              supportsReasoning={(availableThinkingLevels?.length ?? 0) > 0}
              busy={sessionBusy}
              onOpenModelPicker={() => openPickerFromSegment("model")}
              onOpenThinkingPicker={() => openPickerFromSegment("thinking")}
            />
            {/* Line 3 is its own strip on the same surface, after the status lines. */}
            <ExtensionStatusLine statuses={extensionStatuses} />
          </div>
        </div>
      </div>
      {picker && typeof document !== "undefined" && createPortal(
        <ListPicker
          items={pickerItems}
          anchorRect={picker.anchorRect}
          ariaLabel={picker.mode === "model" ? t("chat.commandModel") : t("chat.changeReasoningLabel")}
          initialQuery={picker.query}
          placeholder={picker.mode === "model" ? t("chat.filterModels") : undefined}
          emptyLabel={t("chat.pickerNoMatch")}
          onSelect={handlePickerSelect}
          onClose={() => setPicker(null)}
        />,
        document.body,
      )}
      {isEmptyNew && <div className="min-h-0 flex-1" />}
    </div>
  );
}


function NoticeShelf({ notices, floating = false, onPauseChange }: { notices: NoticeItem[]; floating?: boolean; onPauseChange?: (id: string | null) => void }) {
  if (notices.length === 0) return null;
  return (
    <div className={cn("flex flex-col items-end", !floating && "mb-2.5")}>
      {notices.map((notice, index) => {
        const dotClassName = notice.type === "error"
          ? "bg-destructive"
          : notice.type === "warning"
            ? "bg-warning"
            : notice.type === "success"
              ? "bg-success"
              : "bg-primary";
        return (
          <div
            key={notice.id}
            data-slot="notice-shelf-item"
            onMouseEnter={() => onPauseChange?.(notice.id)}
            onMouseLeave={(event) => {
              if (!event.currentTarget.contains(document.activeElement)) onPauseChange?.(null);
            }}
            onFocus={() => onPauseChange?.(notice.id)}
            onBlur={(event) => {
              if (!event.currentTarget.matches(":hover")) onPauseChange?.(null);
            }}
            className={cn(
              // Top-align children so the type dot sits by the first line on multi-line toasts;
              // pointer-events:auto opts back into interactivity since the floating wrapper is
              // click-through by design (pointer-events:none).
              "pointer-events-auto flex h-auto max-h-[500px] min-h-[60px] w-fit max-w-[min(100%,620px)] origin-top-right items-start gap-2.5 overflow-hidden rounded-[14px] border border-border/70 bg-background px-3 text-sm leading-normal text-muted-foreground",
              index === notices.length - 1 ? "mb-0" : "mb-1.5",
              floating ? "shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_-14px_rgba(15,23,42,0.24)]" : "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]",
              // Use backwards fill for the entrance animation so height styles return to
              // inline styles once it finishes; otherwise the keyframe's fixed 60px would
              // stick around in fill mode and permanently clamp the expanded toast
              notice.exiting ? "animate-[notice-shelf-out_0.18s_ease-in_forwards]" : "animate-[notice-shelf-in_0.18s_ease-out_backwards]",
            )}
          >
            <span
              className={cn("mt-[21px] size-[7px] shrink-0 rounded-full", dotClassName)}
            />
            {/* Full text by default: pre-line preserves \n (nowrap/normal collapse
                newlines into spaces) and long lines wrap instead of truncating;
                content taller than the cap scrolls inside the text area */}
            <span
              tabIndex={0}
              className="min-w-0 max-w-full overflow-y-auto py-3.5 break-words whitespace-pre-line [max-height:470px] [scrollbar-width:thin]"
            >
              {notice.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}

type ExtensionDialogRequest = Extract<ExtensionUiRequest, { method: "select" | "confirm" | "input" | "editor" }>;

function getExtensionDialogSummary(request: ExtensionDialogRequest): string | undefined {
  if (request.method === "select" && request.options.length > 0) return request.options[0];
  if (request.method === "confirm") {
    const firstLine = request.message.split("\n").find((line) => line.trim());
    return firstLine?.trim();
  }
  return undefined;
}

function ExtensionDialog({
  request,
  onRespond,
}: {
  request: ExtensionDialogRequest;
  onRespond: (request: ExtensionDialogRequest, response: { value: string } | { confirmed: boolean } | { cancelled: true }) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(request.method === "editor" ? request.prefill ?? "" : "");
  const [collapsed, setCollapsed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const focusFirstOption = useCallback((element: HTMLDivElement | null) => element?.focus(), []);
  const summary = getExtensionDialogSummary(request);
  const remainingSeconds = request.expiresAt === undefined
    ? null
    : Math.max(0, Math.ceil((request.expiresAt - now) / 1000));

  useEffect(() => {
    if (request.expiresAt === undefined) return;
    // The server closes expired requests via extension_ui_closed.
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [request.expiresAt]);

  const countdown = remainingSeconds !== null && (
    <span className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">
      {t("chat.extensionExpiresIn", { seconds: remainingSeconds })}
    </span>
  );

  const submitValue = () => {
    if (request.method === "confirm") {
      onRespond(request, { confirmed: true });
    } else {
      onRespond(request, { value });
    }
  };

  return (
    <div
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        event.stopPropagation();
        onRespond(request, { cancelled: true });
      }}
      className={cn(
        "pointer-events-none absolute inset-0 z-[90] flex justify-center p-5",
        collapsed ? "items-start" : "items-center",
      )}
    >
      {collapsed ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setCollapsed(false)}
          aria-expanded={false}
          className="pointer-events-auto h-auto w-full max-w-[min(560px,100%)] justify-start gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-foreground shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
        >
          <span className="shrink-0 text-[11px] font-semibold text-primary">
            {t("chat.extensionPending")}
          </span>
          <span className="min-w-0 flex-1 overflow-hidden text-[13px] font-semibold text-ellipsis whitespace-nowrap">
            {request.title}
          </span>
          {summary && (
            <span className="max-w-[34%] shrink overflow-hidden text-xs text-ellipsis whitespace-nowrap text-muted-foreground">
              {summary}
            </span>
          )}
          {countdown}
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("chat.extensionExpand")}
          </span>
        </Button>
      ) : (
      <div
        role="dialog"
        aria-label={request.title}
        className="pointer-events-auto flex w-[min(560px,100%)] max-h-[min(760px,100%)] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-[0_20px_60px_rgba(0,0,0,0.28)]"
      >
        <div className="flex shrink-0 items-start gap-2 border-b border-border px-3.5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">{request.title}</div>
            <div className="mt-[3px] flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span>{t("chat.extensionRequest")}</span>
              {countdown}
            </div>
          </div>
          <IconButton
            title={t("chat.extensionCollapse")}
            onClick={() => setCollapsed(true)}
            aria-expanded={true}
            variant="outline"
            className="shrink-0 rounded-md bg-muted"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="2 3.5 5 6.5 8 3.5" />
            </svg>
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
          {request.method === "confirm" && (
            <MarkdownBody>{request.message}</MarkdownBody>
          )}
          {request.method === "select" && (
            <div
              onKeyDown={(event) => {
                if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) return;
                const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-extension-option]"));
                const index = buttons.indexOf(event.target as HTMLElement);
                if (index < 0) return;
                event.preventDefault();
                const next = event.key === "Home" ? 0
                  : event.key === "End" ? buttons.length - 1
                  : (index + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
                buttons[next].focus({ preventScroll: true });
                buttons[next].scrollIntoView({ block: "nearest" });
              }}
              className="grid gap-2"
            >
              {request.options.map((option, index) => (
                <div
                  key={option}
                  role="button"
                  tabIndex={0}
                  data-extension-option
                  aria-label={option}
                  ref={index === 0 ? focusFirstOption : undefined}
                  onClick={() => onRespond(request, { value: option })}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onRespond(request, { value: option });
                  }}
                  // `focus({preventScroll})` + `scrollIntoView({block: "nearest"})` aligns the option
                  // edge to the scrollport edge, which with the dialog's fractional offsets leaves a
                  // sub-pixel of the option clipped (measured 0.4px). A 2px scroll margin keeps the
                  // focused option strictly inside the scrollport.
                  className="w-full cursor-pointer scroll-my-0.5 rounded-[7px] border border-border bg-muted px-2.5 py-[9px] text-left text-[13px] break-words text-foreground"
                >
                  <div inert>
                    <MarkdownBody>{option}</MarkdownBody>
                  </div>
                </div>
              ))}
            </div>
          )}
          {request.method === "input" && (
            <Input
              autoFocus
              value={value}
              placeholder={request.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submitValue();
              }}
              className="h-auto rounded-[7px] bg-muted px-2.5 py-[9px] text-[13px]"
            />
          )}
          {request.method === "editor" && (
            <Textarea
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.nativeEvent.isComposing) submitValue();
              }}
              className="min-h-[220px] rounded-[7px] bg-muted p-2.5 font-mono text-[13px] leading-[1.55]"
            />
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-muted px-3.5 py-2.5">
          <Button
            variant="outline"
            autoFocus={request.method === "confirm" || (request.method === "select" && request.options.length === 0)}
            onClick={() => onRespond(request, { cancelled: true })}
          >
             {t("chat.cancel")}
          </Button>
          {request.method === "confirm" ? (
            <Button onClick={submitValue}>
               {t("chat.confirm")}
            </Button>
          ) : request.method !== "select" ? (
            <Button onClick={submitValue}>
               {t("chat.submit")}
            </Button>
          ) : null}
        </div>
      </div>
      )}
    </div>
  );
}

type ExtensionCustomRequest = Extract<ExtensionUiRequest, { method: "custom" }>;

function ExtensionCustomPanel({
  request,
  onInput,
}: {
  request: ExtensionCustomRequest;
  onInput: (request: ExtensionCustomRequest, data: string) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const displayLines = normalizeCustomPanelLines(request.lines);
  const summary = displayLines.find((line) => line.trim())?.trim();

  useEffect(() => {
    if (!collapsed) inputRef.current?.focus();
  }, [collapsed]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[95] flex justify-center p-5",
        collapsed ? "items-start" : "items-center",
      )}
    >
      {collapsed ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setCollapsed(false)}
          aria-expanded={false}
          className="pointer-events-auto h-auto w-full max-w-[min(920px,100%)] justify-start gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-foreground shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
        >
          <span className="shrink-0 text-[11px] font-semibold text-primary">
            {t("chat.extensionPending")}
          </span>
          <span className="min-w-0 flex-1 overflow-hidden text-[13px] font-semibold text-ellipsis whitespace-nowrap">
            {t("chat.extensionPanel")}
          </span>
          {summary && (
            <span className="max-w-[34%] shrink overflow-hidden text-xs text-ellipsis whitespace-nowrap text-muted-foreground">
              {summary}
            </span>
          )}
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("chat.extensionExpand")}
          </span>
        </Button>
      ) : (
      <div
        role="dialog"
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest("button")) inputRef.current?.focus();
        }}
        className="pointer-events-auto relative flex w-[min(920px,100%)] max-h-[min(760px,100%)] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-[0_20px_60px_rgba(0,0,0,0.28)] outline-none"
      >
        <textarea
          ref={inputRef}
           aria-label={t("chat.extensionInput")}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onKeyDown={(event) => {
            if (composingRef.current || event.nativeEvent.isComposing) return;
            const data = toTerminalKeyData(event);
            if (!data) return;
            event.preventDefault();
            event.stopPropagation();
            onInput(request, data);
          }}
          onInput={(event) => {
            if (composingRef.current || event.nativeEvent.isComposing) return;
            const text = event.currentTarget.value;
            event.currentTarget.value = "";
            if (text) onInput(request, text);
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            const input = event.currentTarget;
            queueMicrotask(() => {
              const text = input.value;
              input.value = "";
              if (text) onInput(request, text);
            });
          }}
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData.getData("text");
            if (text) onInput(request, asBracketedPaste(text));
          }}
          className="pointer-events-none absolute size-px border-0 p-0 opacity-0"
        />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
           <div className="text-[13px] font-semibold text-foreground">{t("chat.extensionPanel")}</div>
          <div className="flex items-center gap-2">
            <IconButton
              title={t("chat.extensionCollapse")}
              onClick={() => setCollapsed(true)}
              aria-expanded={true}
              variant="outline"
              className="shrink-0 rounded-md bg-muted"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="2 3.5 5 6.5 8 3.5" />
              </svg>
            </IconButton>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onInput(request, "\x03")}
            >
               {t("chat.close")}
            </Button>
          </div>
        </div>
        <pre className="m-0 min-h-0 overflow-auto bg-muted p-3.5 font-mono text-[13px] leading-[1.45] whitespace-pre text-foreground">
          <AnsiText text={displayLines.join("\n")} />
        </pre>
      </div>
      )}
    </div>
  );
}
