"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { BranchPreview, SessionEntry, SessionTreeNode } from "@/lib/types";
import { useI18n } from "@/hooks/useI18n";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  tree: SessionTreeNode[];
  activeLeafId: string | null;
  onLeafChange: (leafId: string | null) => void;
  /** When true, renders as a compact inline button for embedding in a top bar */
  inline?: boolean;
  /** When inline, use this ref's bounding rect to size/position the dropdown */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Controlled open state for inline mode */
  open?: boolean;
  /** Called when the button is clicked in inline mode */
  onToggle?: () => void;
  /** Whether a session is currently active (used to show appropriate empty reason) */
  hasSession?: boolean;
  /** When inline, render icon-only (no text label) to save horizontal space */
  compact?: boolean;
  /** Keep the inline dropdown mounted while another control supplies its trigger */
  hideInlineButton?: boolean;
}

// Find the visible entry IDs on the path from root to activeLeafId.
// Iterative DFS: a linear session degrades into a chain whose depth equals the
// entry count, so a recursive search overflows the call stack. Walk with an
// explicit stack instead (paths accumulate depth, not the call stack).
export function buildActivePath(nodes: SessionTreeNode[], targetId: string | null): Set<string> {
  if (!targetId) return new Set();
  const target = targetId;
  const stack: { node: SessionTreeNode; path: string[] }[] = nodes.map((n) => ({ node: n, path: [n.entry.id] }));
  while (stack.length > 0) {
    const { node, path } = stack.pop()!;
    if (node.entry.id === target || node.compressedEntryIds?.includes(target)) {
      return new Set(path);
    }
    for (const child of node.children) {
      stack.push({ node: child, path: [...path, child.entry.id] });
    }
  }
  return new Set();
}

function isMessageEntry(entry: SessionEntry): boolean {
  return entry.type === "message" && "message" in entry;
}

// Compress a visible linear chain into the first branching/leaf node.
// Server-side compressed IDs also count as skipped nodes.
// branchPreview is the bounded preview of the first message on the source
// chain. labelEntry keeps unprojected/test shapes working as a fallback.
export function compressChain(node: SessionTreeNode): {
  node: SessionTreeNode;
  skipped: number;
  branchPreview?: BranchPreview;
  labelEntry: SessionEntry;
} {
  let current = node;
  let branchPreview = current.branchPreview;
  let labelEntry: SessionEntry | null = isMessageEntry(current.entry) ? current.entry : null;
  let skipped = current.compressedEntryIds?.length ?? 0;
  while (current.children.length === 1) {
    current = current.children[0];
    branchPreview ??= current.branchPreview;
    if (!labelEntry && isMessageEntry(current.entry)) labelEntry = current.entry;
    skipped += 1 + (current.compressedEntryIds?.length ?? 0);
  }
  return { node: current, skipped, branchPreview, labelEntry: labelEntry ?? current.entry };
}

// Top-level rows of the panel: with multiple roots (a branch was started from
// the very first message) the roots themselves are the branches; otherwise the
// children of the first branching node.
export function selectTopLevelBranches(tree: SessionTreeNode[]): SessionTreeNode[] {
  if (tree.length > 1) return tree;
  if (tree.length === 0) return [];
  const first = compressChain(tree[0]).node;
  return first.children.length > 1 ? first.children : [];
}

function getLabel(entry: SessionEntry): string {
  if (entry.type === "message" && "message" in entry) {
    const msg = entry.message as { role: string; content: unknown };
    const content = msg.content;
    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join(" ");
    }
    if (text.length > 40) text = text.slice(0, 40) + "…";
    if (text) return text;
    if (msg.role === "assistant") return "[assistant]";
  }
  return entry.type;
}

// Does the tree have any branching at all? Iterative: a linear chain has no
// branching but recursing over it would overflow the stack, so walk with a stack.
export function hasSessionBranches(nodes: SessionTreeNode[]): boolean {
  // Sessions branched from the very first message have multiple root nodes.
  if (nodes.length > 1) return true;
  const stack: SessionTreeNode[] = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.children.length > 1) return true;
    for (const child of node.children) stack.push(child);
  }
  return false;
}

interface TreeNodeProps {
  node: SessionTreeNode;
  activePathIds: Set<string>;
  depth: number;
  isLast: boolean;
  parentLines: boolean[]; // whether ancestor at each depth has more siblings after
  onSelect: (id: string) => void;
}

