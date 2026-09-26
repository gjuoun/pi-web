"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "cn";

export interface ModelSelectorOption {
  provider: string;
  modelId: string;
  name: string;
}

interface ModelSelectorProps {
  options: ModelSelectorOption[];
  value?: { provider: string; modelId: string } | null;
  onChange: (provider: string, modelId: string) => void;
  onClear?: () => void;
  emptyLabel?: string;
  selectedLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  isAutoSelection?: boolean;
  ariaLabel?: string;
  variant?: "toolbar" | "field" | "status";
  placement?: "up" | "auto";
  /**
   * Replaces the trigger text. The `status` variant renders pi's footer label
   * (`provider` + raw model id) rather than the human-facing display name.
   */
  triggerLabel?: string;
}

const MODEL_FILTER_THRESHOLD = 8;
const MODEL_OPTION_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareModelOptions(a: ModelSelectorOption, b: ModelSelectorOption): number {
  return MODEL_OPTION_COLLATOR.compare(a.name || a.modelId, b.name || b.modelId)
    || MODEL_OPTION_COLLATOR.compare(a.provider, b.provider)
    || MODEL_OPTION_COLLATOR.compare(a.modelId, b.modelId);
}

export function filterModelOptions(options: ModelSelectorOption[], query: string): ModelSelectorOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return options;

  return options.filter((option) => (
    `${option.name} ${option.modelId}`
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  ));
}

