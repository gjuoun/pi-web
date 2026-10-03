import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Section } from "@/app/ui/lib/_showcase/section";
import { ComposerRegion } from "./_sections/composer";
import { MessagesRegion } from "./_sections/messages";
import { TimelineRegion } from "./_sections/timeline";
import { SidebarRegion } from "./_sections/sidebar";
import { TopbarRegion } from "./_sections/topbar";

export const metadata: Metadata = {
  title: "pi-web app preview",
  description: "A stateless, demo-data rendering of the current pi-web UI, region by region.",
  robots: { index: false, follow: false },
};

const REGIONS = [
  { id: "sidebar", label: "Sidebar", title: "Sidebar", description: "Action row, project groups with session rows, the explorer and the settings footer." },
  { id: "topbar", label: "Top bar", title: "Top bar", description: "Sidebar toggle, chat toolbar, session stats, file panel toggle and the file tabs." },
  { id: "messages", label: "Chat messages", title: "Chat messages", description: "A new session, and a session with user, assistant, process details, error and compaction turns." },
  { id: "composer", label: "Composer", title: "Input and bottom bar", description: "The composer with its variants, and the two-line status bar." },
  { id: "timeline", label: "Timeline", title: "Timeline", description: "The right-edge minimap of turn nodes, with an open preview." },
] as const;

/** Region content by section id. */
const REGION_CONTENT: Record<(typeof REGIONS)[number]["id"], ReactNode> = {
  sidebar: <SidebarRegion />,
  topbar: <TopbarRegion />,
  messages: <MessagesRegion />,
  composer: <ComposerRegion />,
  timeline: <TimelineRegion />,
};

/**
 * A static rendering of the current pi-web UI with demo data, so its look can be discussed and
 * iterated on. Every region is a stateless component in `components/app/*` (props in, markup out:
 * no hooks, no handlers, no text fields). The page owns its scroll (`h-dvh overflow-y-auto`)
 * because the app shell pins html/body to the viewport.
 */
export default function UiPreviewPage() {
  return (
    <div data-slot="ui-preview" className="h-dvh overflow-y-auto bg-background text-foreground">
      <div className="grid max-w-[1560px] grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[160px_minmax(0,1fr)]">
        <nav aria-label="Preview regions" className="lg:sticky lg:top-10 lg:self-start">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Preview</p>
          <ul className="flex flex-col gap-1 text-sm">
            {REGIONS.map(({ id, label }) => (
              <li key={id}>
                <a href={`#${id}`} className="text-muted-foreground hover:text-foreground">{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex min-w-0 flex-col gap-14">
          <header className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">pi-web app preview</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              The current UI as stateless components with demo data. Nothing here is interactive; the page follows the theme chosen in
              Settings. Compare with the real app, then change the components in <code className="font-mono">components/app</code>.
            </p>
          </header>
          {REGIONS.map(({ id, title, description }) => (
            <Section key={id} id={id} title={title} description={description}>
              {REGION_CONTENT[id]}
            </Section>
          ))}
        </main>
      </div>
    </div>
  );
}
