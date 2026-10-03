import type { Metadata } from "next";
import { ComponentsSection } from "./_sections/components";
import { FoundationsSection } from "./_sections/foundations";
import { PrimitivesSection } from "./_sections/primitives";
import { ThemesSection } from "./_sections/themes";

export const metadata: Metadata = {
  title: "pi-web component library",
  description: "Every native shadcn primitive and every named app component, as they look in code.",
  robots: { index: false, follow: false },
};

const TOC = [
  { id: "foundations", label: "Foundations" },
  { id: "primitives", label: "Primitives" },
  { id: "components", label: "App components" },
  { id: "themes", label: "Themes" },
] as const;

/**
 * The component library: a static showcase of the UI parts pi-web is built from. Sections are
 * added as their components exist; `page.test.mjs` fails when a primitive or app component has no
 * specimen, so this page stays complete by construction.
 *
 * The app shell pins html/body to the viewport with `overflow: hidden` (app.css), so the page
 * itself is the scroll container (`h-dvh overflow-y-auto`) rather than the document.
 */
export default function UiLibPage() {
  return (
    <div data-slot="ui-lib" className="h-dvh overflow-y-auto bg-background text-foreground">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="Component library sections" className="lg:sticky lg:top-10 lg:self-start">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Library</p>
          <ul className="flex flex-col gap-1 text-sm">
            {TOC.map(({ id, label }) => (
              <li key={id}>
                <a href={`#${id}`} className="text-muted-foreground hover:text-foreground">{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex min-w-0 flex-col gap-14">
          <header className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">pi-web component library</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Native shadcn primitives stay untouched in <code className="font-mono">components/ui</code>; named app components in{" "}
              <code className="font-mono">components/app</code> compose them. Colours come only from the raw variables in{" "}
              <code className="font-mono">app/globals.css</code>.
            </p>
          </header>
          <FoundationsSection />
          <PrimitivesSection />
          <ComponentsSection />
          <ThemesSection />
        </main>
      </div>
    </div>
  );
}