export function ModelSelector({
  options,
  value,
  onChange,
  onClear,
  emptyLabel,
  selectedLabel,
  disabled = false,
  busy = false,
  isAutoSelection = false,
  ariaLabel,
  variant = "toolbar",
  placement = "up",
  triggerLabel,
}: ModelSelectorProps) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<{ top: number; right: number; bottom: number; left: number; width: number } | null>(null);
  const [filter, setFilter] = useState("");
  const locked = disabled || busy;
  const sortedOptions = useMemo(() => [...options].sort(compareModelOptions), [options]);
  const filteredOptions = filterModelOptions(sortedOptions, filter);
  const showFilter = sortedOptions.length > MODEL_FILTER_THRESHOLD;
  const modelsByProvider: { provider: string; options: ModelSelectorOption[] }[] = [];

  for (const option of filteredOptions) {
    const group = modelsByProvider.find((item) => item.provider === option.provider);
    if (group) group.options.push(option);
    else modelsByProvider.push({ provider: option.provider, options: [option] });
  }

  const currentName = triggerLabel ?? selectedLabel ?? (value
    ? sortedOptions.find((option) => option.modelId === value.modelId && option.provider === value.provider)?.name ?? value.modelId
    : emptyLabel ?? (sortedOptions.length > 0 ? "Select model" : "No models"));

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        rootRef.current && !rootRef.current.contains(event.target as Node)
        && panelRef.current && !panelRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setFilter("");
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!locked) return;
    setOpen(false);
    setFilter("");
  }, [locked]);

  const choose = (option: ModelSelectorOption) => {
    const active = option.modelId === value?.modelId && option.provider === value?.provider;
    setOpen(false);
    setFilter("");
    if (!active || isAutoSelection) onChange(option.provider, option.modelId);
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative min-w-0",
        (variant === "field" || (isMobile && variant === "toolbar")) && "w-full",
        variant === "toolbar" && isMobile && "flex-1",
      )}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setFilter("");
        setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-busy={busy || undefined}
        disabled={locked}
        title={busy ? "Switching model" : locked ? currentName : sortedOptions.length > 0 || onClear ? "Change model" : "No available models"}
        className={cn(
          "flex items-center overflow-hidden text-xs transition-colors",
          variant === "status" && "max-w-full gap-1 border-none bg-transparent p-0 text-inherit",
          variant === "status" && !locked && open && "underline underline-offset-2",
          variant === "status" && locked && "cursor-default",
          variant === "status" && !locked && "cursor-pointer",
          variant === "field" && "h-[34px] w-full min-w-0 gap-1.5 rounded-md border border-border px-2.5 text-left",
          variant === "field" && (locked ? "cursor-default bg-muted text-muted-foreground" : "cursor-pointer bg-background text-foreground hover:bg-accent"),
          variant === "toolbar" && "max-w-[220px] gap-1.5 rounded-lg border-none text-muted-foreground",
          variant === "toolbar" && (isMobile ? "w-full justify-start px-2.5 py-2" : "px-3 py-2"),
          variant === "toolbar" && (open ? "bg-accent" : "bg-transparent"),
          variant === "toolbar" && (locked ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-accent hover:text-foreground"),
        )}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchorRect({ top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width });
          setOpen((current) => {
            if (current) setFilter("");
            return !current;
          });
        }}
      >
        {busy ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="shrink-0 animate-spin" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          </svg>
        ) : variant === "status" ? null : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
            <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
            <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
            <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
            <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
          </svg>
        )}
        <span className="min-w-0 flex-1 truncate">{currentName}</span>
        {variant === "field" && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-muted-foreground">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>

      {open && anchorRect && (() => {
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
        const spaceAbove = anchorRect.top - 8;
        const spaceBelow = viewportHeight - anchorRect.bottom - 8;
        const openAbove = placement === "up" || spaceAbove > spaceBelow;
        const maxHeight = Math.max(120, Math.min(openAbove ? spaceAbove : spaceBelow, viewportHeight * 0.6));
        const verticalPosition = openAbove
          ? { bottom: viewportHeight - anchorRect.top + 6 }
          : { top: anchorRect.bottom + 6 };
        const horizontalPosition: CSSProperties = isMobile
          ? { left: 8, right: 8, maxWidth: "calc(100vw - 16px)" }
          : { left: anchorRect.left, width: "max-content", minWidth: anchorRect.width, maxWidth: Math.max(anchorRect.width, viewportWidth - anchorRect.left - 8) };

        return (
          <div
            ref={panelRef}
            role="listbox"
            aria-label={ariaLabel}
            className={cn(
              "fixed z-[500] flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-md",
              openAbove ? "shadow-[0_-4px_16px_rgba(0,0,0,0.10)]" : "shadow-[0_4px_16px_rgba(0,0,0,0.10)]",
            )}
            style={{ ...verticalPosition, ...horizontalPosition, maxHeight }}
          >
            {showFilter && (
              <div className="shrink-0 border-b border-border p-1.5">
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={t("chat.filterModels")}
                  aria-label={t("chat.filterModels")}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(
                    "box-border w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-foreground outline-none",
                    isMobile ? "min-w-0" : "min-w-[220px]",
                  )}
                />
              </div>
            )}
            <div className="min-h-0 overflow-y-auto">
              {onClear && !filter.trim() && (
                <ModelOptionButton active={!value} label={emptyLabel ?? "Default"} onClick={() => {
                  setOpen(false);
                  setFilter("");
                  onClear();
                }} />
              )}
              {modelsByProvider.length === 0 ? (
                <div className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                  {filter.trim() ? t("chat.noMatchingModels") : "No available models"}
                </div>
              ) : modelsByProvider.map((group, index) => (
                <div key={group.provider}>
                  {modelsByProvider.length > 1 && (
                    <div
                      className={cn(
                        "px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase text-muted-foreground",
                        (index > 0 || onClear) && "border-t border-border",
                      )}
                    >
                      {group.provider}
                    </div>
                  )}
                  {group.options.map((option) => (
                    <ModelOptionButton
                      key={`${option.provider}:${option.modelId}`}
                      active={option.modelId === value?.modelId && option.provider === value?.provider}
                      label={option.name}
                      onClick={() => choose(option)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ModelOptionButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 whitespace-nowrap border-none px-3 py-1.5 text-left text-xs",
        active ? "bg-accent font-semibold text-foreground" : "font-normal text-muted-foreground hover:bg-accent",
      )}
    >
      {active
        ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-primary" aria-hidden="true"><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
        : <span className="w-2.5 shrink-0" />}
      <span title={label} className="min-w-0 overflow-hidden text-ellipsis">{label}</span>
    </button>
  );
}
