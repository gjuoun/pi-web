import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The hand-drawn glyphs the real sidebar and explorer use, ported with their exact size, viewBox,
 * stroke width and path data (they are not lucide icons, and the difference shows up in a pixel
 * comparison). Each is a stateless inline SVG drawn in `currentColor`.
 */
function Svg({ size, viewBox = "0 0 24 24", strokeWidth = 2, className, children }: { size: number; viewBox?: string; strokeWidth?: number; className?: string; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

/** The plus on the "New" button (12px) and the group headers (10px); drawn on a 12-unit grid. */
export function PlusGlyph({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className={className}>
      <line x1="6" y1="1" x2="6" y2="11" />
      <line x1="1" y1="6" x2="11" y2="6" />
    </svg>
  );
}

export const SearchGlyph = ({ size = 18, className }: { size?: number; className?: string }) => (
  <Svg size={size} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Svg>
);

export const ArchiveGlyph = ({ size = 14, className }: { size?: number; className?: string }) => (
  <Svg size={size} className={className}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><line x1="10" y1="12" x2="14" y2="12" /></Svg>
);

/** The group chevron: down when open, rotated -90deg when collapsed (pass `collapsed`). */
export function GroupChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn("shrink-0 text-muted-foreground/70", collapsed && "-rotate-90")}>
      <polyline points="2 3.5 5 6.5 8 3.5" />
    </svg>
  );
}

export const WorktreeGlyph = ({ size = 10, className }: { size?: number; className?: string }) => (
  <Svg size={size} strokeWidth={2.4} className={className}><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></Svg>
);

export const PinGlyph = ({ size = 11, className }: { size?: number; className?: string }) => (
  <Svg size={size} className={className}>
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M5 17h14l-1.5-7.5a3 3 0 0 0-1.2-1.9L15 6V4a1 1 0 0 0-1-1H10a1 1 0 0 0-1 1v2l-1.3 1.6a3 3 0 0 0-1.2 1.9L5 17z" />
  </Svg>
);

export const AgentGlyph = ({ className }: { className?: string }) => (
  <Svg size={11} className={className}><rect x="5" y="7" width="14" height="11" rx="2" /><path d="M9 11h.01M15 11h.01M9 15h6M12 7V4M10 4h4" /></Svg>
);

export const RunningArc = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="block">
    <path d="M21 12a9 9 0 1 1-3.8-7.4" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

/** The explorer header's expand chevron (9px, pointing right; rotated 90deg when open). */
export function ExplorerChevron({ open }: { open: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn("shrink-0", open && "rotate-90")}>
      <polyline points="3 2 7 5 3 8" />
    </svg>
  );
}

/** The file-tree row chevron (10px, `--muted-foreground`). */
export function TreeChevron({ open = false }: { open?: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn("shrink-0", open && "rotate-90")}>
      <polyline points="3 2 7 5 3 8" />
    </svg>
  );
}

export const TerminalGlyph = ({ size = 13 }: { size?: number }) => <Svg size={size}><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></Svg>;
export const ChangesGlyph = ({ size = 13 }: { size?: number }) => <Svg size={size}><circle cx="12" cy="12" r="3" /><path d="M3 12h6" /><path d="M15 12h6" /></Svg>;
export const UploadGlyph = ({ size = 13 }: { size?: number }) => <Svg size={size}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></Svg>;
export const RefreshGlyph = ({ size = 13 }: { size?: number }) => <Svg size={size}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></Svg>;

/** The "General" settings glyph, used on the sidebar's Settings footer and the dialog tab. */
export const SettingsGlyph = ({ size = 14, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) => (
  <Svg size={size} strokeWidth={strokeWidth}><path d="M20 7h-9M14 17H5" /><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /></Svg>
);

/** Top-bar glyphs, ported from `AppShell` (24-unit grids unless noted). */
export const SidebarToggleGlyph = ({ side = "left" }: { side?: "left" | "right" }) => (
  <Svg size={16}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1={side === "left" ? 9 : 15} y1="3" x2={side === "left" ? 9 : 15} y2="21" /></Svg>
);
export const HistoryGlyph = () => <Svg size={12} className="shrink-0"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></Svg>;
export const TitleGlyph = () => <Svg size={13}><path d="m15 4 5 5L7 22l-5-5Z" /><path d="m14 5 5 5" /><path d="M6 4V2M5 3H3M19 19v3M17.5 20.5h3" /></Svg>;
export const SystemGlyph = ({ className }: { className?: string }) => (
  <Svg size={12} className={cn("shrink-0", className)}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></Svg>
);
export const ToolsGlyph = ({ className }: { className?: string }) => (
  <Svg size={12} className={cn("shrink-0", className)}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" /></Svg>
);

/** The session-stats glyphs, drawn on a 10-unit grid at 12px with a 1.2 stroke. */
function StatSvg({ children }: { children: ReactNode }) {
  return <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}
export const StatUp = () => <StatSvg><line x1="5" y1="8.5" x2="5" y2="1.5" /><polyline points="2 4 5 1.5 8 4" /></StatSvg>;
export const StatDown = () => <StatSvg><line x1="5" y1="1.5" x2="5" y2="8.5" /><polyline points="2 6 5 8.5 8 6" /></StatSvg>;
export const StatCache = () => <StatSvg><path d="M8.5 5a3.5 3.5 0 1 1-1-2.45" /><polyline points="6.5 1.5 8.5 2.5 7.5 4.5" /></StatSvg>;
export const StatContext = () => <StatSvg><path d="M1 9 L1 5 Q1 1 5 1 Q9 1 9 5 L9 9" /><line x1="1" y1="9" x2="9" y2="9" /></StatSvg>;

/** The settings tab glyphs, ported from `SettingsSectionIcon` (16px, 1.8 stroke, class `settings-section-icon`). */
export function SectionGlyph({ section, size = 16, strokeWidth = 1.8 }: { section: "general" | "models" | "skills" | "plugins"; size?: number; strokeWidth?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: "settings-section-icon" };
  if (section === "general") return <svg {...common}><path d="M20 7h-9M14 17H5" /><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /></svg>;
  if (section === "models") return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" /></svg>;
  if (section === "skills") return <svg {...common}><path d="m12 2-10 5 10 5 10-5-10-5Z" /><path d="m2 12 10 5 10-5M2 17l10 5 10-5" /></svg>;
  return <svg {...common}><path d="M9 7V2M15 7V2M6 13V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5a6 6 0 0 1-12 0ZM12 19v3" /></svg>;
}

export const ResetGlyph = ({ size = 14 }: { size?: number }) => <Svg size={size} strokeWidth={1.8}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" /></Svg>;
export const ChevronDownGlyph = ({ size = 12 }: { size?: number }) => <Svg size={size}><path d="m6 9 6 6 6-6" /></Svg>;
