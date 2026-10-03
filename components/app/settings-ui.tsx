"use client";

import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfigButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ConfigButtonSize = "small" | "default";

interface ConfigPanelShellProps {
  embedded: boolean;
  title: string;
  subtitle?: string;
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  height?: string;
}

export function ConfigPanelShell({
  embedded,
  title,
  subtitle,
  closeLabel = "Close",
  onClose,
  children,
  width = 900,
  height = "78vh",
}: ConfigPanelShellProps) {
  if (embedded) {
    return (
      <div className="flex h-full w-full min-w-0 min-h-0">
        {children}
      </div>
    );
  }

  const panelStyle = {
    "--config-panel-width": `${width}px`,
    "--config-panel-height": height,
  } as CSSProperties;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        style={panelStyle}
        className={cn(
          "flex w-[min(var(--config-panel-width),calc(100vw-16px))] max-w-none flex-col overflow-hidden p-0",
          "h-[min(var(--config-panel-height),calc(100dvh-16px))] max-h-none sm:max-w-none",
        )}
      >
        <div className="flex h-[50px] flex-shrink-0 items-center gap-2.5 border-b border-border px-3.5 pl-4.5">
          <DialogTitle className="text-[15px] font-normal">{title}</DialogTitle>
          {subtitle && (
            <code
              className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
              title={subtitle}
            >
              {subtitle}
            </code>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-auto text-lg leading-none"
            onClick={onClose}
            title={closeLabel}
            aria-label={closeLabel}
          >
            ×
          </Button>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function ConfigSplitView({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden max-[640px]:flex-col">
      {children}
    </div>
  );
}

export function ConfigSidebar({ children }: { children: ReactNode }) {
  return (
    <aside
      data-slot="config-sidebar"
      className="flex min-h-0 w-60 flex-shrink-0 flex-col border-r border-border bg-sidebar max-[640px]:h-[190px] max-[640px]:w-full max-[640px]:border-r-0 max-[640px]:border-b"
    >
      {children}
    </aside>
  );
}

export function ConfigSidebarList({ children }: { children: ReactNode }) {
  return <div className="flex-1 min-h-0 overflow-y-auto p-1.5">{children}</div>;
}

export function ConfigSidebarGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pt-1 pb-[3px] font-inherit text-[10px] font-semibold leading-[1.4] uppercase text-muted-foreground">
      {children}
    </div>
  );
}

export function ConfigSidebarItem({
  active = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      aria-current={active ? "page" : undefined}
      data-slot="config-sidebar-item"
      className={cn(
        "flex h-[30px] w-full min-w-0 items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left font-inherit text-xs font-normal text-foreground outline-none transition-colors",
        "not-disabled:hover:bg-muted not-disabled:focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2",
        "aria-[current=page]:bg-accent aria-[current=page]:font-semibold",
        "disabled:cursor-default disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ConfigSidebarText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      data-slot="config-sidebar-text"
      className={cn(
        "block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-inherit text-xs leading-[1.35]",
        className,
      )}
    />
  );
}

export function ConfigDetailStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-slot="config-detail-stack"
      className={cn("flex w-full min-w-0 flex-col gap-4", className)}
    />
  );
}

export function ConfigDetailHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-slot="config-detail-header"
      className={cn(
        "flex min-h-7 min-w-0 flex-wrap items-center gap-3",
        className,
      )}
    />
  );
}

export function ConfigDetailHeaderInfo({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-slot="config-detail-header-info"
      className={cn("flex min-w-0 flex-1 basis-40 items-center gap-1.5", className)}
    />
  );
}

export function ConfigDetailActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-slot="config-detail-actions"
      className={cn(
        "ml-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2",
        className,
      )}
    />
  );
}

export function ConfigDetailTitle({ children }: { children: ReactNode }) {
  return (
    <div data-slot="config-detail-title" className="text-sm font-semibold leading-[1.35] text-foreground">
      {children}
    </div>
  );
}

export function ConfigSectionTitle({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="config-section-title"
      className="text-[11px] font-semibold leading-[1.35] uppercase text-muted-foreground"
    >
      {children}
    </div>
  );
}

export function ConfigField({ label, children, style }: { label: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div data-slot="config-field" className="flex min-w-0 flex-col gap-[5px]" style={style}>
      <Label className="text-[11px] font-medium leading-[1.35] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function ConfigEmptyState({ children }: { children: ReactNode }) {
  return (
    <Empty
      data-slot="config-empty-state"
      className="min-h-40 flex-1 rounded-none border-none p-0 text-xs leading-normal text-muted-foreground"
    >
      {children}
    </Empty>
  );
}

export function ConfigDetail({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      data-slot="config-detail"
      className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5 font-inherit text-xs leading-normal max-[640px]:p-3.5"
      style={style}
    >
      {children}
    </div>
  );
}

export function ConfigFooter({ status, children }: { status?: ReactNode; children?: ReactNode }) {
  return (
    <footer
      data-slot="config-footer"
      className="flex min-h-[52px] flex-shrink-0 items-center gap-2 border-t border-border px-3.5 py-2.5"
    >
      <div className="min-w-0 flex-1 overflow-hidden text-[11px] text-muted-foreground">{status}</div>
      <div className="flex flex-shrink-0 items-center justify-end gap-2 *:data-[slot=button]:min-w-24">
        {children}
      </div>
    </footer>
  );
}

const buttonVariantMap: Record<ConfigButtonVariant, "default" | "outline" | "destructive" | "ghost"> = {
  primary: "default",
  secondary: "outline",
  danger: "destructive",
  ghost: "ghost",
};

const buttonSizeMap: Record<ConfigButtonSize, "default" | "sm"> = {
  small: "sm",
  default: "default",
};

export function ConfigButton({
  variant = "secondary",
  size = "default",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ConfigButtonVariant; size?: ConfigButtonSize }) {
  return (
    <Button
      type="button"
      {...props}
      variant={buttonVariantMap[variant]}
      size={buttonSizeMap[size]}
      className={className}
    >
      {children}
    </Button>
  );
}

export function ConfigSwitch({ checked, disabled = false, loading = false, label, onChange }: { checked: boolean; disabled?: boolean; loading?: boolean; label: string; onChange: (checked: boolean) => void }) {
  const inactive = disabled || loading;
  return (
    <span className="inline-flex items-center gap-2">
      <Switch
        checked={checked}
        aria-busy={loading || undefined}
        aria-label={label}
        title={label}
        disabled={inactive}
        onCheckedChange={(next) => onChange(next)}
      />
      {loading && <Spinner className="size-3.5" />}
    </span>
  );
}

export function ConfigListAction({ active = false, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <div data-slot="config-list-action" className="flex-shrink-0 border-t border-border p-1.5">
      <Button
        type="button"
        variant="ghost"
        {...props}
        aria-current={active ? "page" : undefined}
        data-slot="config-list-action-button"
        className={cn(
          "h-[30px] min-h-[30px] w-full justify-start gap-1.5 rounded-md px-2 text-xs text-muted-foreground",
          "aria-[current=page]:bg-accent aria-[current=page]:text-primary",
          className,
        )}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {children}
      </Button>
    </div>
  );
}

export function ConfigStatusDot({ active, color }: { active?: boolean; color?: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="config-status-dot"
      className={cn(
        "inline-block size-[7px] flex-shrink-0 rounded-full bg-muted-foreground",
        active && "bg-primary",
        active === false && "opacity-70",
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}
