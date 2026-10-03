import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { buttonVariants } from "@/components/ui/button";
import { getPrismStyle } from "@/lib/code-themes";
import { THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";

const copyButton = cn(buttonVariants({ variant: "ghost", size: "xs" }), "h-auto px-2 py-0.5 text-[11px] font-normal text-muted-foreground");

/**
 * The real `CodeBlock`: a bordered card with a language header and Prism-highlighted code with line
 * numbers. The highlighter is the real one, called with the real props. The theme is not read from
 * a hook (this view has no state): every registry theme's highlighted block is rendered and CSS
 * shows the one that matches the page (`dark:` follows the `dark` class on <html>).
 */
function Highlighted({ theme, lang, code }: { theme: ThemeId; lang: string; code: string }) {
  return (
    <SyntaxHighlighter
      language={lang || "text"}
      style={getPrismStyle(theme)}
      showLineNumbers
      lineNumberStyle={{ color: "var(--muted-foreground)", fontStyle: "normal" }}
      customStyle={{
        margin: 0,
        padding: "11px 13px",
        fontFamily: "var(--font-mono)",
        fontSize: "calc(12.5px + var(--chat-font-size-offset, 0px))",
        lineHeight: 1.62,
        borderRadius: 0,
        background: "transparent",
      }}
      codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
    >
      {code}
    </SyntaxHighlighter>
  );
}

export function CodeBlockView({ lang, code }: { lang: string; code: string }) {
  const light = THEMES.find((theme) => !theme.dark)?.id ?? "default";
  const dark = THEMES.find((theme) => theme.dark)?.id;
  return (
    <div data-slot="code-block-view" className="relative my-1.5 w-full max-w-full min-w-0 overflow-hidden rounded-[7px] border border-border bg-background shadow-[0_1px_0_color-mix(in_srgb,var(--border)_42%,transparent)]">
      <div data-slot="markdown-code-header" className="flex items-center justify-between gap-2 border-b border-border bg-muted px-2.5 py-[5px] text-[11px] text-muted-foreground">
        <span className="font-mono font-semibold text-muted-foreground">{lang || "text"}</span>
        <div className="flex items-center gap-1.5">
          <span className={copyButton}>Copy</span>
        </div>
      </div>
      <div className={dark ? "dark:hidden" : undefined}><Highlighted theme={light} lang={lang} code={code} /></div>
      {dark ? <div className="hidden dark:block"><Highlighted theme={dark} lang={lang} code={code} /></div> : null}
    </div>
  );
}
