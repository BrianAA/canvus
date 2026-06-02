// ─────────────────────────────────────────────────────────────
// canvus/src/renderer.ts
// Canvas Overlay Rendering Engine — Selection outlines, resize
// handle affordances, hover highlights, alignment guides, and
// interactive handle hit-testing.
//
// All drawing is DPR-aware and operates in screen-space after
// projecting canvas-space geometry through the viewport matrix.
// ─────────────────────────────────────────────────────────────

import type { Rect, ResizeAnchor, Vec2, ViewportMatrix, ResolvedNode } from "./types.js";
import type { GridTrack } from "./layout.js";
import type { DropTarget } from "./drop-zone.js";

// ── Style Configuration ─────────────────────────────────────

/** Visual styling tokens for the overlay renderer. */
export interface OverlayStyle {
  // ── Selection ───────────────────────────────────
  /** Stroke color for selected element outlines. */
  selectionStroke: string;
  /** Stroke width (screen pixels) for selection outlines. */
  selectionWidth: number;
  /** Shadow color for the selection glow effect. */
  selectionGlow: string;
  /** Blur radius (px) for the selection glow. */
  selectionGlowRadius: number;

  // ── Hover ───────────────────────────────────────
  /** Stroke color for hovered (non-selected) element outlines. */
  hoverStroke: string;
  /** Stroke width for hover outlines. */
  hoverWidth: number;
  /** Dash pattern for hover outlines (`[]` = solid). */
  hoverDash: number[];

  // ── Handles ─────────────────────────────────────
  /** Side length of each square resize handle (screen px). */
  handleSize: number;
  /** Fill color for resize handles. */
  handleFill: string;
  /** Stroke color for resize handles. */
  handleStroke: string;
  /** Stroke width for resize handles. */
  handleStrokeWidth: number;
  /** Corner radius of resize handles (`0` = square). */
  handleRadius: number;
  /**
   * Hit-test radius around each handle center (screen px).
   * Should be ≥ handleSize/2 for comfortable targeting (Fitts's law).
   */
  handleHitRadius: number;
  /** Fill color when a handle is actively being dragged. */
  handleActiveFill: string;

  // ── Guides ──────────────────────────────────────
  /** Stroke color for alignment guide lines. */
  guideStroke: string;
  /** Stroke width for guides. */
  guideWidth: number;
  /** Dash pattern for guides. */
  guideDash: number[];

  // ── Origin ──────────────────────────────────────
  /** Stroke color for the origin crosshair. */
  originStroke: string;
  /** Dash pattern for the origin crosshair. */
  originDash: number[];

  // ── Multi-Select ────────────────────────────────
  /** Stroke color for the aggregate bounding box. */
  multiSelectStroke: string;
  /** Dash pattern for the aggregate bounding box. */
  multiSelectDash: number[];

  // ── Layout Badges ──────────────────────────────
  /** Background color for layout mode badge pills. */
  layoutBadgeBg: string;
  /** Text color for layout badge labels. */
  layoutBadgeText: string;
  /** Font for layout badge labels. */
  layoutBadgeFont: string;

  // ── Grid Tracks ────────────────────────────────
  /** Stroke color for grid track overlay lines. */
  gridTrackStroke: string;
  /** Dash pattern for grid track lines. */
  gridTrackDash: number[];

  // ── Scoped Selection Affordances ────────────────
  /** Stroke color for parent highlight outline when child is selected. */
  parentHighlightStroke: string;
  /** Stroke color for available children outlines when container is selected. */
  childOutlineStroke: string;

  // ── Drag & Drop ─────────────────────────────────
  /** Stroke color for the active drop container border. */
  dropZoneStroke: string;
  /** Stroke width for drop zones. */
  dropZoneWidth: number;
  /** Stroke color for the insertion line. */
  insertionLineStroke: string;
  /** Stroke width for the insertion line. */
  insertionLineWidth: number;
}

/** Sensible defaults tuned for a dark workspace aesthetic. */
const DEFAULT_STYLE: OverlayStyle = {
  selectionStroke: "#6366f1",
  selectionWidth: 2,
  selectionGlow: "rgba(99, 102, 241, 0.4)",
  selectionGlowRadius: 12,

  hoverStroke: "rgba(99, 102, 241, 0.6)",
  hoverWidth: 1.5,
  hoverDash: [5, 5],

  handleSize: 8,
  handleFill: "#ffffff",
  handleStroke: "#6366f1",
  handleStrokeWidth: 1.5,
  handleRadius: 2,
  handleHitRadius: 8,
  handleActiveFill: "#6366f1",

  guideStroke: "#f43f5e",
  guideWidth: 1,
  guideDash: [4, 4],

  originStroke: "rgba(99, 102, 241, 0.12)",
  originDash: [6, 6],

  multiSelectStroke: "rgba(99, 102, 241, 0.5)",
  multiSelectDash: [6, 4],

  layoutBadgeBg: "rgba(99, 102, 241, 0.85)",
  layoutBadgeText: "#ffffff",
  layoutBadgeFont: "600 9px 'Inter', system-ui, sans-serif",

  gridTrackStroke: "rgba(99, 102, 241, 0.2)",
  gridTrackDash: [3, 3],

  parentHighlightStroke: "rgba(99, 102, 241, 0.35)",
  childOutlineStroke: "rgba(99, 102, 241, 0.18)",

  dropZoneStroke: "#3b82f6",
  dropZoneWidth: 2,
  insertionLineStroke: "#3b82f6",
  insertionLineWidth: 3,
};

