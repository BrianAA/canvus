// ─────────────────────────────────────────────────────────────
// canvus/src/renderer.ts
// Canvas Overlay Rendering Engine — Selection outlines, resize
// handle affordances, hover highlights, alignment guides, and
// interactive handle hit-testing.
//
// All drawing is DPR-aware and operates in screen-space after
// projecting canvas-space geometry through the viewport matrix.
// ─────────────────────────────────────────────────────────────
/** Sensible defaults tuned for a dark workspace aesthetic. */
const DEFAULT_STYLE = {
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
// ── Anchor Ordering ─────────────────────────────────────────
/**
 * Canonical order of the 8 resize anchors, clockwise from NW.
 * Used for iteration in drawing and hit-testing routines.
 */
const ANCHOR_ORDER = [
    "nw", "n", "ne", "e", "se", "s", "sw", "w",
];
// ── Cursor Mapping ──────────────────────────────────────────
/** Maps each resize anchor to its CSS cursor value. */
const ANCHOR_CURSORS = {
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
export function anchorCursor(anchor) {
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
export class OverlayRenderer {
    canvas;
    ctx;
    style;
    dpr = 1;
    width = 0;
    height = 0;
    /**
     * @param canvas - The `<canvas>` element to draw on.
     * @param style  - Optional partial style overrides.
     */
    constructor(canvas, style) {
        this.canvas = canvas;
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error("[OverlayRenderer] Failed to get 2D context.");
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
    resize(cssWidth, cssHeight) {
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
    render(frame) {
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
        const projected = new Map();
        for (const node of nodes) {
            if (!node.currentRect)
                continue;
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
            if (!p)
                continue;
            // Glow pass (drawn first, behind the solid stroke).
            ctx.save();
            ctx.shadowColor = style.selectionGlow;
            ctx.shadowBlur = style.selectionGlowRadius;
            ctx.strokeStyle = style.selectionStroke;
            ctx.lineWidth = style.selectionWidth;
            ctx.strokeRect(p.sx - 1, p.sy - 1, p.sw + 2, p.sh + 2);
            ctx.restore();
            // Solid stroke on top.
            ctx.strokeStyle = style.selectionStroke;
            ctx.lineWidth = style.selectionWidth;
            ctx.strokeRect(p.sx - 1, p.sy - 1, p.sw + 2, p.sh + 2);
        }
        // 6. Multi-select bounding box
        if (selectedIds.size > 1) {
            this.drawMultiSelectBounds(selectedIds, projected);
        }
        // 7. Resize handles
        for (const id of selectedIds) {
            const p = projected.get(id);
            if (!p)
                continue;
            this.drawHandles(p.sx, p.sy, p.sw, p.sh, activeAnchor);
        }
        // 8. Layout badges (M6)
        if (frame.layoutBadges) {
            const offsets = new Map();
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
            }
            else {
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
            let activeAdjuster = null;
            let activeProjectedRect = null;
            for (const adj of frame.spacingAdjusters) {
                const p = {
                    sx: adj.rect.x * viewport.scale + viewport.offsetX,
                    sy: adj.rect.y * viewport.scale + viewport.offsetY,
                    sw: adj.rect.width * viewport.scale,
                    sh: adj.rect.height * viewport.scale,
                };
                if (adj.isActive) {
                    activeAdjuster = adj;
                    activeProjectedRect = p;
                }
                const isPadding = adj.type.startsWith("padding");
                const baseColor = isPadding ? "34, 197, 94" : "249, 115, 22"; // Green vs Orange
                if (adj.isHovered || adj.isActive) {
                    ctx.fillStyle = `rgba(${baseColor}, 0.25)`;
                    ctx.fillRect(p.sx, p.sy, p.sw, p.sh);
                    ctx.strokeStyle = `rgba(${baseColor}, 0.85)`;
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(p.sx, p.sy, p.sw, p.sh);
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
                }
                else {
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
    hitTestHandle(screenX, screenY, bounds, viewport) {
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
    drawHandles(sx, sy, sw, sh, activeAnchor) {
        const { ctx, style } = this;
        const size = style.handleSize;
        const half = size / 2;
        const midX = sx + sw / 2;
        const midY = sy + sh / 2;
        const right = sx + sw;
        const bottom = sy + sh;
        const positions = {
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
            ctx.roundRect(hx - half, hy - half, size, size, style.handleRadius);
            ctx.fill();
            ctx.stroke();
        }
    }
    /** Draws the origin crosshair spanning the full viewport. */
    drawOrigin(viewport) {
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
    drawGuide(guide, viewport) {
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
        }
        else {
            // Horizontal guide at canvas-space y → screen-space.
            const sy = guide.position * viewport.scale + viewport.offsetY;
            ctx.moveTo(0, sy);
            ctx.lineTo(width, sy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    /** Draws the aggregate bounding box around all selected nodes. */
    drawMultiSelectBounds(selectedIds, projected) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const id of selectedIds) {
            const p = projected.get(id);
            if (!p)
                continue;
            minX = Math.min(minX, p.sx);
            minY = Math.min(minY, p.sy);
            maxX = Math.max(maxX, p.sx + p.sw);
            maxY = Math.max(maxY, p.sy + p.sh);
        }
        if (!isFinite(minX))
            return;
        const { ctx, style } = this;
        const pad = 6; // Screen-pixel padding around the aggregate box.
        ctx.strokeStyle = style.multiSelectStroke;
        ctx.lineWidth = 1;
        ctx.setLineDash(style.multiSelectDash);
        ctx.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);
        ctx.setLineDash([]);
    }
    /**
     * Draws a layout mode badge pill (e.g. "FLEX →", "GRID")
     * anchored to the top-left corner of a container's projected rect.
     */
    drawLayoutBadge(canvasRect, label, viewport, xOffset, isJS) {
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
        }
        else {
            ctx.fillStyle = style.layoutBadgeBg;
        }
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
        ctx.fill();
        // Draw text.
        if (isJS) {
            ctx.fillStyle = "#ffffff";
        }
        else {
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
    drawGridOverlay(canvasRect, columns, rows, viewport) {
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
export function computeAlignmentGuides(movingRect, otherRects, threshold = DEFAULT_SNAP_THRESHOLD) {
    const guides = [];
    const seen = new Set(); // Deduplicate overlapping guides.
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
export function computeSnappedPosition(movingRect, otherRects, threshold = DEFAULT_SNAP_THRESHOLD) {
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
        const xPairs = [
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
        const yPairs = [
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
function computeScreenAnchors(bounds, viewport) {
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
//# sourceMappingURL=renderer.js.map