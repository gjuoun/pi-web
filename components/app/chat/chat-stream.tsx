import type { Turn } from "../view-types";
import { AssistantMessage } from "./assistant-message";
import { CompactionCard } from "./notice";
import { UserMessage } from "./user-message";

/**
 * The message column inside the chat scroller: `px-4` padding around an `820px` reading column
 * (`--chat-content-max-width`), every turn in order. An error notice is an errored assistant reply.
 */
export function ChatStream({ turns, model = "Claude Sonnet 5.5" }: { turns: Turn[]; model?: string }) {
  // The real chat shows an assistant message's time only when it is the last assistant message before the
  // next user turn (`ChatWindow.renderMessage`); a compaction entry is not an assistant message.
  const isAssistant = (turn: Turn) => turn.kind === "assistant" || (turn.kind === "notice" && turn.tone === "error");
  const showTime = (index: number) => {
    for (let j = index + 1; j < turns.length; j++) {
      if (turns[j].kind === "user") return true;
      if (isAssistant(turns[j])) return false;
    }
    return true;
  };
  return (
    <div data-slot="chat-stream" className="min-w-0 px-4">
      <div className="mx-auto w-full max-w-[var(--chat-content-max-width,820px)] min-w-0">
        {turns.map((turn, i) =>
          turn.kind === "user" ? (
            <UserMessage key={i} lines={turn.lines} time={turn.time} />
          ) : turn.kind === "assistant" ? (
            <AssistantMessage key={i} model={turn.model} blocks={turn.blocks} usage={turn.usage} time={showTime(i) ? turn.time : undefined} />
          ) : turn.tone === "error" ? (
            <AssistantMessage key={i} model={model} blocks={[]} time={showTime(i) ? turn.time : undefined} error={`Error: ${turn.text}`} />
          ) : (
            <CompactionCard key={i} text={turn.text} time={turn.time} />
          ),
        )}
        <div aria-hidden="true" className="snap-end" />
      </div>
    </div>
  );
}
