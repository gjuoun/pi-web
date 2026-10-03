
/**
 * The compaction card, as the real app draws the `compaction` entry: a small header (`compaction` and the
 * time), a title, a fixed lead-in line and the summary as markdown. (An errored reply is an assistant
 * message with an alert box, not a separate notice: see `AssistantMessage`.)
 */
export function CompactionCard({ text, time }: { text: string; time: string }) {
  return (
    <div data-slot="notice" data-tone="compaction" className="mb-4">
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border bg-sidebar px-2.5 py-1.5 text-muted-foreground">
          <span className="font-mono text-[11px] font-semibold">compaction</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{time}</span>
        </div>
        <div className="px-[13px] pt-[11px] pb-3">
          <div className="text-[calc(15px+var(--chat-font-size-offset,0px))] leading-snug font-bold text-foreground">Conversation compacted</div>
          <div className="mt-[3px] mb-2.5 text-[calc(14px+var(--chat-font-size-offset,0px))] leading-relaxed text-foreground">The conversation history before this point was compacted into the following summary:</div>
          <div className="markdown-body markdown-compaction-message">
            <p>{text}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

