import type { ReactNode } from "react";
import type { AssistantBlock } from "../view-types";
import { CodeBlockView } from "./code-block-view";

const inlineCode = "rounded-[5px] bg-muted px-[5px] py-px font-mono text-[0.92em] text-foreground ring-1 ring-inset ring-border";

/** Inline `code` and **bold** spans; everything else is plain text (React escapes it). */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("`")) return <code key={i} className={inlineCode}>{part.slice(1, -1)}</code>;
        if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
        return part;
      })}
    </>
  );
}

function Block({ block }: { block: Exclude<AssistantBlock, { kind: "process" }> }): ReactNode {
  switch (block.kind) {
    case "p":
      return <p><Inline text={block.text} /></p>;
    case "h": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3";
      return <Tag data-slot="prose-heading">{block.text}</Tag>;
    }
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag data-slot="prose-list">
          {block.items.map((item) => <li key={item}><Inline text={item} /></li>)}
        </Tag>
      );
    }
    case "code":
      return <CodeBlockView lang={block.lang} code={block.code} />;
    case "table":
      return (
        <div data-slot="prose-table" className="my-2 w-full overflow-x-auto overflow-y-hidden rounded-[7px] border border-border">
          <table className="w-max min-w-full border-separate border-spacing-0 text-[calc(13px+var(--chat-font-size-offset,0px))]">
            <thead>
              <tr>{block.head.map((cell) => <th key={cell}>{cell}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.join("|")}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/**
 * Static markdown content built from typed blocks, in the real `MarkdownBody`'s clothes: a
 * `.markdown-body` container (its element styles live in `app/app.css`), real class lists on inline
 * code and the table wrapper. `process` blocks are the caller's job.
 */
export function Prose({ blocks, className }: { blocks: AssistantBlock[]; className?: string }) {
  return (
    <div data-slot="prose" className={className ? `markdown-body ${className}` : "markdown-body"}>
      {blocks.map((block, i) => (block.kind === "process" ? null : <Block key={i} block={block} />))}
    </div>
  );
}
