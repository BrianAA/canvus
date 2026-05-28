// ─────────────────────────────────────────────────────────────
// canvus/src/index.ts — Public API barrel export.
// ─────────────────────────────────────────────────────────────
export { ZOOM_MIN, ZOOM_MAX, createIdleDragState, createDefaultViewport, resolveNode, } from "./types.js";
// ── Viewport Math ───────────────────────────────────────────
export { screenToCanvas, canvasToScreen, calculateZoomAnchor, applyWheelZoom, applyPan, isPointInElement, hitTestElements, getAnchorPositions, clampScale, lerp, lerpViewport, } from "./matrix.js";
export { ShadowMount } from "./shadow-mount.js";
// ── Node Tree Model ─────────────────────────────────────────
export { NodeTree, computeAggregateBounds } from "./tree.js";
export { detectLayout, getFlowAxis, getFlowSign, getLayoutLabel, detectChildSlots, parseGridTracks, } from "./layout.js";
export { OverlayRenderer, anchorCursor, computeAlignmentGuides, computeSnappedPosition, } from "./renderer.js";
export { Workspace } from "./workspace.js";
export { findDropTarget } from "./drop-zone.js";
//# sourceMappingURL=index.js.map