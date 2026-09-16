"use client";

import type { ReactNode } from "react";
import type { SessionTab } from "@/lib/session-tabs";

/**
 * The session tab strip: one tab per open session, any project.
 *
 * This is the strip ChatGPT desktop puts above the conversation — the sidebar says what exists, this
 * says what is open right now. It deliberately renders no session content, so AppShell stays the only
 * place that decides which chat is mounted.
 *
 * Accessibility contract (relied on by `scripts/probe-ui.mjs`): the wrapper is
 * `[data-panel="session-tabs"]` with `role="tablist"`, each tab is `role="tab"` with `aria-selected`
 * and an accessible name equal to the session title.
 */

export interface SessionTabsProps {
  tabs: readonly SessionTab[];
  activeId: string | null;
  runningSessionIds: ReadonlySet<string>;
  unreadSessionIds: ReadonlySet<string>;
  onSelect: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
}

const MAX_WIDTH = 200;

export function SessionTabs({
  tabs,
  activeId,
  runningSessionIds,
  unreadSessionIds,
  onSelect,
  onClose,
}: SessionTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <div
      data-panel="session-tabs"
      role="tablist"
      aria-label="Open sessions"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        flexShrink: 0,
        overflowX: "auto",
        overflowY: "hidden",
        padding: "0 6px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-panel)",
        scrollbarWidth: "thin",
      }}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.sessionId === activeId;
        const isRunning = runningSessionIds.has(tab.sessionId);
        const isUnread = unreadSessionIds.has(tab.sessionId);
        return (
          <div
            key={tab.sessionId}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            title={tab.title}
            data-project-key={tab.projectKey}
            onClick={() => onSelect(tab.sessionId)}
            onAuxClick={(event) => {
              // Middle click closes, matching the file tab bar.
              if (event.button === 1) {
                event.preventDefault();
                onClose(tab.sessionId);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(tab.sessionId);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              maxWidth: MAX_WIDTH,
              flexShrink: 0,
              height: 32,
              padding: "0 6px 0 10px",
              marginBottom: -1,
              cursor: "pointer",
              fontSize: 12,
              color: isActive ? "var(--text)" : "var(--text-muted)",
              background: isActive ? "var(--bg)" : "transparent",
              borderBottom: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
              borderRadius: "6px 6px 0 0",
            }}
          >
            {index < 9 && (
              <span style={{ color: "var(--text-dim)", fontSize: 10, fontFamily: "var(--font-mono)" }}>
                {index + 1}
              </span>
            )}
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {tab.title}
            </span>
            <SessionTabDot running={isRunning} unread={isUnread} />
            <CloseTabButton title={tab.title} onClose={() => onClose(tab.sessionId)} />
          </div>
        );
      })}
    </div>
  );
}

function SessionTabDot({ running, unread }: { running: boolean; unread: boolean }): ReactNode {
  if (!running && !unread) return null;
  return (
    <span
      aria-hidden="true"
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        flexShrink: 0,
        background: running ? "var(--accent)" : "var(--text-dim)",
        opacity: unread && !running ? 0.9 : 1,
      }}
    />
  );
}

function CloseTabButton({ title, onClose }: { title: string; onClose: () => void }): ReactNode {
  return (
    <button
      type="button"
      aria-label={`Close ${title}`}
      data-action="close-session-tab"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        padding: 0,
        flexShrink: 0,
        background: "none",
        border: "none",
        borderRadius: 4,
        color: "var(--text-dim)",
        cursor: "pointer",
        fontSize: 13,
        lineHeight: 1,
      }}
    >
      ×
    </button>
  );
}
