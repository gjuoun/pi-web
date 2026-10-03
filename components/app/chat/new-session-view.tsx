/**
 * The header of a new session's bottom block, ported from the real `ChatWindow`: the π mark, the
 * "update available" link (shown only when a newer release exists; `v` and the number are separate text nodes there, which changes how the run is shaped) and the web / pi versions at the
 * right. It sits above the composer in the same block; the surrounding column splits the free space
 * above and below that block, which is what centres it vertically.
 */
export function NewSessionView({ update = "0.10.0", web = "v0.9.1", pi = "v0.99.2" }: { update?: string; web?: string; pi?: string }) {
  return (
    <div data-slot="new-session-view" className="mx-auto mb-3 w-full max-w-[var(--chat-content-max-width,820px)] pr-[68px] pl-8">
      <div className="flex items-center justify-between gap-3 font-mono">
        <div className="flex min-w-0 flex-1 items-baseline gap-2.5 overflow-hidden leading-[1.4]">
          <span className="shrink-0 text-[28px] font-bold whitespace-nowrap text-foreground">π</span>
          {update ? (
            <span className="inline-flex min-h-8 min-w-0 shrink-0 items-center gap-[3px] self-center rounded-[5px] bg-transparent px-1 text-xs leading-tight font-semibold whitespace-nowrap text-primary no-underline">
              <span className="overflow-hidden text-ellipsis">v{update}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                <path d="M7 17 17 7" />
                <path d="M7 7h10v10" />
              </svg>
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-[11px] text-muted-foreground">{"web "}<span className="text-foreground">{web}</span></span>
          <span className="text-[11px] text-muted-foreground">{"pi "}<span className="text-foreground">{pi}</span></span>
        </div>
      </div>
    </div>
  );
}
