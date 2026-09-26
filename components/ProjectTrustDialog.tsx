"use client";

import { useI18n } from "@/hooks/useI18n";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface BodyProps {
  cwd: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Pure body — plain elements only, no Radix subcomponents. `AlertDialogTitle`/`AlertDialogAction`
 * require a mounted `AlertDialog` Root context (they throw outside one) and their portal content
 * is invisible under SSR regardless, so this is what unit tests render directly.
 */
export function ProjectTrustDialogBody({ cwd, busy, error, onCancel, onConfirm }: BodyProps) {
  const { t } = useI18n();

  return (
    <>
      <div className="flex gap-3">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="mt-px shrink-0 stroke-warning"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <div className="min-w-0">
          <div id="project-trust-title" className="text-[15px] font-bold text-foreground">
            {t("trust.dialogTitle")}
          </div>
          <div id="project-trust-description" className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {t("trust.dialogBody")}
          </div>
          <code className="mt-2.5 block overflow-hidden rounded-md border px-2.5 py-2 font-mono text-[11px] break-words text-foreground">
            {cwd}
          </code>
          {error && (
            <div role="alert" className="mt-2.5 text-xs leading-relaxed text-destructive">
              {error}
            </div>
          )}
        </div>
      </div>
      <div className="-mx-4 -mb-4 flex justify-end gap-2 rounded-b-xl border-t bg-muted/50 p-4">
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          {t("trust.cancel")}
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? t("trust.trusting") : t("trust.trustProject")}
        </Button>
      </div>
    </>
  );
}

export function ProjectTrustDialog({
  cwd,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  cwd: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <AlertDialogContent
        aria-labelledby="project-trust-title"
        aria-describedby="project-trust-description"
      >
        <ProjectTrustDialogBody cwd={cwd} busy={busy} error={error} onCancel={onCancel} onConfirm={onConfirm} />
      </AlertDialogContent>
    </AlertDialog>
  );
}
