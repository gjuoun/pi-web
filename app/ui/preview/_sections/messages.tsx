import { AssistantMessage } from "@/components/app/chat/assistant-message";
import { ChatStream } from "@/components/app/chat/chat-stream";
import { CodeBlockView } from "@/components/app/chat/code-block-view";
import { MessageMeta } from "@/components/app/chat/message-meta";
import { NewSessionView } from "@/components/app/chat/new-session-view";
import { CompactionCard } from "@/components/app/chat/notice";
import { ProcessDetails } from "@/components/app/chat/process-details";
import { Prose } from "@/components/app/chat/prose";
import { ThinkingLine } from "@/components/app/chat/thinking-line";
import { ToolCallPill } from "@/components/app/chat/tool-call-pill";
import { UserMessage } from "@/components/app/chat/user-message";
import { Specimen } from "@/app/ui/lib/_showcase/specimen";
import { Frame } from "../_showcase/frame";
import { turns } from "../_fixtures/conversation";

const assistant = turns.find((t) => t.kind === "assistant" && t.blocks.some((b) => b.kind === "process"));
const process = assistant?.kind === "assistant" ? assistant.blocks.find((b) => b.kind === "process") : undefined;
const answer = turns.find((t) => t.kind === "assistant");
const user = turns.find((t) => t.kind === "user");
const error = turns.find((t) => t.kind === "notice" && t.tone === "error");
const compaction = turns.find((t) => t.kind === "notice" && t.tone === "compaction");

export function MessagesRegion() {
  return (
    <>
      <Specimen name="app-chat-stream" title="ChatStream" source="components/app/chat/chat-stream.tsx" variants={["session with messages"]}>
        <Frame name="messages-session" size="chat"><div className="flex min-w-0 flex-1 flex-col justify-end overflow-hidden pt-4"><ChatStream turns={turns} /></div></Frame>
      </Specimen>
      <Specimen name="app-new-session-view" title="NewSessionView" source="components/app/chat/new-session-view.tsx" variants={["new session"]}>
        <Frame name="messages-new" size="chat"><div className="flex h-full w-full flex-col"><div className="min-h-0 flex-1" /><div className="relative shrink-0"><NewSessionView /></div><div className="min-h-0 flex-1" /></div></Frame>
      </Specimen>
      <Specimen name="app-user-message" title="UserMessage" source="components/app/chat/user-message.tsx">
        <div className="w-[820px]">{user?.kind === "user" ? <UserMessage lines={user.lines} time={user.time} /> : null}</div>
      </Specimen>
      <Specimen name="app-assistant-message" title="AssistantMessage" source="components/app/chat/assistant-message.tsx" variants={["markdown blocks", "usage line"]}>
        <div className="w-[820px]">{answer?.kind === "assistant" ? <AssistantMessage {...answer} /> : null}</div>
      </Specimen>
      <Specimen name="app-prose" title="Prose" source="components/app/chat/prose.tsx" variants={["heading", "list", "inline code", "table"]}>
        <div className="w-[820px]">
          <Prose
            blocks={[
              { kind: "h", level: 2, text: "A heading" },
              { kind: "p", text: "Body text with `inline code` and a **bold** phrase." },
              { kind: "list", items: ["First point", "Second point with `code`"] },
              { kind: "table", head: ["Name", "Role"], rows: [["AppSidebar", "left column"], ["TopBar", "36px row"]] },
            ]}
          />
        </div>
      </Specimen>
      <Specimen name="app-code-block-view" title="CodeBlockView" source="components/app/chat/code-block-view.tsx">
        <div className="w-[820px]"><CodeBlockView lang="ts" code={"const answer: number = 42;\nconsole.log(answer);"} /></div>
      </Specimen>
      <Specimen name="app-process-details" title="ProcessDetails" source="components/app/chat/process-details.tsx" variants={["collapsed", "expanded (unmeasured)"]}>
        <div className="flex w-[820px] flex-col gap-3">{process?.kind === "process" ? <><ProcessDetails run={process.run} /><ProcessDetails run={process.run} expanded /></> : null}</div>
      </Specimen>
      <Specimen name="app-thinking-line" title="ThinkingLine" source="components/app/chat/thinking-line.tsx">
        <div className="w-[820px]"><ThinkingLine text="Before grounding I'm weighing whether to read the code myself or delegate to finder subagents" duration="3s" /></div>
      </Specimen>
      <Specimen name="app-tool-call-pill" title="ToolCallPill" source="components/app/chat/tool-call-pill.tsx" variants={["ok", "failed"]}>
        <div className="flex w-[820px] flex-col gap-1.5">
          <ToolCallPill name="bash" summary="npm test" duration="23s" />
          <ToolCallPill name="edit" summary="app/ui/preview/page.tsx" duration="0.2s" />
          <ToolCallPill name="bash" summary="node_modules/.bin/tsc --noEmit" duration="9s" failed />
        </div>
      </Specimen>
      <Specimen name="app-message-meta" title="MessageMeta" source="components/app/chat/message-meta.tsx">
        <div className="w-[820px]"><MessageMeta usage={{ input: 2, output: 2632, cacheRead: 404974, cacheWrite: 4253, cost: 0.118 }} time="12:17 AM" /></div>
      </Specimen>
      <Specimen name="app-notice" title="CompactionCard" source="components/app/chat/notice.tsx" variants={["compaction entry", "errored reply (AssistantMessage)"]}>
        <div className="flex w-[820px] flex-col gap-3">
          {compaction?.kind === "notice" ? <CompactionCard text={compaction.text} time={compaction.time} /> : null}
          {error?.kind === "notice" ? <AssistantMessage model="Claude Sonnet 5.5" blocks={[]} time={error.time} error={`Error: ${error.text}`} /> : null}
        </div>
      </Specimen>
    </>
  );
}
