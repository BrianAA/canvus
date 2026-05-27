import type { Rect, ResizeAnchor, Vec2, ViewportMatrix } from "./types.js";
import type { GridTrack } from "./layout.js";
import type { DropTarget } from "./drop-zone.js";
/** Visual styling tokens for the overlay renderer. */
export interface OverlayStyle {
    /** Stroke color for selected element outlines. */
    selectionStroke: string;
    /** Stroke width (screen pixels) for selection outlines. */
    selectionWidth: number;
    /** Shadow color for the selection glow effect. */
    selectionGlow: string;
    /** Blur radius (px) for the selection glow. */
    selectionGlowRadius: number;
    /** Stroke color for hovered (non-selected) element outlines. */
    hoverStroke: string;
    /** Stroke width for hover outlines. */
    hoverWidth: number;
    /** Dash pattern for hover outlines (`[]` = solid). */
    hoverDash: number[];
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
    /** Stroke color for alignment guide lines. */
    guideStroke: string;
    /** Stroke width for guides. */
    guideWidth: number;
    /** Dash pattern for guides. */
    guideDash: number[];
    /** Stroke color for the origin crosshair. */
    originStroke: string;
    /** Dash pattern for the origin crosshair. */
    originDash: number[];
    /** Stroke color for the aggregate bounding box. */
    multiSelectStroke: string;
    /** Dash pattern for the aggregate bounding box. */
    multiSelectDash: number[];
    /** Background color for layout mode badge pills. */
    layoutBadgeBg: string;
    /** Text color for layout badge labels. */
    layoutBadgeText: string;
    /** Font for layout badge labels. */
    layoutBadgeFont: string;
    /** Stroke color for grid track overlay lines. */
    gridTrackStroke: string;
    /** Dash pattern for grid track lines. */
    gridTrackDash: number[];
    /** Stroke color for parent highlight outline when child is selected. */
    parentHighlightStroke: string;
    /** Stroke color for available children outlines when container is selected. */
    childOutlineStroke: string;
    /** Stroke color for the active drop container border. */
    dropZoneStroke: string;
    /** Stroke width for drop zones. */
    dropZoneWidth: number;
    /** Stroke color for the insertion line. */
    insertionLineStroke: string;
    /** Stroke width for the insertion line. */
    insertionLineWidth: number;
}
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
    nodes: ReadonlyArray<Readonly<{
        id: string;
        currentRect: Rect | null;
        parentId?: string | null;
        childIds?: readonly string[];
    }>>;
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
    /** Layout mode badges to render on selected containers. */
    layoutBadges?: ReadonlyArray<LayoutBadgeInfo>;
    /** Grid track overlays to render on selected grid containers. */
    gridOverlays?: ReadonlyArray<GridOverlayInfo>;
    /** Active drop zone target container and index. */
    activeDropTarget?: DropTarget | null;
    /** Active marquee selection rect in canvas-space. */
    marqueeRect?: Rect | null;
    /** Active spacing adjusters to render on screen. */
    spacingAdjusters?: ReadonlyArray<SpacingAdjusterInfo>;
}
export type SpacingAdjusterType = "padding-top" | "padding-right" | "padding-bottom" | "padding-left" | "margin-top" | "margin-right" | "margin-bottom" | "margin-left";
export interface SpacingAdjusterInfo {
    type: SpacingAdjusterType;
    /** Bounding box of the handle bar in canvas-space. */
    rect: Rect;
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
/**
 * Returns the appropriate CSS cursor string for a given
 * resize anchor direction.
 *
 * @param anchor - The anchor being hovered, or `null`.
 * @returns CSS cursor value (e.g. `"nwse-resize"`), or
 *          `"default"` if no anchor is active.
 */
export declare function anchorCursor(anchor: ResizeAnchor | null): string;
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
export declare class OverlayRenderer {
    private readonly canvas;
    private readonly ctx;
    private readonly style;
    private dpr;
    private width;
    private height;
    /**
     * @param canvas - The `<canvas>` element to draw on.
     * @param style  - Optional partial style overrides.
     */
    constructor(canvas: HTMLCanvasElement, style?: Partial<OverlayStyle>);
    /**
     * Resizes the canvas buffer to match the given CSS dimensions,
     * scaling by the device pixel ratio for crisp rendering.
     *
     * Call this on window resize and initial setup.
     *
     * @param cssWidth  - Desired CSS width in pixels.
     * @param cssHeight - Desired CSS height in pixels.
     */
    resize(cssWidth: number, cssHeight: number): void;
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
    render(frame: OverlayFrame): void;
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
    hitTestHandle(screenX: number, screenY: number, bounds: Readonly<Rect>, viewport: Readonly<ViewportMatrix>): ResizeAnchor | null;
    /** Draws the 8 resize handles around a projected rect. */
    private drawHandles;
    /** Draws the origin crosshair spanning the full viewport. */
    private drawOrigin;
    /** Draws a single alignment guide line. */
    private drawGuide;
    /** Draws the aggregate bounding box around all selected nodes. */
    private drawMultiSelectBounds;
    /**
     * Draws a layout mode badge pill (e.g. "FLEX →", "GRID")
     * anchored to the top-left corner of a container's projected rect.
     */
    private drawLayoutBadge;
    /**
     * Draws dotted grid track lines overlaying a grid container.
     */
    private drawGridOverlay;
}
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
export declare function computeAlignmentGuides(movingRect: Readonly<Rect>, otherRects: ReadonlyArray<Readonly<Rect>>, threshold?: number): Guide[];
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
export declare function computeSnappedPosition(movingRect: Readonly<Rect>, otherRects: ReadonlyArray<Readonly<Rect>>, threshold?: number): Vec2;
//# sourceMappingURL=renderer.d.ts.map