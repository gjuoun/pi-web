import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SectionGlyph } from "../glyphs";

export type SettingsSection = "general" | "models" | "skills" | "plugins";

const TABS = [
  { id: "general", label: "General" },
  { id: "models", label: "Models" },
  { id: "skills", label: "Skills" },
  { id: "plugins", label: "Plugins" },
] as const;

const TAB =
  "relative flex h-full w-24 flex-none items-center justify-center gap-[5px] whitespace-nowrap border-0 bg-transparent px-0.5 text-xs outline-none transition-colors after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-6 after:-translate-x-1/2 after:rounded-t-sm after:bg-primary after:transition-[opacity,transform]";

/**
 * The settings dialog, ported from the real `SettingsPanel` + shadcn `DialogContent` as a plain block (no
 * portal, no overlay): the dialog's own classes (popover fill, ring, `gap-4` between header and body), the
 * title row with the four section tabs and the × button, then the section body.
 */
export function SettingsDialogView({ section, children }: { section: SettingsSection; children: ReactNode }) {
  return (
    <div data-slot="settings-dialog-view" aria-label="Settings" className="flex h-full w-full flex-col gap-4 overflow-hidden rounded-lg bg-popover p-0 text-sm text-popover-foreground ring-1 ring-foreground/10">
      <h2 className="sr-only">Settings</h2>
      <div className="relative flex min-h-[50px] shrink-0 items-center border-b border-border pr-[52px] pl-[18px]">
        <strong className="shrink-0 text-[15px] font-normal whitespace-nowrap text-foreground">Settings</strong>
        <nav aria-label="Settings" className="ml-[22px] flex h-[50px] min-w-0 items-stretch gap-0.5 overflow-x-auto overflow-y-hidden">
          {TABS.map(({ id, label }) => {
            const selected = id === section;
            return (
              <div
                key={id}
                data-slot="settings-tab"
                data-tab={id}
                aria-current={selected ? "page" : undefined}
                className={cn(TAB, selected ? "font-semibold text-foreground after:scale-x-100 after:opacity-100" : "font-normal text-muted-foreground after:scale-x-50 after:opacity-0")}
              >
                <SectionGlyph section={id} />
                <span>{label}</span>
              </div>
            );
          })}
        </nav>
        <span aria-label="Close" role="img" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "absolute top-2.5 right-3.5 text-lg leading-none")}>×</span>
      </div>
      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="h-full min-h-0 w-full min-w-0 flex-1">{children}</div>
      </main>
    </div>
  );
}
