"use client";

import { useEffect, useState } from "react";

/** The computed value of a CSS custom property on `:root`, read after hydration. */
export function ComputedVar({ name }: { name: string }) {
  const [value, setValue] = useState("");
  useEffect(() => {
    setValue(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  }, [name]);
  return <code className="font-mono text-xs text-muted-foreground">{value || "…"}</code>;
}
