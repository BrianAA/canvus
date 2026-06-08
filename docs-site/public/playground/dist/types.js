// ─────────────────────────────────────────────────────────────
// canvus/src/types.ts
// Core type declarations for the HTML-in-Canvas workspace SDK.
// All geometric primitives, node contracts, viewport state, and
// interaction descriptors live here as the single source of truth.
// ─────────────────────────────────────────────────────────────
/** Hard zoom boundaries to prevent degenerate transforms. */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4.0;
/**
 * Normalizes a user-provided `WebHTMLNode` into a fully resolved
 * internal representation with all tree fields populated.
 */
export function resolveNode(node) {
    return {
        id: node.id,
        rawMarkup: node.rawMarkup,
        currentRect: node.currentRect,
        parentId: node.parentId ?? null,
        childIds: node.childIds ? [...node.childIds] : [],
        layoutMode: node.layoutMode ?? null,
        depth: node.depth ?? 0,
    };
}
// ── Factory Helpers ─────────────────────────────────────────
/** Returns a clean, idle `DragHandleState` with no active gesture. */
export function createIdleDragState() {
    return {
        activeMode: null,
        targetNodeId: null,
        selectedAnchor: null,
        initialPointerPos: { x: 0, y: 0 },
    };
}
/** Returns a default viewport at 1:1 scale with zero pan offset. */
export function createDefaultViewport() {
    return {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
    };
}
//# sourceMappingURL=types.js.map