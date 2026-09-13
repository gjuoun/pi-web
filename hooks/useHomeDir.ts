"use client";

import { useEffect, useState } from "react";

// `/api/home` is a stable value for the lifetime of the tab, so one fetch is
// shared by every consumer (module scope survives remounts, not a reload).
let cachedHome: string | null = null;
let inFlight: Promise<string | null> | null = null;

async function loadHomeDir(): Promise<string | null> {
  if (cachedHome) return cachedHome;
  inFlight ??= fetch("/api/home")
    .then((response) => response.json() as Promise<{ home?: string }>)
    .then((data) => {
      cachedHome = data.home ?? null;
      return cachedHome;
    })
    .catch(() => null);
  return inFlight;
}

/** Home directory used to collapse paths to `~`; empty until the fetch resolves. */
export function useHomeDir(): string {
  const [homeDir, setHomeDir] = useState(cachedHome ?? "");

  useEffect(() => {
    let active = true;
    void loadHomeDir().then((home) => {
      if (active && home) setHomeDir(home);
    });
    return () => {
      active = false;
    };
  }, []);

  return homeDir;
}