function TreeNodeView({ node, activePathIds, depth, isLast, parentLines, onSelect }: TreeNodeProps) {
  const { node: rep, skipped, branchPreview, labelEntry } = compressChain(node);
  const isActive = activePathIds.has(rep.entry.id);
  const isOnPath = activePathIds.has(node.entry.id) || activePathIds.has(rep.entry.id);
  const label = branchPreview?.text ?? getLabel(labelEntry);
  const role = branchPreview
    ? branchPreview.role ?? null
    : isMessageEntry(labelEntry)
      ? (labelEntry as { message: { role: string } }).message.role
      : null;

  return (
    <div>
      {/* This node row */}
      <div className="flex h-6 cursor-pointer items-center" onClick={() => onSelect(rep.entry.id)}>
        {/* Indent guide lines */}
        {parentLines.map((hasLine, i) => (
          <div key={i} className="relative h-full w-4 shrink-0 self-stretch">
            {hasLine && <div className="absolute top-0 bottom-0 left-[7px] w-px bg-border" />}
          </div>
        ))}

        {/* Branch connector */}
        <div className="relative h-full w-4 shrink-0 self-stretch">
          {/* vertical line up (to parent) */}
          <div className={cn("absolute top-0 left-[7px] w-px bg-border", isLast ? "bottom-1/2" : "bottom-0")} />
          {/* horizontal line to node */}
          <div className="absolute top-1/2 left-[7px] h-px w-[9px] bg-border" />
        </div>

        {/* Node dot */}
        <div
          className={cn(
            "mr-1.5 h-[7px] w-[7px] shrink-0 rounded-full border transition-colors",
            isActive ? "border-transparent bg-primary" : isOnPath ? "border-muted-foreground bg-muted-foreground" : "border-muted-foreground bg-border",
          )}
        />

        {/* Role badge */}
        {role && (
          <Badge
            variant={role === "user" ? "outline" : "secondary"}
            className={cn(
              "mr-[5px] h-4 shrink-0 rounded-[3px] px-1 font-mono text-[9px] leading-4",
              role === "user" ? "border-primary/20 bg-primary/[0.08] text-primary" : "text-muted-foreground",
            )}
          >
            {role === "user" ? "U" : "A"}
          </Badge>
        )}

        {/* Skipped indicator */}
        {skipped > 0 && (
          <span className="mr-[5px] shrink-0 text-[10px] text-muted-foreground">
            +{skipped}
          </span>
        )}

        {/* Label */}
        <span
          className={cn(
            "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]",
            isActive ? "font-medium text-foreground" : "font-normal text-muted-foreground",
          )}
        >
          {label}
        </span>
      </div>

      {/* Children */}
      {rep.children.map((child, idx) => (
        <TreeNodeView
          key={child.entry.id}
          node={child}
          activePathIds={activePathIds}
          depth={depth + 1}
          isLast={idx === rep.children.length - 1}
          parentLines={[...parentLines, !isLast]}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function BranchNavigator({ tree, activeLeafId, onLeafChange, inline, containerRef, open: openProp, onToggle, hasSession, compact, hideInlineButton }: Props) {
  const { t } = useI18n();
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp !== undefined ? openProp : openInternal;
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open || !inline) return;
    const anchor = containerRef?.current ?? btnRef.current;
    if (!anchor) return;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom, left: rect.left, width: rect.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(anchor);
    return () => ro.disconnect();
  }, [open, inline, containerRef]);

  const activePathIds = useMemo(
    () => buildActivePath(tree, activeLeafId),
    [tree, activeLeafId]
  );

  const handleSelect = useCallback((id: string) => {
    onLeafChange(id);
  }, [onLeafChange]);

  const noBranchReason = !hasSession
    ? t("i18n.noActiveSession")
    : !hasSessionBranches(tree)
      ? t("i18n.noBranches")
      : null;

  const topLevel = selectTopLevelBranches(tree);
  const hasContent = !noBranchReason && topLevel.length > 0;

  const branchIcon = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("shrink-0", hasContent ? "text-primary" : "text-muted-foreground")}>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );

  const chevron = (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("ml-0.5 text-muted-foreground transition-transform duration-150", open ? "rotate-180" : "rotate-0")}
    >
      <polyline points="2 3.5 5 6.5 8 3.5" />
    </svg>
  );


  if (inline) {
    return (
      <div className="flex h-full items-stretch">
        <button
          ref={btnRef}
          type="button"
          onClick={() => onToggle ? onToggle() : setOpenInternal((v) => !v)}
          className={cn(
            "h-full items-center gap-1.5 border-0 border-t-2 border-r border-r-border px-3 text-[11px] whitespace-nowrap transition-colors hover:text-foreground",
            hideInlineButton ? "hidden" : "flex",
            open ? "border-t-primary bg-accent text-foreground" : "border-t-transparent bg-transparent text-muted-foreground",
          )}
          title={t("i18n.branches")}
          aria-label={t("i18n.branches")}
          aria-pressed={open}
        >
          {branchIcon}
          {!compact && <span>{t("i18n.branches")}</span>}
        </button>
        {open && dropdownPos && (
          <div
            style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
            className="fixed z-[500] border-b border-border bg-sidebar"
          >
            {hasContent ? (
              <div className="max-h-[260px] overflow-y-auto px-3 pt-1 pb-2">
                {topLevel.map((child, idx) => (
                  <TreeNodeView
                    key={child.entry.id}
                    node={child}
                    activePathIds={activePathIds}
                    depth={0}
                    isLast={idx === topLevel.length - 1}
                    parentLines={[]}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            ) : (
              <div className="px-4 py-2.5 text-xs text-muted-foreground italic">
                {noBranchReason}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative shrink-0 border-b border-border bg-background">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setOpenInternal((v) => !v)}
        className="flex w-full items-center gap-1.5 border-0 bg-transparent px-3 py-[5px] text-left text-[11px] text-muted-foreground"
      >
        {branchIcon}
        <span className="text-muted-foreground">{t("i18n.branches")}</span>
        {chevron}
      </button>

      {/* Tree panel - overlay */}
      {open && (
        <div className="absolute inset-x-0 top-full z-[100] border-b border-border bg-background shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
          {hasContent ? (
            <div className="max-h-[260px] overflow-y-auto px-3 pt-1 pb-2">
              {topLevel.map((child, idx) => (
                <TreeNodeView
                  key={child.entry.id}
                  node={child}
                  activePathIds={activePathIds}
                  depth={0}
                  isLast={idx === topLevel.length - 1}
                  parentLines={[]}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ) : (
            <div className="px-4 py-2.5 text-xs text-muted-foreground italic">
              {noBranchReason ?? t("i18n.noBranches")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