// ── Frame Descriptor ────────────────────────────────────────

/** Alignment guide line in canvas-space. */
export interface Guide {
  /** Which axis the guide runs along. `"x"` = vertical line, `"y"` = horizontal line. */
  axis: "x" | "y";
  /** Canvas-space coordinate on the perpendicular axis. */
  position: number;
}

/**
 * Complete description of a single overlay frame.
 * Passed to `OverlayRenderer.render()` each time the
 * workspace state changes.
 */
export interface OverlayFrame {
  /** Current viewport transform. */
  viewport: ViewportMatrix;
  /** All mounted nodes with their canvas-space rects and hierarchy data. */
  nodes: ReadonlyArray<ResolvedNode>;
  /** Set of currently selected node IDs. */
  selectedIds: ReadonlySet<string>;
  /** ID of the node under the cursor (hover), or `null`. */
  hoveredId: string | null;
  /** The resize anchor currently being dragged, or `null`. */
  activeAnchor: ResizeAnchor | null;
  /** Alignment guides to render (typically computed by `computeAlignmentGuides`). */
  guides: ReadonlyArray<Guide>;
  /** ID of the node currently being dragged, or `null`. */
  draggedNodeId?: string | null;
  /** ID of the node currently being resized, or `null`. */
  resizedNodeId?: string | null;

  // ── Layout Overlays (M6) ────────────────────────
  /** Layout mode badges to render on selected containers. */
  layoutBadges?: ReadonlyArray<LayoutBadgeInfo>;
  /** Grid track overlays to render on selected grid containers. */
  gridOverlays?: ReadonlyArray<GridOverlayInfo>;

  // ── Drag & Drop Overlays (M8) ───────────────────
  /** Active drop zone target container and index. */
  activeDropTarget?: DropTarget | null;

  // ── UX Controls (Marquee & Spacing Adjusters) ──
  /** Active marquee selection rect in canvas-space. */
  marqueeRect?: Rect | null;
  /** Active spacing adjusters to render on screen. */
  spacingAdjusters?: ReadonlyArray<SpacingAdjusterInfo>;
  /** Active drawing element bounds in canvas-space. */
  drawingRect?: Rect | null;
  /** Active drawing element HTML tag name. */
  drawingTag?: string | null;
  /** Active or hovered corner radius handle name (tl, tr, bl, br). */
  activeRadiusCorner?: string | null;
}

export type SpacingAdjusterType =
  | "padding-top"
  | "padding-right"
  | "padding-bottom"
  | "padding-left"
  | "margin-top"
  | "margin-right"
  | "margin-bottom"
  | "margin-left";

export interface SpacingAdjusterInfo {
  type: SpacingAdjusterType;
  /** Bounding box of the handle bar in canvas-space. */
  rect: Rect;
  /** Visual bounding box representing the actual spacing dimensions exactly. */
  visualRect: Rect;
  /** Spacing value in pixels. */
  value: number;
  /** Hover state. */
  isHovered: boolean;
  /** Active dragging state. */
  isActive: boolean;
}

/** Data for rendering a layout mode badge on a container. */
export interface LayoutBadgeInfo {
  /** Canvas-space rect of the container. */
  rect: Rect;
  /** Short label like "FLEX →", "GRID", "BLOCK". */
  label: string;
  /** True if this is a script/JS badge. */
  isJS?: boolean;
}

/** Data for rendering grid track lines on a container. */
export interface GridOverlayInfo {
  /** Canvas-space rect of the container. */
  rect: Rect;
  /** Column tracks (offsets relative to container padding edge). */
  columns: ReadonlyArray<GridTrack>;
  /** Row tracks. */
  rows: ReadonlyArray<GridTrack>;
}

// ── Anchor Ordering ─────────────────────────────────────────

/**
 * Canonical order of the 8 resize anchors, clockwise from NW.
 * Used for iteration in drawing and hit-testing routines.
 */
const ANCHOR_ORDER: readonly ResizeAnchor[] = [
  "nw", "n", "ne", "e", "se", "s", "sw", "w",
] as const;

// ── Cursor Mapping ──────────────────────────────────────────

/** Maps each resize anchor to its CSS cursor value. */
const ANCHOR_CURSORS: Record<ResizeAnchor, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

/**
 * Returns the appropriate CSS cursor string for a given
 * resize anchor direction.
 *
 * @param anchor - The anchor being hovered, or `null`.
 * @returns CSS cursor value (e.g. `"nwse-resize"`), or
 *          `"default"` if no anchor is active.
 */
export function anchorCursor(anchor: ResizeAnchor | null): string {
  return anchor ? ANCHOR_CURSORS[anchor] : "default";
}

// ── Overlay Renderer ────────────────────────────────────────

