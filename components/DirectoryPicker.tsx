"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DirectoryEntry {
  name: string;
  path: string;
}

interface BrowseResponse {
  path?: string;
  parentPath?: string | null;
  directories?: DirectoryEntry[];
  drives?: DirectoryEntry[];
  error?: string;
}

async function loadDirectories(directory?: string): Promise<BrowseResponse> {
  const query = directory ? `?path=${encodeURIComponent(directory)}` : "";
  const response = await fetch(`/api/cwd/browse${query}`);
  const data = await response.json() as BrowseResponse;
  if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M1.5 3h4l1.5 2h7.5v7.5h-13z" />
    </svg>
  );
}

function DriveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 9h12" />
      <circle cx="11.5" cy="11" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function isWindowsDriveRoot(directory: string): boolean {
  return /^[a-zA-Z]:[\\/]?$/.test(directory);
}

interface Props {
  onCancel: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
  busy?: boolean;
  error?: string | null;
}

interface BodyProps {
  currentPath: string;
  parentDirectory: string | null;
  pathInput: string;
  directories: DirectoryEntry[];
  drives: DirectoryEntry[] | null;
  loadError: string | null;
  loading: boolean;
  busy: boolean;
  error?: string | null;
  onPathInputChange: (value: string) => void;
  onPathSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNavigateUp: () => void;
  onNavigate: (path: string) => void;
  onCancel: () => void;
  onSelect: () => void;
}

/** Pure, portal-free body — this is what unit tests render, since Dialog content is SSR-invisible. */
export function DirectoryPickerBody({
  currentPath,
  parentDirectory,
  pathInput,
  directories,
  drives,
  loadError,
  loading,
  busy,
  error,
  onPathInputChange,
  onPathSubmit,
  onNavigateUp,
  onNavigate,
  onCancel,
  onSelect,
}: BodyProps) {
  const { t } = useI18n();
  const hasUncommittedPath = pathInput.trim() !== currentPath;
  const canSelect = Boolean(currentPath) && !hasUncommittedPath && !busy;
  const canNavigateUp = Boolean(parentDirectory) || isWindowsDriveRoot(currentPath);

  return (
    <div className="flex h-[min(620px,calc(100dvh-16px))] max-h-[calc(100dvh-16px)] flex-col overflow-hidden">
      <form onSubmit={onPathSubmit} className="flex shrink-0 items-center gap-2 border-b py-2.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onNavigateUp}
          disabled={loading || !canNavigateUp}
          title={t("directoryPicker.goToParent")}
          aria-label={t("directoryPicker.goToParent")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m18 15-6-6-6 6" />
          </svg>
        </Button>
        <label htmlFor="directory-path" className="sr-only">
          {t("directoryPicker.directoryPath")}
        </label>
        <Input
          id="directory-path"
          type="text"
          value={pathInput}
          placeholder="/path/to/project or ~/project"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onPathInputChange(event.target.value)}
          className="min-w-0 flex-1 font-mono text-xs"
        />
        <Button type="submit" variant="outline" disabled={loading || !pathInput.trim()}>
          {t("directoryPicker.go")}
        </Button>
      </form>

      <div data-slot="directory-picker-list" className="min-h-0 flex-1 overflow-auto px-2.5 py-2">
        {loading ? (
          <div className="p-2 text-xs text-muted-foreground">{t("directoryPicker.loadingDirectories")}</div>
        ) : drives !== null ? (
          drives.length > 0 ? (
            drives.map((drive) => (
              <button
                key={drive.path}
                type="button"
                onClick={() => onNavigate(drive.path)}
                title={drive.path}
                className="flex min-h-8.5 w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left font-mono text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <DriveIcon />
                <span>{drive.name}</span>
              </button>
            ))
          ) : (
            <div className="p-2 text-xs text-muted-foreground">{t("directoryPicker.noDrives")}</div>
          )
        ) : directories.length > 0 ? (
          directories.map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={() => onNavigate(entry.path)}
              title={entry.path}
              className="flex min-h-7.5 w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left font-mono text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <FolderIcon />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{entry.name}</span>
            </button>
          ))
        ) : (
          <div className="p-2 text-xs text-muted-foreground">{t("directoryPicker.noSubdirectories")}</div>
        )}
        {(loadError || error) && <div className="p-2 text-xs text-destructive">{loadError ?? error}</div>}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2.5 border-t py-2.5 pb-[max(10px,env(safe-area-inset-bottom))]">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          {t("i18n.cancel")}
        </Button>
        <Button
          type="button"
          onClick={onSelect}
          disabled={!canSelect}
          title={hasUncommittedPath ? t("directoryPicker.openBeforeSelecting") : t("directoryPicker.selectCurrentDirectory")}
        >
          {busy ? t("i18n.checking") : t("directoryPicker.selectThisFolder")}
        </Button>
      </div>
    </div>
  );
}

export function DirectoryPicker({ onCancel, onSelect, initialPath, busy = false, error }: Props) {
  const { t } = useI18n();
  const [currentPath, setCurrentPath] = useState("");
  const [parentDirectory, setParentDirectory] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState(initialPath ?? "");
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [drives, setDrives] = useState<DirectoryEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const navigateTo = useCallback(async (directory?: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await loadDirectories(directory);
      const nextPath = data.path ?? directory ?? "/";
      setCurrentPath(nextPath);
      setParentDirectory(data.parentPath ?? null);
      setPathInput(nextPath);
      setDirectories(data.directories ?? []);
      setDrives(data.drives ?? null);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void navigateTo(initialPath || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePathSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = pathInput.trim();
    if (candidate) void navigateTo(candidate);
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <DialogContent
        className="flex max-h-[calc(100dvh-16px)] w-[520px] max-w-[calc(100vw-16px)] flex-col gap-0 p-0"
        aria-label={t("directoryPicker.selectDirectory")}
      >
        <DialogHeader className="shrink-0 border-b px-4.5 py-3">
          <DialogTitle>{t("directoryPicker.selectDirectory")}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 px-4">
          <DirectoryPickerBody
            currentPath={currentPath}
            parentDirectory={parentDirectory}
            pathInput={pathInput}
            directories={directories}
            drives={drives}
            loadError={loadError}
            loading={loading}
            busy={busy}
            error={error}
            onPathInputChange={(value) => {
              setPathInput(value);
              setLoadError(null);
            }}
            onPathSubmit={handlePathSubmit}
            onNavigateUp={() => void navigateTo(parentDirectory ?? undefined)}
            onNavigate={(path) => void navigateTo(path)}
            onCancel={onCancel}
            onSelect={() => onSelect(currentPath)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
