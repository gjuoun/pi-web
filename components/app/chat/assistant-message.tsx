import { getFileIcon } from "@/components/FileIcons";
import type { AssistantBlock, UsageLine } from "../view-types";
import { MessageMeta } from "./message-meta";
import { ProcessDetails } from "./process-details";
import { Prose } from "./prose";

/** Files the turn's successful edit/write tool calls touched: their base names, in order, without repeats. */
function writtenFileNames(blocks: AssistantBlock[]): string[] {
  const names = blocks.flatMap((block) => (block.kind === "process" ? block.run.steps : []))
    .flatMap((step) => (step.kind === "tool" && (step.name === "edit" || step.name === "write") && !step.failed ? [step.summary.split("/").pop() ?? step.summary] : []));
  return [...new Set(names)];
}

/**
 * An assistant turn as the real `MessageView` draws it. A turn is a sequence of entries: a process fold
 * for each tool-using run (collapsed), then the answer entry — model label, markdown, the files the turn
 * wrote, and the usage row. `error` draws an errored reply: the label, the alert box and the time.
 */
export function AssistantMessage({ model, blocks, usage, time, error }: { model: string; blocks: AssistantBlock[]; usage?: UsageLine; time?: string; error?: string }) {
  const folds = blocks.filter((block) => block.kind === "process");
  const content = blocks.filter((block) => block.kind !== "process");
  const files = writtenFileNames(blocks);
  return (
    <div data-slot="assistant-message" data-model={model}>
      {folds.map((block, i) => (block.kind === "process" ? <ProcessDetails key={i} run={block.run} /> : null))}
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{model}</span>
        </div>
        <div className="flex flex-col gap-2">
          {content.length ? (
            <div data-message-text="true">
              <Prose blocks={content} />
            </div>
          ) : null}
        </div>
        {error ? <div role="alert" className="mt-0 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-destructive">{error}</div> : null}
        {files.length ? (
          <div aria-label="Files changed" className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {files.map((name) => (
              <span key={name} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-xs text-foreground">
                {getFileIcon(name, 12)}
                <span>{name}</span>
              </span>
            ))}
          </div>
        ) : null}
        <MessageMeta usage={usage} time={time} copy={!error} />
      </div>
    </div>
  );
}

