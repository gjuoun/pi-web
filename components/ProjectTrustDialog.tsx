"use client";

import { useI18n } from "@/hooks/useI18n";

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
  const { t } = useI18n();

  return (
    <div
      role="presentation"
      className="project-trust-overlay"
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-trust-title"
        className="project-trust-dialog"
      >
        <div className="project-trust-body">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="project-trust-icon"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <div className="project-trust-copy">
            <div id="project-trust-title" className="project-trust-title">
              {t("trust.dialogTitle")}
            </div>
            <div className="project-trust-text">
              {t("trust.dialogBody")}
            </div>
            <code className="project-trust-path">
              {cwd}
            </code>
            {error && (
              <div role="alert" className="project-trust-error">
                {error}
              </div>
            )}
          </div>
        </div>
        <div className="project-trust-actions">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={"project-trust-button" + (busy ? " is-blocked" : "")}
          >
            {t("trust.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={"project-trust-button is-primary" + (busy ? " is-busy" : "")}
          >
            {busy ? t("trust.trusting") : t("trust.trustProject")}
          </button>
        </div>
      </div>
    </div>
  );
}
