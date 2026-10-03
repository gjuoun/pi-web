import { ComputedVar } from "../_showcase/computed-var";
import { Section } from "../_showcase/section";
import { Specimen } from "../_showcase/specimen";
import type { SHADCN_COLOR_TOKENS } from "./tokens";

type Token = (typeof SHADCN_COLOR_TOKENS)[number];

/**
 * One entry per raw shadcn colour variable. Class names are written out in full (never composed)
 * so Tailwind can see them; a token with a `-foreground` partner renders as a pair.
 */
const SWATCHES: readonly { token: Token; className: string; label?: string }[] = [
  { token: "background", className: "bg-background text-foreground border border-border" },
  { token: "foreground", className: "bg-foreground text-background" },
  { token: "card", className: "bg-card text-card-foreground border border-border" },
  { token: "card-foreground", className: "bg-card-foreground text-card" },
  { token: "popover", className: "bg-popover text-popover-foreground border border-border" },
  { token: "popover-foreground", className: "bg-popover-foreground text-popover" },
  { token: "primary", className: "bg-primary text-primary-foreground" },
  { token: "primary-foreground", className: "bg-primary-foreground text-primary border border-border" },
  { token: "secondary", className: "bg-secondary text-secondary-foreground border border-border" },
  { token: "secondary-foreground", className: "bg-secondary-foreground text-secondary" },
  { token: "muted", className: "bg-muted text-muted-foreground" },
  { token: "muted-foreground", className: "bg-muted-foreground text-muted" },
  { token: "accent", className: "bg-accent text-accent-foreground" },
  { token: "accent-foreground", className: "bg-accent-foreground text-accent" },
  { token: "destructive", className: "bg-destructive text-primary-foreground" },
  { token: "border", className: "bg-border text-foreground" },
  { token: "input", className: "bg-input text-foreground" },
  { token: "ring", className: "bg-ring text-primary-foreground" },
  { token: "chart-1", className: "bg-chart-1 text-primary-foreground" },
  { token: "chart-2", className: "bg-chart-2 text-primary-foreground" },
  { token: "chart-3", className: "bg-chart-3 text-primary-foreground" },
  { token: "chart-4", className: "bg-chart-4 text-primary-foreground" },
  { token: "chart-5", className: "bg-chart-5 text-primary-foreground" },
  { token: "sidebar", className: "bg-sidebar text-sidebar-foreground border border-border" },
  { token: "sidebar-foreground", className: "bg-sidebar-foreground text-sidebar" },
  { token: "sidebar-primary", className: "bg-sidebar-primary text-sidebar-primary-foreground" },
  { token: "sidebar-primary-foreground", className: "bg-sidebar-primary-foreground text-sidebar-primary border border-border" },
  { token: "sidebar-accent", className: "bg-sidebar-accent text-sidebar-accent-foreground" },
  { token: "sidebar-accent-foreground", className: "bg-sidebar-accent-foreground text-sidebar-accent" },
  { token: "sidebar-border", className: "bg-sidebar-border text-sidebar-foreground" },
  { token: "sidebar-ring", className: "bg-sidebar-ring text-sidebar-primary-foreground" },
];

const RADII = [
  { name: "sm", className: "rounded-sm" },
  { name: "md", className: "rounded-md" },
  { name: "lg", className: "rounded-lg" },
  { name: "xl", className: "rounded-xl" },
  { name: "2xl", className: "rounded-2xl" },
] as const;

const TYPE_SCALE = [
  { name: "text-xs", className: "text-xs" },
  { name: "text-sm", className: "text-sm" },
  { name: "text-base", className: "text-base" },
  { name: "text-lg", className: "text-lg" },
  { name: "text-xl", className: "text-xl" },
  { name: "text-2xl", className: "text-2xl" },
] as const;

export function FoundationsSection() {
  return (
    <Section id="foundations" title="Foundations" description="The raw shadcn variables in app/globals.css, and the scales every component draws from. One palette, light only.">
      <Specimen name="foundation-colors" title="Colour tokens" source="app/globals.css :root">
        <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {SWATCHES.map(({ token, className }) => (
            <div key={token} data-swatch={token} className="flex flex-col gap-1.5">
              <div className={`flex h-14 items-end rounded-md px-2 py-1.5 text-sm font-medium ${className}`}>Aa</div>
              <code className="font-mono text-xs text-foreground">--{token}</code>
              <ComputedVar name={`--${token}`} />
            </div>
          ))}
        </div>
      </Specimen>
      <Specimen name="foundation-radius" title="Radius scale" source="--radius" variants={["sm", "md", "lg", "xl", "2xl"]}>
        {RADII.map(({ name, className }) => (
          <div key={name} className="flex flex-col items-center gap-1.5">
            <div className={`size-16 border border-border bg-muted ${className}`} />
            <code className="font-mono text-xs text-muted-foreground">rounded-{name}</code>
          </div>
        ))}
        <ComputedVar name="--radius" />
      </Specimen>
      <Specimen name="foundation-type" title="Type scale and font stacks" source="Tailwind text-* · --font-ui · --font-mono">
        <div className="flex w-full flex-col gap-2">
          {TYPE_SCALE.map(({ name, className }) => (
            <div key={name} className="flex items-baseline gap-4">
              <code className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{name}</code>
              <span className={className}>The quick brown fox jumps over the lazy dog</span>
            </div>
          ))}
          <div className="flex items-baseline gap-4">
            <code className="w-20 shrink-0 font-mono text-xs text-muted-foreground">font-mono</code>
            <span className="font-mono text-sm">const answer = 42; // the quick brown fox</span>
          </div>
        </div>
      </Specimen>
    </Section>
  );
}
