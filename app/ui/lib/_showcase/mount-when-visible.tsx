"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Mounts `children` once the placeholder scrolls into view. cmdk's `Command` calls
 * `scrollIntoView` on its selected item at mount, which would otherwise scroll this whole page
 * to the specimen as soon as it hydrates. Mounted while already visible, that call is a no-op.
 */
export function MountWhenVisible({ children, minHeight = 220 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // ui-guard-allow: runtime geometry (placeholder height before the specimen mounts)
  return <div ref={ref} style={{ minHeight }}>{visible ? children : null}</div>;
}
