// ─────────────────────────────────────────────────────────────
// canvus/src/index.ts — Public API barrel export.
// ─────────────────────────────────────────────────────────────

// ── Types & Constants ───────────────────────────────────────

export type {
  Vec2,
  Rect,
  ViewportMatrix,
  WebHTMLNode,
  ResolvedNode,
  LayoutMode,
  ResizeAnchor,
  InteractionMode,
  DragHandleState,
  CanvusTool,
  CommandShortcut,
  Command,
} from "./types.js";

export {
  ZOOM_MIN,
  ZOOM_MAX,
  createIdleDragState,
  createDefaultViewport,
  resolveNode,
} from "./types.js";

// ── Viewport Math ───────────────────────────────────────────

export {
  screenToCanvas,
  canvasToScreen,
  calculateZoomAnchor,
  applyWheelZoom,
  applyPan,
  isPointInElement,
  hitTestElements,
  getAnchorPositions,
  clampScale,
  lerp,
  lerpViewport,
} from "./matrix.js";

// ── Shadow DOM Mount ────────────────────────────────────────

export type { RectChangeCallback } from "./shadow-mount.js";

export { ShadowMount } from "./shadow-mount.js";

// ── Node Tree Model ─────────────────────────────────────────

export { NodeTree, computeAggregateBounds } from "./tree.js";

// ── Layout Introspection ────────────────────────────────────

export type {
  FlexDirection,
  FlexWrap,
  LayoutInfo,
  ChildSlot,
  GridTrack,
} from "./layout.js";

export {
  detectLayout,
  getFlowAxis,
  getFlowSign,
  getLayoutLabel,
  detectChildSlots,
  parseGridTracks,
} from "./layout.js";

// ── Canvas Overlay Renderer ─────────────────────────────────

export type {
  OverlayStyle,
  OverlayFrame,
  LayoutBadgeInfo,
  GridOverlayInfo,
  Guide,
} from "./renderer.js";

export {
  OverlayRenderer,
  anchorCursor,
  computeAlignmentGuides,
  computeSnappedPosition,
} from "./renderer.js";

// ── Workspace Controller ────────────────────────────────────

export type {
  WorkspaceConfig,
  WorkspaceCallbacks,
} from "./workspace.js";

export { Workspace } from "./workspace.js";

// ── Drop Zone & Flow Drag-and-Drop ──────────────────────────

export type {
  DropTarget,
  InsertionIndicator,
} from "./drop-zone.js";

export { findDropTarget } from "./drop-zone.js";

// ── Handler Architecture ────────────────────────────────────

export type {
  InteractionHandler,
  KeyboardHandler,
  InteractionDetail,
  WorkspaceContext,
} from "./handlers/types.js";
