"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { loadInstalledFonts, useInstalledFonts } from "@/hooks/useInstalledFonts";
import { isDefaultFont, type FontPreset, type FontRole } from "@/lib/fonts";
import { pickerFamilies } from "@/lib/fonts-installed";
import { ConfigButton } from "./SettingsUi";

/**
 * One selectable font role: a free-text family field plus a visible list of suggestions.
 *
 * The list leads with the families actually installed on this machine (`/api/fonts`, enumerated by the
 * server from the OS) and keeps the built-in presets as the tail for anything enumeration did not
 * report — the presets double as the fallback when the route is unavailable.
 *
 * The suggestions are a real listbox rather than a native `<datalist>`: Chrome only reveals a
 * datalist after a keystroke or through its own caret, so nothing told the user which presets
 * existed, and a native popup cannot be asserted in a browser check.
 */
export function FontFamilyPicker({
  role,
  label,
  value,
  presets,
  placeholder,
  resetLabel,
  onChange,
  onReset,
}: {
  role: FontRole;
  label: string;
  value: string;
  presets: FontPreset[];
  placeholder: string;
  resetLabel: string;
  onChange: (family: string) => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const { fonts: installedFonts } = useInstalledFonts();
  const inputId = `settings-${role}-font`;
  const listId = `${inputId}-presets`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [anchor, setAnchor] = useState<{ top: number; bottom: number; left: number; width: number } | null>(null);

  const query = value.trim().toLocaleLowerCase();
  const options = useMemo(() => {
    const seen = new Set<string>();
    const list: FontPreset[] = [];
    for (const preset of presets) {
      if (preset.family !== "") continue;
      list.push(preset);
    }
    for (const family of pickerFamilies(installedFonts, role)) {
      if (seen.has(family)) continue;
      seen.add(family);
      list.push({ id: `installed:${family}`, label: family, family });
    }
    for (const preset of presets) {
      if (preset.family === "" || seen.has(preset.family)) continue;
      seen.add(preset.family);
      list.push(preset);
    }
    return list;
  }, [installedFonts, presets, role]);
  const visible = useMemo(
    () => options.filter((option) => !query || `${option.label} ${option.family}`.toLocaleLowerCase().includes(query)),
    [options, query],
  );

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // The settings pane clips its own overflow and the fields sit low in it, so the list is positioned
  // against the viewport (like the model selector) and re-measured while the pane scrolls.
  useEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    const measure = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  const openPicker = () => {
    setOpen(true);
    // Enumerated once per page and only when the list is actually wanted: opening Settings is not a
    // reason to shell out to the OS.
    void loadInstalledFonts();
  };

  const choose = (preset: FontPreset) => {
    setOpen(false);
    setActiveIndex(-1);
    if (preset.family === "") onReset();
    else onChange(preset.family);
  };

  // Key handling lives on the wrapper so it also covers the caret and the reset button: while the
  // list is open, Escape must close the list rather than reach the settings dialog behind it.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openPicker();
      setActiveIndex((index) => Math.min(index + 1, visible.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && visible.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0 && visible[activeIndex]) {
      event.preventDefault();
      choose(visible[activeIndex]);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="settings-font-option" ref={rootRef} onKeyDown={handleKeyDown}>
      <div className="settings-font-option-header">
        <label htmlFor={inputId}>{label}</label>
        <ConfigButton
          variant="ghost"
          size="small"
          className="settings-chat-reset"
          title={resetLabel}
          aria-label={resetLabel}
          disabled={isDefaultFont(value)}
          onClick={onReset}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />
          </svg>
        </ConfigButton>
      </div>
      <div className="settings-font-picker">
        <input
          id={inputId}
          ref={inputRef}
          className="settings-font-input"
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            onChange(event.target.value);
            openPicker();
            setActiveIndex(-1);
          }}
        />
        <ConfigButton
          variant="ghost"
          size="small"
          className="settings-font-picker-toggle"
          title={t("settings.fontSuggestions")}
          aria-label={t("settings.fontSuggestions")}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => {
            if (open) setOpen(false);
            else openPicker();
            inputRef.current?.focus();
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </ConfigButton>
      </div>
      {open && anchor && (() => {
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const spaceAbove = anchor.top - 8;
        const spaceBelow = viewportHeight - anchor.bottom - 8;
        const openAbove = spaceAbove > spaceBelow;
        const maxHeight = Math.max(140, Math.min(openAbove ? spaceAbove : spaceBelow, viewportHeight * 0.45));
        const verticalPosition = openAbove
          ? { bottom: viewportHeight - anchor.top + 4 }
          : { top: anchor.bottom + 4 };
        return (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="settings-font-picker-popover"
            style={{ ...verticalPosition, left: anchor.left, width: anchor.width, maxHeight }}
          >
            {visible.length === 0 && (
              <li className="settings-font-picker-empty" role="presentation">{t("settings.fontNoMatches")}</li>
            )}
            {visible.map((preset, index) => (
              <li
                key={preset.id}
                role="option"
                data-family={preset.family}
                aria-selected={index === activeIndex}
                className={`settings-font-picker-option${index === activeIndex ? " is-active" : ""}${preset.family === "" ? " is-default" : ""}`}
                // onMouseMove, not onMouseEnter: a list that renders under a stationary cursor must not
                // steal the keyboard's highlighted item before the first arrow key.
                onMouseMove={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(preset)}
              >
                <span className="settings-font-picker-label">{preset.label}</span>
                <span className="settings-font-picker-family">
                  {preset.family === "" ? t("settings.fontDefaultBadge") : preset.family}
                </span>
              </li>
            ))}
          </ul>
        );
      })()}
    </div>
  );
}