/**
 * Hardware-accelerated canvas overlay renderer.
 *
 * Handles all visual affordances drawn on top of the Shadow DOM
 * projection layer: selection outlines with glow, 8-point resize
 * handles, hover highlights, alignment guides, and origin markers.
 *
 * ### Usage
 * ```ts
 * const renderer = new OverlayRenderer(canvas);
 * renderer.resize(width, height);
 * renderer.render(frame);
 * ```
 *
 * ### Performance Notes
 * - Single `render()` call per frame — no internal rAF loop.
 * - DPR-aware: physical pixels are scaled so lines stay crisp
 *   on retina displays.
 * - Canvas state changes are minimized by batching similar
 *   operations (hover pass → selection pass → handle pass).
 */
export function isContainerNode(node: ResolvedNode): boolean {
  if (
    node.childIds.length > 0 ||
    node.layoutMode === "flex" ||
    node.layoutMode === "grid" ||
    node.layoutMode === "inline-flex" ||
    node.layoutMode === "inline-grid"
  ) {
    return true;
  }
  if (node.rawMarkup) {
    const match = node.rawMarkup.trim().match(/^<([a-zA-Z0-9-]+)/);
    if (match && match[1]) {
      const tag = match[1].toLowerCase();
      const nonContainerTags = new Set([
        "p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "img", "br", "hr",
        "input", "button", "textarea", "select", "a", "strong", "em", "code", "pre"
      ]);
      return !nonContainerTags.has(tag);
    }
  }
  return false;
}

