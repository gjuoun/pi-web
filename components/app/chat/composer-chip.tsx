import { X } from "lucide-react";
import type { ComposerChipItem } from "../view-types";

/** An attached image above the input, as the real composer shows it: a 56px square preview with a remove badge. */
export function ComposerChip({ label }: Omit<ComposerChipItem, "id">) {
  return (
    <div data-slot="composer-chip" data-chat-chip="" className="relative shrink-0">
      <div className="flex h-14 w-14 items-center justify-center rounded-md border border-border bg-muted px-1 text-center text-[10px] leading-tight break-all text-muted-foreground">{label}</div>
      <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full border border-border bg-sidebar p-0 text-muted-foreground">
        <X aria-hidden="true" className="size-2" />
      </span>
    </div>
  );
}
