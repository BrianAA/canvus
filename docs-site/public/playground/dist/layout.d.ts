import type { LayoutMode, Rect } from "./types.js";
/** Flex direction values. */
export type FlexDirection = "row" | "column" | "row-reverse" | "column-reverse";
/** Flex wrap values. */
export type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";
/**
 * Complete layout metadata extracted from a container element's
 * computed styles. Covers flex, grid, and block layout properties.
 */
export interface LayoutInfo {
    /** Resolved CSS `display` mode. */
    mode: LayoutMode;
    /** Flex direction (only meaningful for flex/inline-flex). */
    direction: FlexDirection | null;
    /** Flex wrap mode. */
    wrap: FlexWrap | null;
    /** Resolved gap values in CSS pixels. */
    gap: {
        row: number;
        column: number;
    };
    /** Resolved `align-items` value. */
    alignItems: string;
    /** Resolved `justify-content` value. */
    justifyContent: string;
    /** Raw `grid-template-columns` computed value. */
    gridTemplateColumns: string | null;
    /** Raw `grid-template-rows` computed value. */
    gridTemplateRows: string | null;
    /** Raw `grid-auto-flow` computed value. */
    gridAutoFlow: string | null;
}
/**
 * Describes the computed position and size of a single "slot"
 * in a flex/grid/block container — where a child element sits.
 */
export interface ChildSlot {
    /** Zero-based index within the parent's children. */
    index: number;
    /** Bounding rect of the slot, relative to the container's padding box. */
    rect: Rect;
}
/** Describes a single grid track (column or row). */
export interface GridTrack {
    /** Start offset from the container's padding edge (px). */
    start: number;
    /** Size of the track (px). */
    size: number;
}
/**
 * Detects the CSS layout mode and properties of an element.
 *
 * Reads `getComputedStyle()` to extract the resolved display
 * mode, flex direction, gap, alignment, and grid template values.
 *
 * @param element - The DOM element to inspect.
 * @returns Complete `LayoutInfo` descriptor.
 */
export declare function detectLayout(element: HTMLElement): LayoutInfo;
/**
 * Returns the primary flow axis for a layout container.
 *
 * - Flex row → "x" (horizontal)
 * - Flex column → "y" (vertical)
 * - Grid row (default auto-flow) → "x"
 * - Block → "y" (vertical stacking)
 *
 * @param info - The layout info to inspect.
 * @returns "x" for horizontal flow, "y" for vertical flow.
 */
export declare function getFlowAxis(info: LayoutInfo): "x" | "y";
/**
 * Returns the flow direction sign for a layout container.
 *
 * `1` for normal direction, `-1` for reverse.
 * Useful for computing insertion positions.
 */
export declare function getFlowSign(info: LayoutInfo): 1 | -1;
/**
 * Detects the position and size of each child element's slot
 * within a container, measured relative to the container's
 * padding box.
 *
 * This uses `getBoundingClientRect()` for accuracy, then
 * converts to container-relative coordinates.
 *
 * @param container - The parent DOM element.
 * @returns Array of `ChildSlot` objects, one per child element.
 */
export declare function detectChildSlots(container: HTMLElement): ChildSlot[];
/**
 * Parses grid track values from a resolved `grid-template-columns`
 * or `grid-template-rows` string into an array of `GridTrack` objects.
 *
 * The browser resolves templates like `1fr 2fr 100px` into
 * computed pixel values like `200px 400px 100px`. This function
 * parses those resolved values, accounting for the layout gap between tracks.
 *
 * @param templateValue - The resolved CSS grid template string
 *                         (e.g. "200px 400px 100px").
 * @param gap           - The layout gap in pixels between tracks.
 * @returns Array of grid tracks with start offsets and sizes.
 */
export declare function parseGridTracks(templateValue: string, gap?: number): GridTrack[];
/**
 * Maps a padding-box relative coordinate (x, y) to the grid cell indices (1-indexed).
 *
 * @param x - X coordinate relative to container padding edge.
 * @param y - Y coordinate relative to container padding edge.
 * @param columns - Parsed column tracks.
 * @param rows - Parsed row tracks.
 * @param colGap - Column gap.
 * @param rowGap - Row gap.
 * @returns { col: number, row: number } (1-indexed, matching CSS grid-column-start/grid-row-start).
 */
export declare function getGridCellAt(x: number, y: number, columns: ReadonlyArray<GridTrack>, rows: ReadonlyArray<GridTrack>, colGap: number, rowGap: number): {
    col: number;
    row: number;
};
/**
 * Computes the canvas-space bounding rect of a grid area span.
 *
 * @param containerRect - The parent container's canvas-space bounding box.
 * @param padLeft - Container padding-left.
 * @param padTop - Container padding-top.
 * @param colStart - 1-based column start index.
 * @param rowStart - 1-based row start index.
 * @param colSpan - Column span.
 * @param rowSpan - Row span.
 * @param columns - Parsed column tracks.
 * @param rows - Parsed row tracks.
 * @returns The bounding Rect in canvas-space.
 */
export declare function getGridAreaRect(containerRect: Rect, padLeft: number, padTop: number, colStart: number, rowStart: number, colSpan: number, rowSpan: number, columns: ReadonlyArray<GridTrack>, rows: ReadonlyArray<GridTrack>): Rect;
/**
 * Returns a short, human-readable label for a layout mode.
 * Used for layout badge overlays.
 *
 * @param info - The layout info to label.
 * @returns A concise string like "FLEX →", "FLEX ↓", "GRID", "BLOCK".
 */
export declare function getLayoutLabel(info: LayoutInfo): string;
//# sourceMappingURL=layout.d.ts.map