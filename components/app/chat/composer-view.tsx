import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { ComposerChipItem, QueuedMessage } from "../view-types";
import { ComposerChip } from "./composer-chip";

const actionsButton = cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "size-[26px] rounded-[9px] text-muted-foreground");

function QueuedRow({ kind, text }: QueuedMessage) {
  return (
    <div data-slot="composer-queued" data-chat-queued={kind} title={text} className="flex min-w-0 items-center gap-2 px-2.5 py-[3px] text-xs text-muted-foreground">
      <span className={cn("shrink-0 rounded-full border px-[7px] py-px font-mono text-[10px]", kind === "steer" ? "border-primary/45 text-primary" : "border-border text-muted-foreground")}>{kind}</span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{text}</span>
    </div>
  );
}

/**
 * The composer ported from the real `ChatInput`: a fieldset-shaped block (left padding 16, right 52) around
 * the bordered input row — a placeholder line and the `…` actions button. There is no text field: the
 * placeholder is a plain element with the textarea's metrics. `busy` sets the "working" rail colour and swaps
 * the dots for a stop affordance; chips and queued rows are drawn from the real rows' markup.
 */
export function ComposerView({ chips = [], queued = [], busy = false, placeholder = "Message… Type / for commands, @ for files" }: { chips?: ComposerChipItem[]; queued?: QueuedMessage[]; busy?: boolean; placeholder?: string }) {
  return (
    <div data-slot="composer-view" data-busy={busy || undefined} className="m-0 min-w-0 shrink-0 border-0 bg-transparent py-0 pr-13 pl-4">
      {queued.length ? (
        <div className="mb-1.5">
          {queued.map((row) => <QueuedRow key={row.text} {...row} />)}
        </div>
      ) : null}
      {chips.length ? (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {chips.map(({ id, ...chip }) => <ComposerChip key={id} {...chip} />)}
        </div>
      ) : null}
      <div className="relative min-w-0">
        <div
          data-slot="composer-box"
          data-state={busy ? "working" : "idle"}
          className={cn(
            "relative flex min-w-0 flex-row items-center gap-1.5 border-t border-b bg-transparent px-1 py-1.5",
            busy ? "border-warning/40" : "border-[color-mix(in_srgb,var(--border)_70%,transparent)]",
          )}
        >
          <div className="min-h-[24px] w-full min-w-0 flex-1 text-[length:var(--chat-content-font-size,14px)] leading-[1.6] text-foreground/50">{placeholder}</div>
          {busy ? (
            <span data-slot="composer-stop" role="img" aria-label="Stop" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "size-[26px] rounded-[9px] text-destructive")}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
            </span>
          ) : (
            <span data-slot="composer-actions" role="img" aria-label="More actions" className={actionsButton}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="19" cy="12" r="1.7" />
              </svg>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
