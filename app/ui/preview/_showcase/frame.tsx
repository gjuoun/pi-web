import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  /** A desktop app window: the real layout at 1280 x 800. */
  app: "h-[800px] w-[1280px]",
  /** The timeline column beside a blank chat area. */
  rail: "h-[560px] w-[520px]",
  /** The message column on its own. */
  chat: "h-[720px] w-[900px]",
  /** The sidebar column on its own. */
  column: "h-[800px] w-[260px]",
  /** The settings dialog surface. */
  dialog: "h-[672px] w-[1080px]",
  /** A single region, as tall as its content. */
  region: "w-[1280px]",
} as const;

export type FrameSize = keyof typeof SIZES;

/**
 * A fixed-size frame that hosts a composed view. `name` is the `data-shot` hook that
 * `preview-shots.mjs` screenshots; names are unique per page. Wider than the content column, so the
 * wrapper scrolls horizontally instead of squeezing the layout.
 */
export function Frame({ name, size = "app", className, children }: { name: string; size?: FrameSize; className?: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto pb-2">
      <div data-shot={name} className={cn("relative flex shrink-0 overflow-hidden bg-background text-foreground ring-1 ring-border", SIZES[size], className)}>
        {children}
      </div>
    </div>
  );
}