export class OverlayRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly style: OverlayStyle;
  private dpr = 1;
  private width = 0;
  private height = 0;

  /**
   * @param canvas - The `<canvas>` element to draw on.
   * @param style  - Optional partial style overrides.
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    style?: Partial<OverlayStyle>,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[OverlayRenderer] Failed to get 2D context.");
    this.ctx = ctx;
    this.style = { ...DEFAULT_STYLE, ...style };
  }

  // ── Lifecycle ───────────────────────────────────

  /**
   * Resizes the canvas buffer to match the given CSS dimensions,
   * scaling by the device pixel ratio for crisp rendering.
   *
   * Call this on window resize and initial setup.
   *
   * @param cssWidth  - Desired CSS width in pixels.
   * @param cssHeight - Desired CSS height in pixels.
   */
  resize(cssWidth: number, cssHeight: number): void {
    this.dpr = window.devicePixelRatio || 1;
    this.width = cssWidth;
    this.height = cssHeight;

    this.canvas.width = cssWidth * this.dpr;
    this.canvas.height = cssHeight * this.dpr;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    // Scale the context so all drawing commands use CSS pixels.
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // ── Main Render Pass ────────────────────────────

  /**
   * Draws a complete overlay frame.
   *
   * Rendering order (painter's algorithm, back to front):
   *   1. Clear
   *   2. Origin crosshair
   *   3. Alignment guides
   *   4. Hover outlines (non-selected, hovered node)
   *   5. Selection outlines + glow
   *   6. Multi-select bounding box (if > 1 selected)
   *   7. Resize handles (selected nodes only)
   */
  render(frame: OverlayFrame): void {
    const { ctx, style, width, height } = this;
    const { viewport, nodes, selectedIds, hoveredId, activeAnchor, guides } = frame;

    // 1. Clear
    ctx.clearRect(0, 0, width, height);

    // 2. Origin crosshair
    this.drawOrigin(viewport);

    // 3. Alignment guides
    for (const guide of guides) {
      this.drawGuide(guide, viewport);
    }

    // Pre-compute projected rects for all nodes with bounds.
    const projected = new Map<string, { sx: number; sy: number; sw: number; sh: number }>();
    for (const node of nodes) {
      if (!node.currentRect) continue;
      const r = node.currentRect;
      projected.set(node.id, {
        sx: r.x * viewport.scale + viewport.offsetX,
        sy: r.y * viewport.scale + viewport.offsetY,
        sw: r.width * viewport.scale,
        sh: r.height * viewport.scale,
      });
    }

    // 4. Hover outlines
    if (hoveredId && !selectedIds.has(hoveredId)) {
      const p = projected.get(hoveredId);
      if (p) {
        ctx.strokeStyle = style.hoverStroke;
        ctx.lineWidth = style.hoverWidth;
        ctx.setLineDash(style.hoverDash);
        ctx.strokeRect(p.sx, p.sy, p.sw, p.sh);
        ctx.setLineDash([]);
      }
    }

    // 4.5 Scoped Selection Affordances (M7)
    // (Static children outlines removed per request; outlines are now only shown on hover)

    // Draw parent highlight when a child is selected to maintain spatial context.
    ctx.strokeStyle = style.parentHighlightStroke;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    for (const id of selectedIds) {
      const node = nodes.find(n => n.id === id);
      if (node?.parentId) {
        const p = projected.get(node.parentId);
        if (p) {
          ctx.strokeRect(p.sx - 1, p.sy - 1, p.sw + 2, p.sh + 2);
        }
      }
    }
    ctx.setLineDash([]);

    // 5. Selection outlines + glow
    for (const id of selectedIds) {
      const p = projected.get(id);
      if (!p) continue;

      // Glow pass (drawn first, behind the solid stroke).
      ctx.save();
      ctx.shadowColor = style.selectionGlow;
      ctx.shadowBlur = style.selectionGlowRadius;
      ctx.strokeStyle = style.selectionStroke;
      ctx.lineWidth = style.selectionWidth;
      ctx.strokeRect(
        p.sx - 1,
        p.sy - 1,
        p.sw + 2,
        p.sh + 2,
      );
      ctx.restore();

      // Solid stroke on top.
      ctx.strokeStyle = style.selectionStroke;
      ctx.lineWidth = style.selectionWidth;
      ctx.strokeRect(
        p.sx - 1,
        p.sy - 1,
        p.sw + 2,
        p.sh + 2,
      );
    }

    // 6. Multi-select bounding box
    if (selectedIds.size > 1) {
      this.drawMultiSelectBounds(selectedIds, projected);
    }

    // 7. Resize handles
    for (const id of selectedIds) {
      const p = projected.get(id);
      if (!p) continue;
      this.drawHandles(p.sx, p.sy, p.sw, p.sh, activeAnchor);
    }

    // 7b. Corner radius handles
    for (const id of selectedIds) {
      const node = frame.nodes.find(n => n.id === id);
      if (node && isContainerNode(node)) {
        const isHovered = frame.hoveredId === id;
        const shouldDrawHandles = selectedIds.size === 1 || isHovered || frame.activeRadiusCorner;

        if (shouldDrawHandles) {
          const p = projected.get(id);
          if (p && p.sw >= 64 && p.sh >= 64) {
            const inset = 16;
            const handles = [
              { type: "tl", hx: p.sx + inset, hy: p.sy + inset },
              { type: "tr", hx: p.sx + p.sw - inset, hy: p.sy + inset },
              { type: "bl", hx: p.sx + inset, hy: p.sy + p.sh - inset },
              { type: "br", hx: p.sx + p.sw - inset, hy: p.sy + p.sh - inset },
            ];

            for (const handle of handles) {
              const isActive = handle.type === frame.activeRadiusCorner && (selectedIds.size === 1 || isHovered || frame.activeRadiusCorner);
              ctx.beginPath();
              ctx.arc(handle.hx, handle.hy, isActive ? 5 : 3.5, 0, Math.PI * 2);
              ctx.fillStyle = isActive ? style.selectionStroke : "#ffffff";
              ctx.fill();
              ctx.strokeStyle = style.selectionStroke;
              ctx.lineWidth = isActive ? 2 : 1.5;
              ctx.stroke();
            }
          }
        }
      }
    }

    // 8. Layout badges (M6)
    if (frame.layoutBadges) {
      const offsets = new Map<string, number>();
      for (const badge of frame.layoutBadges) {
        const key = `${badge.rect.x},${badge.rect.y}`;
        const currentOffset = offsets.get(key) || 0;
        const widthUsed = this.drawLayoutBadge(badge.rect, badge.label, viewport, currentOffset, badge.isJS);
        offsets.set(key, currentOffset + widthUsed + 4);
      }
    }

    // 9. Grid track overlays (M6)
    if (frame.gridOverlays) {
      for (const overlay of frame.gridOverlays) {
        this.drawGridOverlay(overlay.rect, overlay.columns, overlay.rows, viewport);
      }
    }

    // 10. Drop zone highlight (M8)
    const target = frame.activeDropTarget;
    if (target) {
      const parentNode = nodes.find(n => n.id === target.parentId);
      if (parentNode?.currentRect) {
        const p = projected.get(parentNode.id);
        if (p) {
          ctx.strokeStyle = style.dropZoneStroke;
          ctx.lineWidth = style.dropZoneWidth;
          ctx.strokeRect(p.sx - 1, p.sy - 1, p.sw + 2, p.sh + 2);
        }
      }

      // 11. Insertion preview (M8) - line or grid cell highlights
      if (target.gridPlacement) {
        const gp = target.gridPlacement;
        // Project to screen space
        const gsx = gp.rect.x * viewport.scale + viewport.offsetX;
        const gsy = gp.rect.y * viewport.scale + viewport.offsetY;
        const gsw = gp.rect.width * viewport.scale;
        const gsh = gp.rect.height * viewport.scale;

        // Draw translucent cell fill
        ctx.fillStyle = "rgba(99, 102, 241, 0.18)";
        ctx.fillRect(gsx, gsy, gsw, gsh);

        // Draw solid drop zone outline
        ctx.strokeStyle = style.dropZoneStroke;
        ctx.lineWidth = style.dropZoneWidth;
        ctx.strokeRect(gsx, gsy, gsw, gsh);

        // Draw Premium Grid Badge Tooltip at top-left of the shaded rect
        const label = `Grid: Row ${gp.rowStart}, Col ${gp.colStart} (Span ${gp.colSpan}x${gp.rowSpan})`;
        ctx.font = "600 9px 'JetBrains Mono', monospace";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        const tm = ctx.measureText(label);
        const tw = tm.width;
        const th = 14;
        const pad = 5;
        const bx = gsx + gsw / 2 - tw / 2 - pad;
        const by = gsy - th - 5; // Above the cell highlight

        ctx.fillStyle = "rgba(10, 10, 15, 0.95)";
        ctx.strokeStyle = style.dropZoneStroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + pad * 2, th, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, gsx + gsw / 2, by + th / 2);
      } else {
        const ind = target.indicator;
        ctx.strokeStyle = style.insertionLineStroke;
        ctx.lineWidth = style.insertionLineWidth;
        
        const x1 = ind.x1 * viewport.scale + viewport.offsetX;
        const y1 = ind.y1 * viewport.scale + viewport.offsetY;
        const x2 = ind.x2 * viewport.scale + viewport.offsetX;
        const y2 = ind.y2 * viewport.scale + viewport.offsetY;
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Premium terminal dots
        ctx.fillStyle = style.insertionLineStroke;
        ctx.beginPath();
        ctx.arc(x1, y1, 4, 0, Math.PI * 2);
        ctx.arc(x2, y2, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 12. Marquee selection (dashed blue outline + translucent fill)
    if (frame.marqueeRect) {
      const p = {
        sx: frame.marqueeRect.x * viewport.scale + viewport.offsetX,
        sy: frame.marqueeRect.y * viewport.scale + viewport.offsetY,
        sw: frame.marqueeRect.width * viewport.scale,
        sh: frame.marqueeRect.height * viewport.scale,
      };
      ctx.strokeStyle = style.selectionStroke;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(p.sx, p.sy, p.sw, p.sh);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(99, 102, 241, 0.08)";
      ctx.fillRect(p.sx, p.sy, p.sw, p.sh);
    }

    // 13. Spacing adjusters (padding & margin)
    if (frame.spacingAdjusters) {
      let activeAdjuster: SpacingAdjusterInfo | null = null;
      let activeProjectedRect: { sx: number; sy: number; sw: number; sh: number } | null = null;

      for (const adj of frame.spacingAdjusters) {
        const pVisual = {
          sx: adj.visualRect.x * viewport.scale + viewport.offsetX,
          sy: adj.visualRect.y * viewport.scale + viewport.offsetY,
          sw: adj.visualRect.width * viewport.scale,
          sh: adj.visualRect.height * viewport.scale,
        };

        if (adj.isActive) {
          activeAdjuster = adj;
          activeProjectedRect = {
            sx: adj.rect.x * viewport.scale + viewport.offsetX,
            sy: adj.rect.y * viewport.scale + viewport.offsetY,
            sw: adj.rect.width * viewport.scale,
            sh: adj.rect.height * viewport.scale,
          };
        }

        const isPadding = adj.type.startsWith("padding");
        const baseColor = isPadding ? "34, 197, 94" : "249, 115, 22"; // Green vs Orange
        
        if (adj.isHovered || adj.isActive) {
          ctx.fillStyle = `rgba(${baseColor}, 0.25)`;
          ctx.fillRect(pVisual.sx, pVisual.sy, pVisual.sw, pVisual.sh);
          ctx.strokeStyle = `rgba(${baseColor}, 0.85)`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(pVisual.sx, pVisual.sy, pVisual.sw, pVisual.sh);
        }
      }

      // Draw tooltip for the active adjuster on top
      if (activeAdjuster && activeProjectedRect) {
        const adj = activeAdjuster;
        const p = activeProjectedRect;
        const label = `${adj.type}: ${adj.value}px`;
        ctx.font = "600 10px 'JetBrains Mono', monospace";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        const tm = ctx.measureText(label);
        const tw = tm.width;
        const th = 16;
        const pad = 6;
        const bx = p.sx + p.sw / 2 - tw / 2 - pad;
        const by = p.sy + p.sh / 2 - th / 2;

        ctx.fillStyle = "rgba(10, 10, 15, 0.95)";
        ctx.strokeStyle = "rgba(99, 102, 241, 0.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + pad * 2, th, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, p.sx + p.sw / 2, p.sy + p.sh / 2);
      }
    }

    // 14. Drag & Resize tooltips
    if (frame.draggedNodeId || frame.resizedNodeId) {
      const targetId = frame.draggedNodeId || frame.resizedNodeId;
      const node = nodes.find(n => n.id === targetId);
      const p = targetId ? projected.get(targetId) : null;

      if (node && node.currentRect && p) {
        let label = "";
        if (frame.draggedNodeId) {
          label = `X: ${Math.round(node.currentRect.x)}  Y: ${Math.round(node.currentRect.y)}`;
        } else {
          label = `W: ${Math.round(node.currentRect.width)}  H: ${Math.round(node.currentRect.height)}`;
        }

        ctx.font = "600 10px 'JetBrains Mono', monospace";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        const tm = ctx.measureText(label);
        const tw = tm.width;
        const th = 16;
        const pad = 6;
        
        const gap = 8;
        const tooltipX = p.sx + p.sw / 2;
        let by = p.sy + p.sh + gap;
        // Flip to top if it overflows the canvas bottom
        if (by + th > height) {
          by = p.sy - gap - th;
        }
        const bx = tooltipX - tw / 2 - pad;

        ctx.fillStyle = "rgba(10, 10, 15, 0.95)";
        ctx.strokeStyle = style.selectionStroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + pad * 2, th, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, tooltipX, by + th / 2);
      }
    }

    // 15. Active node drawing preview
    if (frame.drawingRect) {
      const p = {
        sx: frame.drawingRect.x * viewport.scale + viewport.offsetX,
        sy: frame.drawingRect.y * viewport.scale + viewport.offsetY,
        sw: frame.drawingRect.width * viewport.scale,
        sh: frame.drawingRect.height * viewport.scale,
      };

      ctx.strokeStyle = "rgba(99, 102, 241, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(p.sx, p.sy, p.sw, p.sh);
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(99, 102, 241, 0.06)";
      ctx.fillRect(p.sx, p.sy, p.sw, p.sh);

      const tag = frame.drawingTag || "div";
      const label = `${tag}: ${Math.round(frame.drawingRect.width)} x ${Math.round(frame.drawingRect.height)}`;

      ctx.font = "600 10px 'JetBrains Mono', monospace";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      const tm = ctx.measureText(label);
      const tw = tm.width;
      const th = 16;
      const pad = 6;

      const gap = 8;
      const tooltipX = p.sx + p.sw / 2;
      let by = p.sy + p.sh + gap;
      if (by + th > height) {
        by = p.sy - gap - th;
      }
      const bx = tooltipX - tw / 2 - pad;

      ctx.fillStyle = "rgba(10, 10, 15, 0.95)";
      ctx.strokeStyle = "rgba(99, 102, 241, 0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + pad * 2, th, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, tooltipX, by + th / 2);
    }
  }

  // ── Handle Hit-Testing ──────────────────────────

  /**
   * Tests if a screen-space point is within the hit radius of
   * any of the 8 resize handles for a given element.
   *
   * The `canvasRect` parameter is not needed here because
   * `bounds` is in canvas-space and we project it using the
   * viewport ourselves.
   *
   * @param screenX   - Pointer X in screen-space (relative to
   *                    the canvas element, NOT clientX).
   * @param screenY   - Pointer Y relative to canvas element.
   * @param bounds    - The element's bounding rect in canvas-space.
   * @param viewport  - Current viewport transform.
   * @returns The anchor being hovered, or `null`.
   */
  hitTestHandle(
    screenX: number,
    screenY: number,
    bounds: Readonly<Rect>,
    viewport: Readonly<ViewportMatrix>,
  ): ResizeAnchor | null {
    const anchors = computeScreenAnchors(bounds, viewport);
    const r = this.style.handleHitRadius;

    for (const dir of ANCHOR_ORDER) {
      const a = anchors[dir];
      const dx = screenX - a.x;
      const dy = screenY - a.y;
      if (dx * dx + dy * dy <= r * r) {
        return dir;
      }
    }

    return null;
  }

  // ── Private Drawing Routines ────────────────────

  /** Draws the 8 resize handles around a projected rect. */
  private drawHandles(
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    activeAnchor: ResizeAnchor | null,
  ): void {
    const { ctx, style } = this;
    const size = style.handleSize;
    const half = size / 2;

    const midX = sx + sw / 2;
    const midY = sy + sh / 2;
    const right = sx + sw;
    const bottom = sy + sh;

    const positions: Record<ResizeAnchor, [number, number]> = {
      nw: [sx, sy],
      n: [midX, sy],
      ne: [right, sy],
      e: [right, midY],
      se: [right, bottom],
      s: [midX, bottom],
      sw: [sx, bottom],
      w: [sx, midY],
    };

    for (const dir of ANCHOR_ORDER) {
      const [hx, hy] = positions[dir];
      const isActive = dir === activeAnchor;

      ctx.fillStyle = isActive ? style.handleActiveFill : style.handleFill;
      ctx.strokeStyle = style.handleStroke;
      ctx.lineWidth = style.handleStrokeWidth;

      ctx.beginPath();
      ctx.roundRect(
        hx - half,
        hy - half,
        size,
        size,
        style.handleRadius,
      );
      ctx.fill();
      ctx.stroke();
    }
  }

  /** Draws the origin crosshair spanning the full viewport. */
  private drawOrigin(viewport: Readonly<ViewportMatrix>): void {
    const { ctx, style, width, height } = this;

    ctx.strokeStyle = style.originStroke;
    ctx.lineWidth = 1;
    ctx.setLineDash(style.originDash);

    // Vertical line at x=0.
    const ox = viewport.offsetX;
    ctx.beginPath();
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, height);
    ctx.stroke();

    // Horizontal line at y=0.
    const oy = viewport.offsetY;
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(width, oy);
    ctx.stroke();

    ctx.setLineDash([]);
  }

  /** Draws a single alignment guide line. */
  private drawGuide(guide: Guide, viewport: Readonly<ViewportMatrix>): void {
    const { ctx, style, width, height } = this;

    ctx.strokeStyle = style.guideStroke;
    ctx.lineWidth = style.guideWidth;
    ctx.setLineDash(style.guideDash);

    ctx.beginPath();

    if (guide.axis === "x") {
      // Vertical guide at canvas-space x → screen-space.
      const sx = guide.position * viewport.scale + viewport.offsetX;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    } else {
      // Horizontal guide at canvas-space y → screen-space.
      const sy = guide.position * viewport.scale + viewport.offsetY;
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }

    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Draws the aggregate bounding box around all selected nodes. */
  private drawMultiSelectBounds(
    selectedIds: ReadonlySet<string>,
    projected: Map<string, { sx: number; sy: number; sw: number; sh: number }>,
  ): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const id of selectedIds) {
      const p = projected.get(id);
      if (!p) continue;
      minX = Math.min(minX, p.sx);
      minY = Math.min(minY, p.sy);
      maxX = Math.max(maxX, p.sx + p.sw);
      maxY = Math.max(maxY, p.sy + p.sh);
    }

    if (!isFinite(minX)) return;

    const { ctx, style } = this;
    const pad = 6; // Screen-pixel padding around the aggregate box.

    ctx.strokeStyle = style.multiSelectStroke;
    ctx.lineWidth = 1;
    ctx.setLineDash(style.multiSelectDash);
    ctx.strokeRect(
      minX - pad,
      minY - pad,
      maxX - minX + pad * 2,
      maxY - minY + pad * 2,
    );
    ctx.setLineDash([]);
  }

  /**
   * Draws a layout mode badge pill (e.g. "FLEX →", "GRID")
   * anchored to the top-left corner of a container's projected rect.
   */
  private drawLayoutBadge(
    canvasRect: Readonly<Rect>,
    label: string,
    viewport: Readonly<ViewportMatrix>,
    xOffset: number,
    isJS?: boolean,
  ): number {
    const { ctx, style } = this;
    const { scale, offsetX, offsetY } = viewport;

    // Project to screen-space.
    const sx = canvasRect.x * scale + offsetX;
    const sy = canvasRect.y * scale + offsetY;

    // Measure text.
    ctx.font = style.layoutBadgeFont;
    const tm = ctx.measureText(label);
    const textW = tm.width;
    const padH = 6;
    const badgeW = textW + padH * 2;
    const badgeH = 14;
    const badgeX = sx - 1 + xOffset;
    const badgeY = sy - badgeH - 4; // Above the selection outline.

    // Draw badge background.
    if (isJS) {
      ctx.fillStyle = "#d97706"; // Premium Amber for JS/Script badge
    } else {
      ctx.fillStyle = style.layoutBadgeBg;
    }
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
    ctx.fill();

    // Draw text.
    if (isJS) {
      ctx.fillStyle = "#ffffff";
    } else {
      ctx.fillStyle = style.layoutBadgeText;
    }
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, badgeX + padH, badgeY + badgeH / 2 + 0.5);

    return badgeW;
  }

  /**
   * Draws dotted grid track lines overlaying a grid container.
   */
  private drawGridOverlay(
    canvasRect: Readonly<Rect>,
    columns: ReadonlyArray<{ start: number; size: number }>,
    rows: ReadonlyArray<{ start: number; size: number }>,
    viewport: Readonly<ViewportMatrix>,
  ): void {
    const { ctx, style } = this;
    const { scale, offsetX, offsetY } = viewport;

    // Container screen-space origin.
    const sx = canvasRect.x * scale + offsetX;
    const sy = canvasRect.y * scale + offsetY;
    const sw = canvasRect.width * scale;
    const sh = canvasRect.height * scale;

    ctx.strokeStyle = style.gridTrackStroke;
    ctx.lineWidth = 1;
    ctx.setLineDash(style.gridTrackDash);

    // Column track boundaries (vertical lines).
    for (const col of columns) {
      const x = sx + (col.start + col.size) * scale;
      if (x > sx && x < sx + sw) {
        ctx.beginPath();
        ctx.moveTo(x, sy);
        ctx.lineTo(x, sy + sh);
        ctx.stroke();
      }
    }

    // Row track boundaries (horizontal lines).
    for (const row of rows) {
      const y = sy + (row.start + row.size) * scale;
      if (y > sy && y < sy + sh) {
        ctx.beginPath();
        ctx.moveTo(sx, y);
        ctx.lineTo(sx + sw, y);
        ctx.stroke();
      }
    }

    ctx.setLineDash([]);
  }
}

