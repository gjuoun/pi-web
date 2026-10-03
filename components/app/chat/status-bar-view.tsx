import type { StatusBarData } from "../view-types";

/**
 * The status bar ported from the real `ChatStatusBar` (`chat-status-bar`): project (branch) and session
 * name, then the counters and `model • thinking`. A `fresh` session keeps one line: project and model.
 * The wrapper reproduces the real scroller around it (padding left 16, right 52).
 */
export function StatusBarView({ project, branch, sessionName, stats = [], contextPercent, model, thinking, fresh = false }: StatusBarData & { fresh?: boolean }) {
  const projectLine = branch && !fresh ? `${project} (${branch})` : project;
  const modelCluster = (
    <span data-slot="chat-status-model" className="inline-flex items-baseline gap-1.5 pl-2 whitespace-nowrap">
      <span data-slot="chat-status-segment" className="inline-block">{model}</span>
      {thinking ? <span data-slot="chat-status-thinking"><span data-slot="chat-status-segment" className="inline-block">{`• ${thinking}`}</span></span> : null}
    </span>
  );
  const warn = typeof contextPercent === "number" ? (contextPercent > 90 ? "text-destructive" : contextPercent > 70 ? "text-warning" : undefined) : undefined;
  return (
    <div className="max-h-[min(144px,18dvh)] overflow-auto overscroll-contain">
      <div className="flex w-max min-w-full flex-col py-1 pr-[52px] pl-4">
        <div
          data-slot="status-bar-view"
          data-state={fresh ? "fresh" : undefined}
          className="flex w-full flex-col px-1 font-mono text-[11px] leading-[1.5] text-muted-foreground"
        >
          {fresh ? (
            <div data-slot="status-bar-line" className="flex items-baseline justify-between gap-x-3">
              <span className="shrink-0 whitespace-nowrap">{projectLine}</span>
              {modelCluster}
            </div>
          ) : (
            <>
              <div data-slot="status-bar-line" className="flex items-baseline justify-between gap-x-3">
                <span className="shrink-0 whitespace-nowrap">{projectLine}</span>
                {sessionName ? <span data-slot="status-bar-name" className="shrink-0 pl-2 whitespace-nowrap text-muted-foreground">{sessionName}</span> : null}
              </div>
              <div data-slot="status-bar-line" className="flex items-baseline justify-between gap-x-3">
                <span data-slot="status-bar-stats" className="inline-flex shrink-0 flex-nowrap gap-x-[5px]">
                  {stats.map((text, i) => <span key={text} className={i === stats.length - 1 ? warn : undefined}>{text}</span>)}
                </span>
                {modelCluster}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
