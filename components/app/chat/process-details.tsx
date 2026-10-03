import { cn } from "@/lib/utils";
import type { ProcessRun } from "../view-types";
import { MessageMeta } from "./message-meta";
import { ThinkingLine } from "./thinking-line";
import { ToolCallPill } from "./tool-call-pill";

/**
 * The "Process details" fold, ported from the real `ProcessDetails` summary row. Collapsed (the real
 * default) it is one row: a right-pointing chevron and `Process details · N messages · M tool calls`.
 * `expanded` draws the rows under it from the earlier replica, which has not been compared with the real
 * expanded markup (that needs a click the parity harness does not make yet).
 */
export function ProcessDetails({ run, expanded = false }: { run: ProcessRun; expanded?: boolean }) {
  const summary = `Process details · ${run.messages} messages · ${run.toolCalls} tool calls`;
  return (
    <div data-slot="process-details" data-expanded={expanded}>
      <div className="mb-3.5">
        <div data-slot="process-details-toggle" className="flex min-h-6 w-auto items-center gap-2 border-none bg-transparent py-0.5 text-left text-xs text-muted-foreground">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn("shrink-0", expanded && "rotate-90")}>
            <polyline points="4 2.5 7.5 6 4 9.5" />
          </svg>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{summary}</span>
        </div>
        {expanded ? (
          <div className="mt-2 flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">{run.model}</div>
            <div className="flex flex-col gap-1.5">
              {run.steps.map((step, i) =>
                step.kind === "thinking" ? (
                  <ThinkingLine key={i} text={step.text} duration={step.duration} />
                ) : (
                  <ToolCallPill key={i} name={step.name} summary={step.summary} duration={step.duration} failed={step.failed} />
                ),
              )}
            </div>
            {run.usage ? <MessageMeta usage={run.usage} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