// ── Alignment Guide Computation ─────────────────────────────

/**
 * Threshold (in canvas-space pixels) for snapping alignment.
 * When two edges or centers are within this distance, a guide
 * is generated.
 */
const DEFAULT_SNAP_THRESHOLD = 5;

/**
 * Computes alignment guide lines between a moving element and
 * all other elements. Detects edge-to-edge and center-to-center
 * alignment on both axes.
 *
 * ### Checked alignments (per axis)
 * - **Left/Top edge** of the moving element ↔ left/top, center,
 *   right/bottom of each other element.
 * - **Center** of the moving element ↔ left/top, center,
 *   right/bottom of each other element.
 * - **Right/Bottom edge** of the moving element ↔ left/top,
 *   center, right/bottom of each other element.
 *
 * @param movingRect  - The bounding rect of the element being
 *                       dragged or resized (canvas-space).
 * @param otherRects  - Array of bounding rects of all other
 *                       elements to snap against (canvas-space).
 * @param threshold   - Snap distance in canvas-space pixels.
 * @returns Array of `Guide` objects to render.
 */
export function computeAlignmentGuides(
  movingRect: Readonly<Rect>,
  otherRects: ReadonlyArray<Readonly<Rect>>,
  threshold: number = DEFAULT_SNAP_THRESHOLD,
): Guide[] {
  const guides: Guide[] = [];
  const seen = new Set<string>(); // Deduplicate overlapping guides.

  // Moving element's reference points.
  const mLeft = movingRect.x;
  const mRight = movingRect.x + movingRect.width;
  const mCenterX = movingRect.x + movingRect.width / 2;
  const mTop = movingRect.y;
  const mBottom = movingRect.y + movingRect.height;
  const mCenterY = movingRect.y + movingRect.height / 2;

  const mPointsX = [mLeft, mCenterX, mRight];
  const mPointsY = [mTop, mCenterY, mBottom];

  for (const other of otherRects) {
    const oLeft = other.x;
    const oRight = other.x + other.width;
    const oCenterX = other.x + other.width / 2;
    const oTop = other.y;
    const oBottom = other.y + other.height;
    const oCenterY = other.y + other.height / 2;

    const oPointsX = [oLeft, oCenterX, oRight];
    const oPointsY = [oTop, oCenterY, oBottom];

    // X-axis (vertical guides): compare left/center/right.
    for (const mp of mPointsX) {
      for (const op of oPointsX) {
        if (Math.abs(mp - op) <= threshold) {
          const key = `x:${op.toFixed(1)}`;
          if (!seen.has(key)) {
            seen.add(key);
            guides.push({ axis: "x", position: op });
          }
        }
      }
    }

    // Y-axis (horizontal guides): compare top/center/bottom.
    for (const mp of mPointsY) {
      for (const op of oPointsY) {
        if (Math.abs(mp - op) <= threshold) {
          const key = `y:${op.toFixed(1)}`;
          if (!seen.has(key)) {
            seen.add(key);
            guides.push({ axis: "y", position: op });
          }
        }
      }
    }
  }

  return guides;
}

