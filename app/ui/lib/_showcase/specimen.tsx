import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

/**
 * One component (or one foundation) on display: its name, the file it lives in, the variants it
 * demonstrates, and the live render. `name` is the `data-specimen` hook the coverage tests use.
 */
export function Specimen({ name, title, source, variants, children }: { name: string; title: string; source?: string; variants?: readonly string[]; children: ReactNode }) {
  return (
    <div data-specimen={name} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
        {source ? <code className="font-mono text-xs text-muted-foreground">{source}</code> : null}
      </div>
      {variants?.length ? (
        <div className="flex flex-wrap gap-1">
          {variants.map((variant, index) => (
            <Badge key={`${index}-${variant}`} variant="secondary">{variant}</Badge>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
