import { cn } from "@/lib/utils";
import type { MinimapNode, OutlineItem } from "../view-types";

/** Real layout constants of `ChatMinimap`: the first node sits 12px from the top and nodes are at most 50px apart. */
const PADDING = 12;
const GAP = 50;
/** The real minimap positions nodes in percent of its measured (rounded) height; this is the height it has in the app frame. */
const DEFAULT_HEIGHT = 686;

const border = "border-[color-mix(in_srgb,var(--border)_68%,transparent)]";
/**
 * The real outline row's class list, kept verbatim (minus hover/focus) so the stylesheet order is the real
 * one: a base of 26px min height and 4px padding, then `data-[level=…]` variants for headings. A row without
 * a level (the first line of text) carries the plain text colour and size directly.
 */
const ROW =
  "block w-[calc(100%+34px)] min-h-[26px] min-w-0 -ml-[34px] py-1 px-2.5 pl-10 border-0 bg-transparent font-[inherit] tracking-normal leading-[18px] overflow-hidden text-left text-ellipsis whitespace-nowrap " +
  "data-[level='1']:min-h-8 data-[level='1']:py-[7px] data-[level='1']:text-foreground data-[level='1']:text-sm data-[level='1']:font-semibold " +
  "data-[level='2']:min-h-7 data-[level='2']:py-[5px] data-[level='2']:pl-[50px] data-[level='2']:text-[color-mix(in_srgb,var(--foreground)_88%,var(--muted-foreground))] data-[level='2']:text-xs data-[level='2']:font-medium " +
  "data-[level='3']:pl-[60px] data-[level='3']:text-muted-foreground data-[level='3']:text-[11px] data-[level='3']:font-normal";
const PLAIN = "text-muted-foreground text-sm font-normal";
const JUMP_SIZE: Record<number, string> = { 0: "h-[26px] leading-[26px]", 1: "h-8 leading-8", 2: "h-7 leading-7", 3: "h-[26px] leading-[26px]" };

function OutlineRows({ items }: { items: OutlineItem[] }) {
  const first = items[0]?.level ?? 0;
  return (
    <div className="relative block border-t border-[color-mix(in_srgb,var(--border)_52%,transparent)] p-0">
      <span className={cn("absolute top-0 -left-[29px] z-[2] w-6 border-0 bg-transparent p-0 text-center font-mono text-[10px] font-semibold tracking-normal text-muted-foreground", JUMP_SIZE[first])}>A</span>
      <div className="grid min-w-0 gap-0">
        {items.map((item) => (
          <div
            key={item.label}
            data-level={item.level}
            className={cn(ROW, !item.level && PLAIN)}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The right-edge timeline (the real `ChatMinimap`): a 36px column on the muted fill with a hairline track
 * and one square per user turn or compaction, the turn nearest the top of the viewport drawn heavier.
 * Squares and positions are data, so this view carries inline styles, with the real mid-gray literals
 * (`rgba(128,128,128,…)`), which read on both themes. `open` draws the hover preview the real minimap
 * shows under the pointer: a full-height panel listing every turn with its assistant outline, the turn under
 * the pointer (`locatedIndex`) tinted.
 */
export function TimelineMinimap({ nodes, open = false, locatedIndex, height = DEFAULT_HEIGHT }: { nodes: MinimapNode[]; open?: boolean; locatedIndex?: number; height?: number }) {
  const topOf = (i: number) => `${((PADDING + i * GAP) / height) * 100}%`;
  return (
    <div data-slot="timeline-minimap" aria-label="Conversation timeline" role="navigation" className="relative w-9 flex-shrink-0 overflow-visible border-l border-border bg-muted select-none">
      {/* ui-guard-allow: track length follows the node count */}
      <div data-slot="timeline-track" className="absolute left-1/2 z-0 w-px -translate-x-1/2 bg-border" style={{ top: PADDING, height: Math.max(0, nodes.length - 1) * GAP }} />
      {nodes.map((node, i) => (
        <div
          key={i}
          data-slot="timeline-node"
          data-active={node.active || undefined}
          className="pointer-events-none absolute inset-x-0 z-[2] flex -translate-y-1/2 items-center justify-center"
          // ui-guard-allow: node position is data
          style={{ top: topOf(i), height: GAP }}
        >
          <div
            className="h-2 w-2 rounded-sm"
            // ui-guard-allow: the real node draws mid-gray literals that read on both themes
            style={{
              background: node.active ? "rgba(128, 128, 128, 0.42)" : "rgba(128, 128, 128, 0.16)",
              border: `1.5px solid ${node.active ? "rgba(128, 128, 128, 0.95)" : "rgba(128, 128, 128, 0.58)"}`,
              boxShadow: node.active ? "0 0 0 2px var(--muted)" : "none",
            }}
          />
        </div>
      ))}
      {open ? (
        <div
          data-slot="timeline-preview"
          className="absolute top-0 right-full bottom-0 z-[100] w-80 overflow-x-hidden overflow-y-hidden border-l border-[color-mix(in_srgb,var(--border)_82%,transparent)] bg-background shadow-[-10px_0_26px_color-mix(in_srgb,black_7%,transparent)]"
        >
          {nodes.map((node, i) => (
            <div
              key={i}
              data-located={i === locatedIndex || undefined}
              className={cn(
                "relative grid grid-cols-[34px_minmax(0,1fr)] border-b bg-transparent p-0",
                border,
                i === locatedIndex && "bg-[color-mix(in_srgb,var(--foreground)_4%,var(--background))] shadow-[inset_2px_0_0_color-mix(in_srgb,var(--muted-foreground)_70%,transparent)]",
              )}
            >
              <span data-slot="minimap-number" className="relative z-[1] col-start-1 flex h-8 w-[34px] items-center justify-center p-0 text-center font-mono text-[10px] leading-[18px] text-muted-foreground [font-variant-numeric:tabular-nums]">{String(i + 1).padStart(2, "0")}</span>
              <div className="col-start-2 min-w-0">
                <div className="block max-h-[86px] min-h-8 w-[calc(100%+34px)] -ml-[34px] overflow-hidden border-0 bg-transparent px-2.5 py-[7px] pl-10 text-left text-sm leading-[18px] font-medium tracking-normal text-foreground">
                  <span className="[display:-webkit-box] overflow-hidden [overflow-wrap:anywhere] whitespace-pre-wrap [-webkit-box-orient:vertical] [-webkit-line-clamp:4] [line-clamp:4]">{node.text}</span>
                </div>
                {node.outline.length ? <OutlineRows items={node.outline} /> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