/**
 * Computes snap-corrected position for a moving rect.
 *
 * If any edge or center of the moving rect is within `threshold`
 * of an alignment target, the returned position is adjusted to
 * snap exactly onto that target.
 *
 * @param movingRect - The element's current canvas-space rect.
 * @param otherRects - All other element rects to snap against.
 * @param threshold  - Snap distance in canvas-space pixels.
 * @returns A new `{ x, y }` position with snapping applied.
 */
export function computeSnappedPosition(
  movingRect: Readonly<Rect>,
  otherRects: ReadonlyArray<Readonly<Rect>>,
  threshold: number = DEFAULT_SNAP_THRESHOLD,
): Vec2 {
  let bestDx = Infinity;
  let bestDy = Infinity;
  let snapX = movingRect.x;
  let snapY = movingRect.y;

  const mLeft = movingRect.x;
  const mRight = movingRect.x + movingRect.width;
  const mCenterX = movingRect.x + movingRect.width / 2;
  const mTop = movingRect.y;
  const mBottom = movingRect.y + movingRect.height;
  const mCenterY = movingRect.y + movingRect.height / 2;

  for (const other of otherRects) {
    const oLeft = other.x;
    const oRight = other.x + other.width;
    const oCenterX = other.x + other.width / 2;
    const oTop = other.y;
    const oBottom = other.y + other.height;
    const oCenterY = other.y + other.height / 2;

    // X snap candidates: [movingRefPoint, otherRefPoint]
    const xPairs: [number, number][] = [
      [mLeft, oLeft], [mLeft, oCenterX], [mLeft, oRight],
      [mCenterX, oLeft], [mCenterX, oCenterX], [mCenterX, oRight],
      [mRight, oLeft], [mRight, oCenterX], [mRight, oRight],
    ];

    for (const [mp, op] of xPairs) {
      const d = Math.abs(mp - op);
      if (d <= threshold && d < bestDx) {
        bestDx = d;
        // Offset is the difference between the moving point and the target,
        // applied back to the origin.
        snapX = movingRect.x + (op - mp);
      }
    }

    // Y snap candidates.
    const yPairs: [number, number][] = [
      [mTop, oTop], [mTop, oCenterY], [mTop, oBottom],
      [mCenterY, oTop], [mCenterY, oCenterY], [mCenterY, oBottom],
      [mBottom, oTop], [mBottom, oCenterY], [mBottom, oBottom],
    ];

    for (const [mp, op] of yPairs) {
      const d = Math.abs(mp - op);
      if (d <= threshold && d < bestDy) {
        bestDy = d;
        snapY = movingRect.y + (op - mp);
      }
    }
  }

  return { x: snapX, y: snapY };
}

