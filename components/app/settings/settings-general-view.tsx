import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { ThemeIcon } from "@/components/ThemeIcon";
import { THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { ChevronDownGlyph, ResetGlyph } from "../glyphs";

export interface GeneralSettingsData {
  uiFont: string;
  monoFont: string;
  thinkingExpanded: boolean;
  contentWidth: number;
  contentWidthRange: readonly [number, number];
  fontSize: number;
  fontSizeRange: readonly [number, number];
  quoteSelection: boolean;
  completionSound: boolean;
  pushDescription: string;
  languages: { name: string; code: string }[];
  language: string;
}

const heading = "m-0 mb-1.5 text-[13px] font-semibold text-foreground";

function Section({ title, hint, first = false, children }: { title: string; hint?: string; first?: boolean; children: React.ReactNode }) {
  return (
    <section className={first ? "mt-6 first-of-type:mt-6" : "mt-[30px]"}>
      <h3 className={heading}>{title}</h3>
      {hint ? <p className="m-0 mb-3 text-[11px] leading-normal text-muted-foreground">{hint}</p> : null}
      {children}
    </section>
  );
}

function AppearanceRadios({ value }: { value: ThemeId }) {
  return (
    <RadioGroup value={value} aria-label="Appearance" className="grid w-full max-w-[420px] grid-cols-2 gap-[3px] p-[3px]">
      {THEMES.map((option) => (
        <label
          key={option.id}
          data-slot="settings-theme-option"
          className="relative flex min-h-11 min-w-0 items-center justify-center gap-[7px] rounded-[5px] px-1.5 text-xs font-normal text-muted-foreground has-[[data-state=checked]]:bg-accent has-[[data-state=checked]]:font-semibold has-[[data-state=checked]]:text-primary"
        >
          <RadioGroupItem value={option.id} aria-label={option.label} className="absolute inset-0 z-10 cursor-pointer rounded-[5px] border-0 bg-transparent opacity-0" />
          <ThemeIcon theme={option.id} />
          <span data-slot="settings-theme-option-label" className="min-w-0 overflow-wrap-anywhere">{option.label}</span>
        </label>
      ))}
    </RadioGroup>
  );
}

/** A font row: label with its (disabled) reset button, then a text-field look-alike showing the placeholder and a chevron button. */
function FontField({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div className="w-full text-xs text-foreground">
      <div className="flex items-center justify-between gap-2">
        <label>{label}</label>
        <Button variant="ghost" size="sm" title={`Reset ${label.toLowerCase()}`} aria-label={`Reset ${label.toLowerCase()}`} disabled><ResetGlyph /></Button>
      </div>
      <div className="relative mt-1.5 flex items-center gap-1.5">
        <div className="mt-1.5 flex h-[26.5px] w-full items-center rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground/50">{placeholder}</div>
        <Button variant="ghost" size="sm" className="size-7 shrink-0 p-0 text-muted-foreground" title="Show font suggestions" aria-label="Show font suggestions"><ChevronDownGlyph /></Button>
      </div>
    </div>
  );
}

function SwitchRow({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex min-h-7 w-full items-center justify-between gap-4 text-xs text-foreground">
      <span>{label}</span>
      <span className="inline-flex items-center gap-2">
        <Switch checked={checked} aria-label={label} title={label} />
      </span>
    </div>
  );
}

function RangeRow({ label, value, unit, range, step, reset }: { label: string; value: number; unit: string; range: readonly [number, number]; step: number; reset: string }) {
  return (
    <div className="w-full text-xs text-foreground">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-2">
        <label>{label}</label>
        <output className="font-mono text-[11px] text-muted-foreground">{`${value}${unit}`}</output>
        <Button variant="ghost" size="icon-sm" title={reset} aria-label={reset} disabled><ResetGlyph /></Button>
      </div>
      <input type="range" min={range[0]} max={range[1]} step={step} defaultValue={value} tabIndex={-1} aria-label={label} className="pointer-events-none mt-0.5 block w-full accent-primary" />
    </div>
  );
}

/**
 * Settings → General, ported from the real `GeneralSettings`: Appearance (the theme radios, the two font
 * fields), Chat (switches and the two sliders), Background push, Language. The real controls are the real
 * primitives with fixed props (`Switch`, `RadioGroup`, `Button`); a font field is a div with the text
 * input's look and its placeholder, and a slider is a non-interactive native range input.
 */
export function SettingsGeneralView({ settings }: { settings: GeneralSettingsData }) {
  return (
    <div data-slot="settings-general-view" className="mx-auto h-full max-h-full w-full max-w-[680px] overflow-y-auto px-[clamp(18px,4vw,40px)] pt-[26px] pb-10">
      <h2 className="m-0 text-lg font-bold text-foreground">General</h2>
      <Section title="Appearance" first>
        {/* The checked theme is the page's theme, which a stateless view cannot read: one group per theme, each
            checked on its own theme, and CSS shows the one that matches `<html class="dark">`. */}
        {THEMES.map((current) => (
          <div key={current.id} data-appearance-for={current.id} className={current.dark ? "hidden dark:block" : "dark:hidden"}>
            <AppearanceRadios value={current.id} />
          </div>
        ))}
        <p className="m-0 mb-3 text-[11px] leading-normal text-muted-foreground">Type a font installed on this device; a missing font falls back to the built-in stack. The monospace font also drives code blocks and the workspace terminal.</p>
        <div className="mt-3 flex w-full max-w-[420px] flex-col gap-3">
          <FontField label="Interface font" placeholder={settings.uiFont} />
          <FontField label="Monospace font" placeholder={settings.monoFont} />
        </div>
      </Section>
      <Section title="Chat">
        <div className="flex w-full max-w-[420px] flex-col gap-3">
          <SwitchRow label="Expand thinking blocks by default" checked={settings.thinkingExpanded} />
          <RangeRow label="Message width" value={settings.contentWidth} unit="px" range={settings.contentWidthRange} step={10} reset="Reset message width" />
          <RangeRow label="Chat font size" value={settings.fontSize} unit="px" range={settings.fontSizeRange} step={1} reset="Reset chat font size" />
          <SwitchRow label="Show actions for selected text" checked={settings.quoteSelection} />
          <SwitchRow label="Play a sound when a run finishes" checked={settings.completionSound} />
        </div>
      </Section>
      <Section title="Background push (iOS home-screen app)" hint={settings.pushDescription}>
        <div className="flex min-h-11 w-full max-w-[420px] items-center justify-between gap-4 rounded-[5px] bg-sidebar px-2.5 text-xs text-foreground">
          <span>Background push (iOS home-screen app)</span>
          <Button variant="outline" size="sm">Register push</Button>
        </div>
      </Section>
      <Section title="Language">
        <div role="radiogroup" aria-label="Language" data-slot="settings-language-options" className="flex w-full max-w-[420px] flex-col gap-[3px]">
          {settings.languages.map(({ name, code }) => {
            const selected = name === settings.language;
            return (
              <div key={code} role="radio" aria-checked={selected} className={cn("flex h-11 items-center gap-2.5 rounded-[5px] px-2.5 text-left text-xs text-foreground", selected && "bg-accent")}>
                <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border", selected ? "border-primary" : "border-input")}>
                  {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
                </span>
                <span className="flex-1">{name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{code}</span>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
