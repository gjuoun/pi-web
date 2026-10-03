/**
 * A user turn as the real `MessageView` draws it: a right-aligned bubble (`rounded-xl`, primary/20 border,
 * muted fill) of markdown paragraphs, and under it the 22px action row, whose buttons are invisible until
 * hover, with the time at the right.
 */
export function UserMessage({ lines, time }: { lines: string[]; time: string }) {
  return (
    <div data-slot="user-message" className="mb-4 flex flex-col items-end">
      <div className="flex max-w-[85%] items-end gap-1.5">
        <div className="max-h-[300px] min-w-0 flex-1 overflow-y-auto rounded-xl border border-primary/20 bg-muted px-3 py-2 text-[calc(14px+var(--chat-font-size-offset,0px))] leading-relaxed break-words text-foreground">
          <div className="markdown-body markdown-user-message">
            {lines.map((line) => <p key={line}>{line}</p>)}
          </div>
        </div>
      </div>
      <div className="mt-[3px] flex items-center justify-end gap-1.5">
        <span aria-hidden="true" className="flex h-[22px] items-center px-2 text-[11px] opacity-0">Copy</span>
        <span className="text-[10px] text-muted-foreground">{time}</span>
      </div>
    </div>
  );
}