// ── Handle Anchor Projection ────────────────────────────────

/**
 * Computes the screen-space center positions of all 8 resize
 * handles for a given canvas-space bounding rect.
 *
 * Unlike `getAnchorPositions` in `matrix.ts`, this function
 * uses the offset-only transform (no `canvasRect` subtraction)
 * because the overlay renderer works in canvas-element-relative
 * coordinates, not page-absolute `clientX/Y`.
 */
function computeScreenAnchors(
  bounds: Readonly<Rect>,
  viewport: Readonly<ViewportMatrix>,
): Record<ResizeAnchor, Vec2> {
  const { x, y, width, height } = bounds;
  const s = viewport.scale;
  const ox = viewport.offsetX;
  const oy = viewport.offsetY;

  const left = x * s + ox;
  const top = y * s + oy;
  const right = (x + width) * s + ox;
  const bottom = (y + height) * s + oy;
  const midX = (x + width / 2) * s + ox;
  const midY = (y + height / 2) * s + oy;

  return {
    nw: { x: left, y: top },
    n: { x: midX, y: top },
    ne: { x: right, y: top },
    e: { x: right, y: midY },
    se: { x: right, y: bottom },
    s: { x: midX, y: bottom },
    sw: { x: left, y: bottom },
    w: { x: left, y: midY },
  };
}
