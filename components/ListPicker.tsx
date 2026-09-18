"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

/**
 * The one list picker behind every model / reasoning-level entry point.
 *
 * pi drives both of its selectors through a hand-rolled SelectList: a panel that owns its own search
 * input, wraps the cursor at both ends of the list, confirms with Enter and cancels with Escape
 * (pi-tui select-list.ts#L145-170, model-selector.ts#L362-411). Pi Web has no TUI, so this is the
 * same contract in React: an anchored popover with its own input, auto-focused on open so the user
 * keeps typing straight into it.
 *
 * The three class names below are a contract — scripts/drive-model-thinking-picker.mjs and
 * ListPicker.test.mjs both read them.
 */

export interface PickerItem {
  key: string;
  label: string;
  description?: string;
  /** The value in force right now; it is checked and is where the cursor starts. */
  active?: boolean;
}

export interface PickerAnchorRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
}

export interface ListPickerProps {
  items: PickerItem[];
  /** The trigger the panel hangs off — a viewport rect, measured on open like ModelSelector does. */
  anchorRect: PickerAnchorRect;
  ariaLabel: string;
  initialQuery?: string;
  placeholder?: string;
  emptyLabel?: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}

/**
 * Case-insensitive substring match, with the query split on whitespace and EVERY token required to
 * hit. Deliberately not pi's fuzzy subsequence scorer (pi-tui fuzzy.ts): the repo already filters
 * this way in filterModelOptions and FontFamilyPicker, and an AND over tokens is what stops
 * "openai glm" from matching two unrelated rows.
 */
export function filterPickerItems(items: PickerItem[], query: string): PickerItem[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return items;
  return items.filter((item) => {
    const haystack = (item.label + " " + (item.description ?? "") + " " + item.key).toLocaleLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

/** pi wraps the cursor at both ends (select-list.ts#L72-76): up from the top lands on the last row. */
export function nextPickerIndex(current: number, count: number, delta: number): number {
  if (count <= 0) return 0;
  const next = current + delta;
  if (next < 0) return count - 1;
  if (next >= count) return 0;
  return next;
}

export function ListPicker({
  items,
  anchorRect,
  ariaLabel,
  initialQuery = "",
  placeholder,
  emptyLabel,
  onSelect,
  onClose,
}: ListPickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Start on the value in force, the way pi's model selector opens on the current model.
  const [activeIndex, setActiveIndex] = useState(() => {
    const stored = items.findIndex((item) => item.active);
    return stored >= 0 ? stored : 0;
  });

  const visible = useMemo(() => filterPickerItems(items, query), [items, query]);
  const highlighted = visible.length === 0 ? -1 : Math.min(activeIndex, visible.length - 1);

  // The input takes focus on mount, so typing filters without a click — the whole point of the
  // composer commands.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [onClose]);

  // Every key the picker owns is stopped here: useKeyboardShortcuts listens at document level for
  // the whole chat, and an Arrow or an Escape meant for this panel must not reach it.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => nextPickerIndex(Math.min(index, Math.max(visible.length - 1, 0)), visible.length, delta));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const item = visible[highlighted];
      if (item) onSelect(item.key);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  // Viewport measurement is client-only; server rendering keeps the panel laid out, just unmeasured.
  const viewportHeight = typeof window === "undefined" ? 800 : (window.visualViewport?.height ?? window.innerHeight);
  const viewportWidth = typeof window === "undefined" ? 1280 : (window.visualViewport?.width ?? window.innerWidth);
  const spaceAbove = anchorRect.top - 8;
  const spaceBelow = viewportHeight - anchorRect.bottom - 8;
  // Both triggers sit low in the window — the composer and the bottom bar — so the panel normally
  // flips above them, and only drops below when there is genuinely no room up there.
  const openAbove = spaceBelow < Math.min(320, viewportHeight * 0.5);
  const maxHeight = Math.max(160, Math.min(openAbove ? spaceAbove : spaceBelow, viewportHeight * 0.6));
  const verticalPosition = openAbove
    ? { bottom: viewportHeight - anchorRect.top + 6 }
    : { top: anchorRect.bottom + 6 };
  const left = Math.max(8, anchorRect.left);
  const horizontalPosition: CSSProperties = {
    left,
    width: Math.max(anchorRect.width, 320),
    maxWidth: Math.max(anchorRect.width, viewportWidth - left - 8),
  };

  return (
    <div
      ref={panelRef}
      className="list-picker"
      role="listbox"
      aria-label={ariaLabel}
      style={{ ...verticalPosition, ...horizontalPosition, maxHeight }}
    >
      <div className="list-picker-search">
        <input
          ref={inputRef}
          className="list-picker-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            // A new query re-ranks the list, so the cursor goes back to the top (pi does the same).
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="list-picker-list">
        {visible.length === 0 ? (
          <div className="list-picker-empty">{emptyLabel}</div>
        ) : (
          visible.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="option"
              data-key={item.key}
              aria-selected={index === highlighted}
              className={"list-picker-item" + (index === highlighted ? " is-active" : "")}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(item.key)}
            >
              <span className="list-picker-check">
                {item.active ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="1.5 5 4 7.5 8.5 2.5" />
                  </svg>
                ) : null}
              </span>
              <span className="list-picker-label">{item.label}</span>
              {item.description && <span className="list-picker-desc">{item.description}</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
