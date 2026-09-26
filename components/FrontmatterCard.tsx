"use client";

import type { ReactNode } from "react";
import { formatFrontmatterValue, getFrontmatterTitle } from "@/lib/frontmatter";
import { Card } from "@/components/ui/card";

interface FrontmatterCardProps {
  data: Record<string, unknown> | null;
}

const TAG_KEYS = ["tags", "categories", "keywords", "tag", "category"];

function isUrl(value: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(value);
}

function renderValue(value: unknown): ReactNode {
  const text = formatFrontmatterValue(value);
  if (!text) return null;
  if (typeof value === "string" && isUrl(value)) {
    // Only safe schemes — values come from the user's own file but stay escaped
    // by React regardless; this just prevents javascript: hrefs.
    return (
      <a href={value} target="_blank" rel="noopener noreferrer">
        {text}
      </a>
    );
  }
  // Arrays are rendered as inline text; anything else keeps its plain text form.
  return text;
}

export function FrontmatterCard({ data }: FrontmatterCardProps) {
  if (!data) return null;
  const entries = Object.entries(data);
  if (entries.length === 0) return null;

  const title = getFrontmatterTitle(data.title);

  const tagKey = TAG_KEYS.find((key) => Array.isArray(data[key]));
  const tags = tagKey
    ? (data[tagKey] as unknown[]).map(formatFrontmatterValue).filter(Boolean)
    : [];

  const rows = entries.filter(([key]) => key !== tagKey && (key !== "title" || !title));

  return (
    <Card className="mb-5 gap-2 rounded-lg border-border bg-sidebar px-4 py-3.5">
      {title && <div className="text-[1.3em] leading-[1.35] font-semibold text-foreground">{title}</div>}
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag, index) => (
            <span
              className="rounded-full border border-border bg-muted/40 px-2.5 text-xs leading-[1.6] text-muted-foreground"
              key={`${tag}-${index}`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[13px] leading-[1.55]">
          {rows.map(([key, value]) => (
            <div className="contents" key={key}>
              <dt className="font-mono text-[0.92em] whitespace-nowrap text-muted-foreground">{key}</dt>
              <dd className="m-0 min-w-0 text-foreground break-words [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2">{renderValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
