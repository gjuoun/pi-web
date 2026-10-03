"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY, applyTheme, isThemeId, type ThemeId } from "@/lib/themes";

function subscribe(onChange: () => void): () => void {
  // The pre-paint script and `setTheme` both write `data-theme`, so it is the source of truth.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  // Another tab changing the theme updates this one.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY && isThemeId(event.newValue)) applyTheme(document.documentElement, event.newValue);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): ThemeId {
  const current = document.documentElement.dataset.theme;
  return isThemeId(current) ? current : DEFAULT_THEME;
}

function getServerSnapshot(): ThemeId {
  return DEFAULT_THEME;
}

/** The page theme (`<html data-theme>`) and a setter that persists it for the pre-paint script. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setTheme = useCallback((next: ThemeId) => {
    applyTheme(document.documentElement, next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage unavailable (private mode, quota): the theme still applies for this page view
    }
  }, []);
  return { theme, setTheme, themes: THEMES };
}
