import type { ReactNode } from "react";

/** A top-level block of the library page; `id` is the anchor and the `data-section` hook. */
export function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} data-section={id} className="scroll-mt-6 flex flex-col gap-6">
      <header className="flex flex-col gap-1 border-b border-border pb-3">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}
