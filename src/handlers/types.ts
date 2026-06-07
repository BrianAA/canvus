// ─────────────────────────────────────────────────────────────
// canvus/src/handlers/types.ts
// Core handler interfaces for the workspace handler architecture.
//
// The Workspace class implements WorkspaceContext and delegates
// pointer/keyboard events to registered handlers through the
// claim-based dispatch pattern.
// ─────────────────────────────────────────────────────────────

import type {
  Rect,
  Vec2,
  ViewportMatrix,
  ResolvedNode,
} from "../types.js";

import type { ShadowMount } from "../shadow-mount.js";
import type { NodeTree } from "../tree.js";
import type { OverlayRenderer, SpacingAdjusterType, SpacingAdjusterInfo } from "../renderer.js";
import type { DropTarget } from "../drop-zone.js";
import type { WorkspaceCallbacks } from "../workspace.js";

// ── Enriched Interaction Detail ─────────────────────────────

/**
 * Optional detail payload passed to `onInteractionChange` to give
 * hosts richer context about what interaction is occurring.
 */
export interface InteractionDetail {
  /** Node IDs involved in the interaction. */
  nodeIds?: string[];
  /** CSS property being modified (e.g. "padding-top", "width"). */
  property?: string;
  /** Handler ID that initiated the interaction. */
  handler?: string;
}

// ── Workspace Context ───────────────────────────────────────

/**
 * Shared state and utility contract that all handlers depend on.
 *
 * The `Workspace` class implements this interface, providing
 * handlers with access to subsystems, mutable state, and shared
 * helper methods without tight coupling to the Workspace class itself.
 *
 * Handlers receive a `WorkspaceContext` in their constructor and
 * use it for all state reads, mutations, and side effects.
 */
export interface WorkspaceContext {
  // ── Subsystems (read-only references) ───────────

  /** The in-memory node tree model. */
  readonly tree: NodeTree;
  /** The Shadow DOM projection layer. */
  readonly mount: ShadowMount;
  /** The Canvas 2D overlay renderer. */
  readonly renderer: OverlayRenderer;
  /** The workspace container DOM element. */
  readonly container: HTMLElement;
  /** The canvas overlay DOM element. */
  readonly canvas: HTMLCanvasElement;
  /** Host-provided callback functions. */
  readonly callbacks: WorkspaceCallbacks;

  // ── Configuration ───────────────────────────────

  /** Snap threshold for alignment guides (canvas-space px). */
  readonly snapThreshold: number;
  /** Minimum element dimension during resize (canvas-space px). */
  readonly minResizeSize: number;
  /** Whether snap-to-align guides are enabled. */
  readonly enableSnapGuides: boolean;

  // ── Mutable State ───────────────────────────────

  /** Current viewport transform (pan/zoom). */
  viewport: ViewportMatrix;
  /** Currently selected node IDs. */
  readonly selectedIds: Set<string>;
  /** Currently hovered node ID. */
  hoveredId: string | null;
  /** Active drop target during drag operations. */
  activeDropTarget: DropTarget | null;
  /** Whether the workspace is in preview mode. */
  readonly previewMode: boolean;
  /** Set of node IDs explicitly marked as containing JavaScript. */
  readonly jsMarkedNodes: ReadonlySet<string>;
  /** Set of node IDs explicitly locked by the host. */
  readonly lockedNodes: ReadonlySet<string>;
  /** Set of node IDs registered via lazy child discovery. */
  readonly lazyRegisteredIds: ReadonlySet<string>;
  /** Currently hovered spacing adjuster type. */
  hoveredAdjusterType: SpacingAdjusterType | null;
  /** Currently hovered radius corner handle. */
  hoveredRadiusCorner: string | null;
  /** Current alignment guides to draw. */
  guides: import("../renderer.js").Guide[];
  /** The ID of the currently entered container scope (for drill-down). */
  enteredContainerId: string | null;
  /** Timestamp of the last pointer down event. */
  lastPointerDownTime: number;
  /** Node ID from the last pointer down event. */
  lastPointerDownId: string | null;
  /** Event target from the last pointer down event. */
  lastPointerDownTarget: EventTarget | null;
  /** Whether a double-click should trigger text editing. */
  editAllowedOnDblClick: boolean;
  /** Last known canvas-space pointer position. */
  lastCanvasPos: Vec2 | null;

  // ── Shared Helpers ──────────────────────────────

