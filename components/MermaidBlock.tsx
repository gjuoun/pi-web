"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { useTheme } from "@/hooks/useTheme";
import { getPrismStyle, getMermaidTheme } from "@/lib/code-themes";
import { useI18n } from "@/hooks/useI18n";
import { copyText } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MermaidBlockProps {
  code: string;
  isStreaming?: boolean;
  defaultPreview?: boolean;
}

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

export function downloadMermaidSvg(svg: SVGSVGElement): void {
  // Mermaid's HTML serialization can leave void tags such as <br> unclosed.
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "mermaid-diagram.svg";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

type RenderState =
  | { key: string; status: "loading" }
  | { key: string; status: "error" }
  | { key: string; status: "ready"; svg: string };

export function MermaidBlock({ code, isStreaming, defaultPreview = false }: MermaidBlockProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [showPreview, setShowPreview] = useState(defaultPreview);
  const [renderState, setRenderState] = useState<RenderState | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const previewRef = useRef<HTMLButtonElement>(null);
  const currentKey = `${theme}\n${code}`;
  const previewVisible = showPreview && !isStreaming;

  useEffect(() => {
    if (!previewVisible) return;

    let cancelled = false;
    setRenderState({ key: currentKey, status: "loading" });

    const render = async () => {
      const { default: mermaid } = await import("mermaid");
      const { theme: mermaidTheme, themeVariables } = getMermaidTheme(theme);
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: mermaidTheme,
        themeVariables,
      });

      const parsed = await mermaid.parse(code, { suppressErrors: true });
      if (!parsed) throw new Error("Invalid Mermaid diagram");

      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? `mermaid-${crypto.randomUUID()}`
          : `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await mermaid.render(id, code);
      if (!cancelled) {
        setRenderState({ key: currentKey, status: "ready", svg: result.svg });
      }
    };

    render().catch(() => {
      if (!cancelled) setRenderState({ key: currentKey, status: "error" });
    });

    return () => {
      cancelled = true;
    };
  }, [code, currentKey, theme, previewVisible]);

  const previewButton = useMemo(() => (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={() => setShowPreview((v) => !v)}
      disabled={isStreaming}
      title={isStreaming ? t("i18n.previewAfterStreaming") : (previewVisible ? t("i18n.showMermaidSource") : t("i18n.previewMermaid"))}
      data-state={previewVisible ? "active" : "inactive"}
      className={cn("h-auto px-2 py-0.5 text-[11px] font-normal text-muted-foreground", previewVisible && "bg-accent text-foreground")}
    >
      {previewVisible ? t("i18n.source") : t("i18n.preview")}
    </Button>
  ), [isStreaming, previewVisible, t]);

  if (!previewVisible) {
    return <CodeBlock code={code} lang="mermaid" headerAction={previewButton} isStreaming={isStreaming} />;
  }

  const mermaidBlockBase = "mermaid-block min-h-[120px] overflow-x-auto p-3";
  const body = renderState?.key === currentKey && renderState.status === "error" ? (
      <div data-slot="mermaid-block-error" className={cn(mermaidBlockBase, "font-mono text-xs text-muted-foreground")}>{t("i18n.invalidMermaid")}</div>
    ) : renderState?.key !== currentKey || renderState.status !== "ready" ? (
      <div data-slot="mermaid-block-loading" className={mermaidBlockBase} aria-label={t("i18n.renderingMermaid")} />
    ) : (
      <>
        {!zoomOpen && (
          <button
            ref={previewRef}
            type="button"
            className={cn(mermaidBlockBase, "w-full max-h-[min(600px,60dvh)] overflow-auto border-0 p-3 text-left text-inherit cursor-zoom-in hover:opacity-85 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 [&_svg]:block [&_svg]:max-w-none")}
            title={t("i18n.openMermaidViewer")}
            aria-label={t("i18n.openMermaidViewer")}
            onClick={() => setZoomOpen(true)}
            dangerouslySetInnerHTML={{ __html: renderState.svg }}
          />
        )}
        {zoomOpen && <MermaidZoomDialog svg={renderState.svg} onClose={() => setZoomOpen(false)} />}
      </>
    );

  return (
    <div
      data-slot="markdown-code-block"
      className="relative my-1.5 min-w-0 max-w-full w-full overflow-hidden rounded-[7px] border border-border bg-background shadow-[0_1px_0_color-mix(in_srgb,var(--border)_42%,transparent)]"
    >
      <div
        data-slot="markdown-code-header"
        className="flex items-center justify-between gap-2 border-b border-border bg-muted px-2.5 py-[5px] text-[11px] text-muted-foreground"
      >
        <span className="font-mono font-semibold text-muted-foreground">mermaid</span>
        <div className="flex items-center gap-1.5">
          {renderState?.key === currentKey && renderState.status === "ready" && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-auto px-2 py-0.5 text-[11px] font-normal text-muted-foreground"
              title={`${t("i18n.downloadFile")} (SVG)`}
              aria-label={`${t("i18n.downloadFile")} (SVG)`}
              onClick={() => {
                const svg = previewRef.current?.querySelector("svg");
                if (svg) downloadMermaidSvg(svg);
              }}
            >
              SVG
            </Button>
          )}
          {previewButton}
        </div>
      </div>
      {body}
    </div>
  );
}

function MermaidZoomDialog({ svg, onClose }: { svg: string; onClose: () => void }) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      data-slot="mermaid-zoom-dialog"
      className="m-0 h-dvh w-screen max-w-none max-h-none border-0 bg-background p-0 text-foreground [&::backdrop]:bg-black/35"
      aria-label={t("i18n.mermaidViewer")}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
    >
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
        <div className="flex min-h-10 items-center gap-2.5 border-b border-border bg-muted px-2.5 py-[7px] max-[480px]:px-2">
          <span className="min-w-0 overflow-hidden truncate font-mono text-[11px] font-semibold text-muted-foreground max-[480px]:text-[10px]">{t("i18n.mermaidDiagram")}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex h-6 items-center overflow-hidden rounded-[5px] border border-border bg-background">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="h-[22px] w-6 rounded-none"
                onClick={() => setZoom((value) => Math.max(ZOOM_MIN, value - ZOOM_STEP))}
                disabled={zoom <= ZOOM_MIN}
                title={t("i18n.zoomOut")}
                aria-label={t("i18n.zoomOut")}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 12h14" />
                </svg>
              </Button>
              <span className="h-[22px] min-w-12 select-none border-l border-border text-center font-mono text-xs leading-[22px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="h-[22px] w-6 rounded-none border-l border-border"
                onClick={() => setZoom((value) => Math.min(ZOOM_MAX, value + ZOOM_STEP))}
                disabled={zoom >= ZOOM_MAX}
                title={t("i18n.zoomIn")}
                aria-label={t("i18n.zoomIn")}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="flex-none border border-border"
              onClick={() => setZoom(1)}
              title={t("i18n.fitToWidth")}
              aria-label={t("i18n.fitToWidth")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
              </svg>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="flex-none border border-border"
              onClick={onClose}
              title={t("i18n.close")}
              aria-label={t("i18n.close")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </Button>
          </div>
        </div>
        <div
          className="min-h-0 min-w-0 overflow-auto bg-background p-6 max-[480px]:p-3 [-webkit-overflow-scrolling:touch]"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <div
            className="mx-auto rounded-[7px] border border-border bg-muted p-3 transition-[width] duration-150 ease-in-out [&_svg]:!block [&_svg]:!w-full [&_svg]:!max-w-none [&_svg]:h-auto"
            style={{ width: `${zoom * 100}%` }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>
    </dialog>
  );
}

interface CodeBlockProps {
  code: string;
  lang: string;
  headerAction?: ReactNode;
  isStreaming?: boolean;
}

/**
 * Syntax-highlighted code block with copy button.
 * Used as the "source" view for mermaid blocks and for all non-mermaid code fences.
 *
 * Memoized: parent markdown re-renders (e.g. streaming updates elsewhere in
 * the message list) must not re-run Prism tokenization on unchanged code.
 * While the owning message is still streaming, the block renders as plain
 * monospace text — highlighting a growing block re-tokenizes all of it on
 * every chunk, which is the single most expensive part of streamed rendering.
 */
export const CodeBlock = memo(function CodeBlock({ code, lang, headerAction, isStreaming }: CodeBlockProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    copyText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      data-slot="markdown-code-block"
      className="relative my-1.5 min-w-0 max-w-full w-full overflow-hidden rounded-[7px] border border-border bg-background shadow-[0_1px_0_color-mix(in_srgb,var(--border)_42%,transparent)]"
    >
      <div
        data-slot="markdown-code-header"
        className="flex items-center justify-between gap-2 border-b border-border bg-muted px-2.5 py-[5px] text-[11px] text-muted-foreground"
      >
        <span className="font-mono font-semibold text-muted-foreground">{lang || "text"}</span>
        <div className="flex items-center gap-1.5">
          {headerAction}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={copy}
            className="h-auto px-2 py-0.5 text-[11px] font-normal text-muted-foreground"
          >
            {copied ? t("i18n.copied") : t("i18n.copy")}
          </Button>
        </div>
      </div>
      {isStreaming ? (
        <pre
          className="m-0 overflow-x-auto bg-[color-mix(in_srgb,var(--background)_92%,var(--muted))] px-[13px] py-[11px] font-mono text-[calc(12.5px+var(--chat-font-size-offset,0px))] leading-[1.62]"
        >
          <code className="font-mono">{code}</code>
        </pre>
      ) : (
        <SyntaxHighlighter
          language={lang || "text"}
          style={getPrismStyle(theme)}
          showLineNumbers
          lineNumberStyle={{ color: "var(--muted-foreground)", fontStyle: "normal" }}
          customStyle={{
            margin: 0,
            padding: "11px 13px",
            // The Prism theme carries its own `fontFamily: Consolas…`, which would put the wrapper and
            // the line-number gutter on a stack the user cannot change; the code tag alone is not enough.
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
      )}
    </div>
  );
});
