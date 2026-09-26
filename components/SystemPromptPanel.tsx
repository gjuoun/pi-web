type Translate = (key: string, params?: Record<string, string | number>) => string;

interface Props {
  loading: boolean;
  prompt: string | null;
  translate: Translate;
}

export function SystemPromptPanel({ loading, prompt, translate }: Props) {
  return (
    <section className="flex h-[min(600px,75dvh)] min-h-[220px] flex-col border-b border-border bg-card" aria-label={translate("system.prompt")}>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {prompt ? (
          <div className="overflow-wrap-anywhere font-mono text-xs leading-[1.6] whitespace-pre-wrap text-muted-foreground">{prompt}</div>
        ) : (
          <div className="py-2.5 text-xs text-muted-foreground italic">
            {prompt === ""
              ? translate("system.empty")
              : loading
                ? translate("system.loading")
                : translate("system.load")}
          </div>
        )}
      </div>
    </section>
  );
}
