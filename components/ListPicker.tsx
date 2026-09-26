"use client";

import { useState } from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/**
 * The one list picker behind every model / reasoning-level entry point.
 *
 * pi drives both of its selectors through a hand-rolled SelectList: a panel that owns its own search
 * input, wraps the cursor at both ends of the list, confirms with Enter and cancels with Escape
 * (pi-tui select-list.ts#L145-170, model-selector.ts#L362-411). Pi Web has no TUI, so this is the
 * same contract in React, now built on shadcn's `Popover` + `Command`: an anchored popover with its
 * own input, auto-focused on open so the user keeps typing straight into it. `Popover` owns Escape,
 * outside-dismiss and viewport-aware flip/shift positioning; `Command` owns the keyboard cursor.
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
 * hit. Deliberately not cmdk's fuzzy scorer: the repo already filters this way in filterModelOptions
 * and FontFamilyPicker, and an AND over tokens is what stops "openai glm" from matching two unrelated
 * rows. `Command` is rendered with `shouldFilter={false}` so this stays the only filter in force.
 */
export function filterPickerItems(items: PickerItem[], query: string): PickerItem[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return items;
  return items.filter((item) => {
    const haystack = (item.label + " " + (item.description ?? "") + " " + item.key).toLocaleLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
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
  const visible = filterPickerItems(items, query);

  return (
    <Popover
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/* A virtual anchor: the panel hangs off an arbitrary DOM rect (the composer textarea, or the
          bottom bar's clicked segment), not off its own trigger, so Popover gets a same-sized,
          click-through stand-in positioned at that rect instead of a real trigger element. */}
      <PopoverAnchor asChild>
        <div
          aria-hidden="true"
          className="pointer-events-none fixed"
          style={{
            top: anchorRect.top,
            left: anchorRect.left,
            width: Math.max(anchorRect.width, 1),
            height: Math.max(anchorRect.bottom - anchorRect.top, 1),
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        data-slot="list-picker"
        align="start"
        side="bottom"
        collisionPadding={8}
        className="w-80 max-w-[calc(100vw-16px)] p-0 font-mono text-xs"
        onEscapeKeyDown={onClose}
        onInteractOutside={onClose}
      >
        <Command shouldFilter={false} aria-label={ariaLabel}>
          <CommandInput
            value={query}
            onValueChange={(value) => setQuery(value)}
            placeholder={placeholder}
            aria-label={ariaLabel}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {visible.map((item) => (
              <CommandItem
                key={item.key}
                value={item.key}
                data-key={item.key}
                data-checked={item.active ? "true" : undefined}
                onSelect={() => onSelect(item.key)}
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.description && (
                  <span className="shrink-0 text-muted-foreground">{item.description}</span>
                )}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
