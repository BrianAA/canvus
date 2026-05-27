import { NodeTree } from "./tree.js";
import { Rect } from "./types.js";
/** Visual description of the insertion line segment in canvas-space. */
export interface InsertionIndicator {
    /** Starting X coordinate in canvas-space. */
    x1: number;
    /** Starting Y coordinate in canvas-space. */
    y1: number;
    /** Ending X coordinate in canvas-space. */
    x2: number;
    /** Ending Y coordinate in canvas-space. */
    y2: number;
    /** Whether the insertion points before or after the reference child. */
    side: "before" | "after";
}
/** Resolved drop target descriptor. */
export interface DropTarget {
    /** The container node ID receiving the dropped element. */
    parentId: string;
    /** Insertion position within the parent's children. */
    insertionIndex: number;
    /** Visual indicator details for rendering. */
    indicator: InsertionIndicator;
    /** Grid placement details, present only if the parent is a grid container. */
    gridPlacement?: {
        colStart: number;
        rowStart: number;
        colSpan: number;
        rowSpan: number;
        rect: Rect;
    };
}
/**
 * Traverses the node tree reverse depth-first to find the deepest
 * container under the cursor, computes the insertion point within
 * its CSS flow layout, and returns visual indicator line coordinates.
 *
 * @param draggedId  - The ID of the node currently being dragged.
 * @param canvasPos  - The current canvas-space cursor position.
 * @param tree       - The NodeTree model instance.
 * @param getWrapper - Callback to fetch a mounted wrapper DOM element.
 * @returns The resolved `DropTarget` details, or `null` if empty space.
 */
export declare function findDropTarget(draggedId: string, canvasPos: {
    x: number;
    y: number;
}, tree: NodeTree, getWrapper: (id: string) => HTMLElement | null): DropTarget | null;
//# sourceMappingURL=drop-zone.d.ts.map