  /** Queue a render pass (rAF-throttled). */
  render(): void;
  /** Re-measure a node and all its descendants. */
  remeasureSubtree(id: string): void;
  /** Programmatically update the viewport transform. */
  setViewport(vp: ViewportMatrix): void;
  /** Sync lazy child registration on selection changes. */
  syncLazyChildren(prev: Set<string>, next: Set<string>): void;
  /** Update the breadcrumb path and notify the host. */
  updateBreadcrumb(): void;
  /** Get the top-level selected node IDs (excluding descendants of selected ancestors). */
  getTopLevelSelectedIds(): string[];
  /** Get all selectable nodes in depth-first order. */
  getOrderedNodeList(): ReadonlyArray<ResolvedNode>;
  /** Get container bounding rect. */
  getContainerRect(): Rect;
  /** Get rects of all nodes except the given ID. */
  getOtherRects(excludeId: string): Rect[];
  /** Get rects of all nodes except the given IDs. */
  getOtherRectsMultiple(excludeIds: string[]): Rect[];
  /** Compute spacing adjuster info for a node. */
  computeSpacingAdjusters(id: string): SpacingAdjusterInfo[];
  /** Hit-test corner radius handles. */
  hitTestRadiusHandle(screenX: number, screenY: number, bounds: Readonly<Rect>, viewport: Readonly<ViewportMatrix>): string | null;
  /** Check if a node is locked (directly or via ancestor). */
  isNodeLocked(nodeId: string): boolean;
  /** Check if a CSS property on a node is locked by the host. */
  isPropertyLocked(nodeId: string, property: string): boolean;
  /** Notify the host of a locked property interaction attempt. */
  notifyPropertyLockInteraction(nodeId: string, property: string): void;
  /** Resolve which node is selectable at a given position and scope. */
  findSelectableNode(hitId: string, scopeId: string | null): string | null;
  /** Safely set pointer capture (skips in headless/Electron environments). */
  safeSetPointerCapture(pointerId: number): void;

  // ── Interaction Emission ────────────────────────

  /**
   * Emit an interaction mode change to the host with optional detail.
   * Wraps `callbacks.onInteractionChange` with the enriched payload.
   */
  emitInteraction(mode: string | null, detail?: InteractionDetail): void;

  // ── Node Mutation Delegation ────────────────────
  // These delegate to the Workspace's public API methods so handlers
  // can perform mutations without importing the Workspace class.

  /** Mount a new HTML node into the workspace. */
  addNode(node: import("../types.js").WebHTMLNode, parentId?: string | null, index?: number): Rect;
  /** Remove a node and all its descendants. */
  removeNode(id: string): boolean;
  /** Reparent a node to a new parent. */
  reparentNode(nodeId: string, newParentId: string | null, index?: number): void;
  /** Reorder a child within its parent. */
  reorderChild(nodeId: string, newIndex: number): void;
  /** Select a node by ID, clearing previous selection. */
  selectNode(id: string): void;
  /** Clear all selection. */
  deselectAll(): void;
  /** Mutate a single CSS property on a node. */
  setNodeStyle(id: string, property: string, value: string | null): void;
  /** Batch-mutate CSS properties on a node. */
  setNodeStyles(id: string, styles: Record<string, string | null>): void;
  /** Mark a node as containing JavaScript behavior. */
  markNodeHasJS(nodeId: string): void;

  // ── Element Counter ─────────────────────────────

  /** Increment and return a unique counter for generating element IDs. */
  nextElementId(): number;
}

// ── Interaction Handler ─────────────────────────────────────

/**
 * Interface for pointer-gesture-based interaction handlers.
 *
 * On `pointerdown`, the Workspace iterates through registered handlers
 * in priority order. The first handler that returns `true` from
 * `claim()` becomes the active handler for that gesture's duration.
 *
 * All subsequent `pointermove` / `pointerup` events route exclusively
 * to the active handler until the gesture completes.
 */
export interface InteractionHandler {
  /** Unique handler identifier (for debugging and interaction detail). */
  readonly id: string;

  /**
   * Phase 1: Claim check.
   *
   * Called on `pointerdown` in priority order. Return `true` to claim
   * ownership of this gesture. The first handler that claims wins;
   * no other handlers are consulted for this gesture.
   *
   * @param e         - The raw pointer event.
   * @param canvasPos - Pointer position in canvas-space.
   * @param hitNodeId - The node under the cursor (from hit testing), or null.
   * @param containerRect - The container's bounding rect (for screen-space calculations).
   */
  claim(
    e: PointerEvent,
    canvasPos: Vec2,
    hitNodeId: string | null,
    containerRect: Rect,
  ): boolean;

  /**
   * Phase 2: Pointer move during an active gesture.
   * Only called on the handler that claimed the gesture.
   */
  onPointerMove?(e: PointerEvent, canvasPos: Vec2, containerRect: Rect): void;

  /**
   * Phase 3: Pointer up — gesture completion.
   * Only called on the handler that claimed the gesture.
   */
  onPointerUp?(e: PointerEvent, canvasPos: Vec2, containerRect: Rect): void;

  /**
   * Cancel the active gesture (e.g. Escape key, tool change).
   * Resets handler state to idle.
   */
  onCancel?(): void;
}

// ── Keyboard Handler ────────────────────────────────────────

/**
 * Interface for keyboard-triggered handlers (clipboard, commands).
 *
 * On `keydown`, the Workspace iterates through registered keyboard
 * handlers. The first handler that returns `true` from `onKeyDown()`
 * consumes the event — no further handlers are consulted.
 */
export interface KeyboardHandler {
  /** Unique handler identifier. */
  readonly id: string;

  /**
   * Handle a keydown event. Return `true` if the event was consumed
   * (prevents further handler dispatch and default behavior).
   */
  onKeyDown?(e: KeyboardEvent): boolean;

  /**
   * Handle a keyup event. Return `true` if the event was consumed.
   */
  onKeyUp?(e: KeyboardEvent): boolean;
}
