// ─────────────────────────────────────────────────────────────
// canvus/src/workspace.ts
// Unified Interaction Controller — Milestone 4.
//
// Orchestrates the complete Synchronous Reflow Loop:
//   pointerdown → mode detection
//   pointermove → delta → style surgery → sync reflow →
//                 measurement → guide computation → render
//   pointerup   → flat string bridge → commit callback
//
// This is the single public entry point for consumers.
// It owns the ShadowMount, OverlayRenderer, and all event
// bindings. The consumer provides a container element and
// callbacks; everything else is handled internally.
// ─────────────────────────────────────────────────────────────

import type {
  Rect,
  ResolvedNode,
  ResizeAnchor,
  Vec2,
  ViewportMatrix,
  WebHTMLNode,
  Operation,
  CanvusTool,
} from "./types.js";

import { createDefaultViewport, resolveNode } from "./types.js";

import {
  applyPan,
  applyWheelZoom,
  hitTestElements,
  screenToCanvas,
  rectsIntersect,
  isPointInElement,
} from "./matrix.js";

import { ShadowMount } from "./shadow-mount.js";
import { NodeTree, computeAggregateBounds } from "./tree.js";
import { findDropTarget } from "./drop-zone.js";
import type { DropTarget } from "./drop-zone.js";

import type { Guide, LayoutBadgeInfo, GridOverlayInfo, OverlayStyle, SpacingAdjusterType, SpacingAdjusterInfo } from "./renderer.js";
import {
  OverlayRenderer,
  anchorCursor,
  computeAlignmentGuides,
  computeSnappedPosition,
  isContainerNode,
} from "./renderer.js";

import { detectLayout, getLayoutLabel, parseGridTracks, getFlowAxis, GridTrack } from "./layout.js";

// ── Configuration ───────────────────────────────────────────

/** Configuration options for the workspace. */
export interface WorkspaceConfig {
  /** Partial overlay style overrides. */
  overlayStyle?: Partial<OverlayStyle>;
  /** Snap threshold for alignment guides (canvas-space px). @default 5 */
  snapThreshold?: number;
  /** Minimum element dimension during resize (canvas-space px). @default 40 */
  minResizeSize?: number;
  /** Enable snap-to-align guides during drag/resize. @default true */
  enableSnapGuides?: boolean;
}

// ── Event Callbacks ─────────────────────────────────────────

/** Callback signatures for workspace lifecycle events. */
export interface WorkspaceCallbacks {
  /**
   * **Flat String Bridge output.**
   * Fired on `pointerup` after a drag or resize gesture completes.
   * Receives the node's clean inner HTML string ready for AST commit.
   */
  onHTMLCommit?: (id: string, html: string) => void;

  /** Fired whenever any node's canvas-space bounding rect changes. */
  onNodeRectChange?: (id: string, rect: Rect) => void;

  /** Fired whenever the viewport transform changes (pan/zoom). */
  onViewportChange?: (viewport: Readonly<ViewportMatrix>) => void;

  /** Fired when the selection set changes. */
  onSelectionChange?: (selectedIds: ReadonlySet<string>) => void;

  /** Fired when the active selection parent hierarchy path changes (breadcrumbs). */
  onBreadcrumbChange?: (path: string[]) => void;

  /** Fired when the interaction mode changes (idle/pan/drag/resize). */
  onInteractionChange?: (mode: string | null) => void;

  /** Fired when visual editor gestures complete and generate history operations. */
  onOperationsGenerated?: (operations: Operation[]) => void;

  /** Fired when double-clicking a text node to delegate rich-text editing to the host. */
  onTextEditRequest?: (
    nodeId: string,
    element: HTMLElement,
    commit: (newHTML: string) => void
  ) => void;

  /**
   * Optional custom handler to delegate pseudo-class forcing.
   * Fired when a node's pseudo-class state (hover, active, focus) is modified.
   */
  onForcePseudoState?: (
    nodeId: string,
    state: "hover" | "active" | "focus",
    enabled: boolean
  ) => void;
}

// ── Resize Math ─────────────────────────────────────────────

/**
 * Computes a new bounding rect after applying a resize delta
 * from a given anchor direction. Enforces a minimum size.
 */
function computeResizedRect(
  start: Readonly<Rect>,
  anchor: ResizeAnchor,
  dx: number,
  dy: number,
  minSize: number,
  symmetrical: boolean,
): Rect {
  let { x, y, width, height } = start;

  const affectsLeft = anchor === "nw" || anchor === "w" || anchor === "sw";
  const affectsRight = anchor === "ne" || anchor === "e" || anchor === "se";
  const affectsTop = anchor === "nw" || anchor === "n" || anchor === "ne";
  const affectsBottom = anchor === "sw" || anchor === "s" || anchor === "se";

  if (symmetrical) {
    const centerX = start.x + start.width / 2;
    const centerY = start.y + start.height / 2;

    if (affectsRight) {
      width = Math.max(minSize, start.width + 2 * dx);
    } else if (affectsLeft) {
      width = Math.max(minSize, start.width - 2 * dx);
    }

    if (affectsBottom) {
      height = Math.max(minSize, start.height + 2 * dy);
    } else if (affectsTop) {
      height = Math.max(minSize, start.height - 2 * dy);
    }

    x = centerX - width / 2;
    y = centerY - height / 2;
    return { x, y, width, height };
  }

  if (affectsRight) {
    width = Math.max(minSize, width + dx);
  }
  if (affectsLeft) {
    const newWidth = Math.max(minSize, width - dx);
    x = x + (width - newWidth); // Shift origin to compensate.
    width = newWidth;
  }
  if (affectsBottom) {
    height = Math.max(minSize, height + dy);
  }
  if (affectsTop) {
    const newHeight = Math.max(minSize, height - dy);
    y = y + (height - newHeight);
    height = newHeight;
  }

  return { x, y, width, height };
}

// ── Workspace Class ─────────────────────────────────────────

/**
 * The top-level orchestration engine for a Canvus workspace.
 *
 * ### What it owns
 * - A `ShadowMount` for the HTML projection layer.
 * - An `OverlayRenderer` for the canvas affordance layer.
 * - All pointer, wheel, and keyboard event bindings.
 * - The complete interaction state machine (pan / drag / resize).
 *
 * ### Synchronous Reflow Loop (per pointermove frame)
 * ```
 * pointer delta
 *   → style surgery (setNodeRect / setNodePosition)
 *   → browser synchronous reflow
 *   → measureNode() reads updated layout
 *   → rect cache updated
 *   → alignment guides computed
 *   → OverlayRenderer.render()
 * ```
 *
 * ### Flat String Bridge
 * On `pointerup` after any mutating gesture, calls
 * `ShadowMount.extractHTML()` and fires `onHTMLCommit`
 * with the pristine semantic HTML string.
 *
 * ### Usage
 * ```ts
 * const ws = new Workspace(document.getElementById('editor')!, {
 *   onHTMLCommit: (id, html) => console.log(id, html),
 * });
 * ws.addNode({ id: 'card-1', rawMarkup: '<div>Hello</div>', currentRect: null });
 * ```
 */
export class Workspace {
  // ── Internal Subsystems ─────────────────────────

  private readonly mount: ShadowMount;
  private readonly renderer: OverlayRenderer;
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;

  // ── Configuration ───────────────────────────────

  private readonly callbacks: WorkspaceCallbacks;
  private readonly snapThreshold: number;
  private readonly minResizeSize: number;
  private readonly enableSnapGuides: boolean;

  // ── Workspace State ─────────────────────────────

  private viewport: ViewportMatrix;
  private readonly tree = new NodeTree();
  private readonly selectedIds = new Set<string>();
  private hoveredId: string | null = null;
  private dynamicHoveredId: string | null = null;
  private readonly forcedStates = {
    hover: new Set<string>(),
    active: new Set<string>(),
    focus: new Set<string>()
  };
  private activeAnchor: ResizeAnchor | null = null;
  private guides: Guide[] = [];

  // ── Scoped Selection Scope ──────────────────────
  private enteredContainerId: string | null = null;
  private lastPointerDownTime = 0;
  private lastPointerDownId: string | null = null;
  private lastPointerDownTarget: EventTarget | null = null;
  private editAllowedOnDblClick = false;

  // ── Drag & Drop State ───────────────────────────
  private activeDropTarget: DropTarget | null = null;
  private pointerDownInsideSelection: string | null = null;

  // ── Interaction State Machine ───────────────────

  private spaceDown = false;
  private isAdjustingRadius = false;
  private activeRadiusCorner: string | null = null;
  private hoveredRadiusCorner: string | null = null;
  private radiusTargetNodeId: string | null = null;
  private radiusStartValues = new Map<string, string>();
  private readonly dragStartNodes = new Map<string, {
    startPos: Vec2;
    startParentId: string | null;
    startIndex: number;
    startStyles: Record<string, string | null> | null;
  }>();
  private isPanning = false;
  private isDragging = false;
  private pointerDownReadyToDrag = false;
  private isResizing = false;
  private isMarqueeSelecting = false;
  private marqueeStartCanvas: Vec2 | null = null;
  private marqueeCurrentCanvas: Vec2 | null = null;
  private preMarqueeSelectedIds = new Set<string>();
  private hoveredAdjusterType: SpacingAdjusterType | null = null;
  private activeAdjusterType: SpacingAdjusterType | null = null;
  private adjusterStartValue = 0;
  private adjusterStartValueStr: string | null = null;
  private dragStartCanvas: Vec2 | null = null;
  private lastCanvasPos: Vec2 | null = null;

  private resizeStartRect: Rect | null = null;
  private dragStartStyles: Record<string, string | null> | null = null;
  private disposed = false;
  private renderRequested = false;
  private previewMode = false;

  /** Set of node IDs explicitly marked as containing JavaScript behavior. */
  private readonly jsMarkedNodes = new Set<string>();

  /** Set of node IDs that were lazily registered (children discovered on selection). */
  private readonly lazyRegisteredIds = new Set<string>();
  private lazyChildCounter = 0;

  // ── Drawing Tool State ──────────────────────────
  private activeTool: CanvusTool = null;
  private drawingTag: string = "div";
  private drawingTextTag: string = "p";
  private isDrawingNode: boolean = false;
  private drawStartCanvas: Vec2 | null = null;
  private drawCurrentCanvas: Vec2 | null = null;
  private newElementCounter: number = 0;

  // ── Clipboard State ─────────────────────────────
  private clipboardItems: Array<{
    rawMarkup: string;
    rect: Rect | null;
    hasJS: boolean;
  }> = [];
  private isDragCopy: boolean = false;

  // ── Bound Event Handlers (for cleanup) ──────────

  private readonly onWheel: (e: WheelEvent) => void;
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onWindowResize: () => void;
  private readonly onDblClick: (e: MouseEvent) => void;
  private readonly onDragStart: (e: DragEvent) => void;

  // ── Constructor ─────────────────────────────────

  constructor(
    container: HTMLElement,
    callbacks: WorkspaceCallbacks = {},
    config: WorkspaceConfig = {},
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.snapThreshold = config.snapThreshold ?? 5;
    this.minResizeSize = config.minResizeSize ?? 40;
    this.enableSnapGuides = config.enableSnapGuides ?? true;
    this.viewport = createDefaultViewport();

    // ── Ensure container is positioned ────────────
    const pos = getComputedStyle(container).position;
    if (pos === "static") {
      container.style.position = "relative";
    }
    container.style.overflow = "hidden";

    // ── Create Canvas Overlay ─────────────────────
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:10;";
    container.appendChild(this.canvas);

    // ── Initialize Subsystems ─────────────────────
    this.renderer = new OverlayRenderer(this.canvas, config.overlayStyle);

    this.mount = new ShadowMount(container, (id, rect) => {
      // ResizeObserver callback — update cache and re-render.
      const node = this.tree.get(id);
      if (node) {
        node.currentRect = rect;
        this.callbacks.onNodeRectChange?.(id, rect);
        this.render();
      }
    });

    this.mount.applyViewportTransform(this.viewport);

    // Intercept and prevent click and submit events inside Shadow DOM when in Edit Mode
    const shadowRoot = this.mount.getShadowRoot();
    shadowRoot.addEventListener(
      "click",
      (e) => {
        if (!this.previewMode) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      { capture: true }
    );
    shadowRoot.addEventListener(
      "submit",
      (e) => {
        if (!this.previewMode) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      { capture: true }
    );

    // ── Bind Events ───────────────────────────────
    this.onWheel = this.handleWheel.bind(this);
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onKeyDown = this.handleKeyDown.bind(this);
    this.onKeyUp = this.handleKeyUp.bind(this);
    this.onWindowResize = this.handleResize.bind(this);
    this.onDblClick = this.handleDblClick.bind(this);
    this.onDragStart = (e: DragEvent) => e.preventDefault();

    container.addEventListener("wheel", this.onWheel, { passive: false });
    container.addEventListener("pointerdown", this.onPointerDown);
    container.addEventListener("pointermove", this.onPointerMove);
    container.addEventListener("pointerup", this.onPointerUp);
    container.addEventListener("dblclick", this.onDblClick);
    container.addEventListener("dragstart", this.onDragStart);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onWindowResize);

    // ── Initial Sizing ────────────────────────────
    this.handleResize();
  }

  // ── Public API: Node Management ─────────────────

  /**
   * Mounts a new HTML node into the workspace.
   *
   * Performs the **Geometry Extraction Loop**: injects the markup
   * into the Shadow DOM, forces a synchronous layout read, and
   * returns the measured canvas-space bounding rect.
   *
   * @param node     - The node descriptor.
   * @param parentId - Optional parent node ID for nested mounting.
   * @param index    - Optional insertion index within the parent's children.
   * @returns The initial bounding rect after browser layout.
   */
  addNode(
    node: Readonly<WebHTMLNode>,
    parentId?: string | null,
    index?: number,
  ): Rect {
    this.assertNotDisposed();

    // Resolve to internal representation.
    const resolved = resolveNode(node);
    resolved.parentId = parentId ?? null;

    // Mount into shadow DOM.
    let rect: Rect;
    if (resolved.parentId !== null) {
      rect = this.mount.addChildNode(node, resolved.parentId, index);
    } else {
      rect = this.mount.addNode(node);
    }
    resolved.currentRect = rect;

    // Add to tree.
    this.tree.addNode(resolved, index);

    // If this node has a parent, register it in the parent's childIds.
    // (NodeTree.addNode already handles this via the tree structure.)

    // Synchronously measure and detect layout mode on mount.
    this.remeasureSubtree(resolved.id);
    if (resolved.parentId !== null) {
      this.remeasureSubtree(resolved.parentId);
    }

    this.render();
    return resolved.currentRect ?? rect;
  }

  /** Removes a node and all its descendants from the workspace. */
  removeNode(id: string): boolean {
    // Remove all descendants first (depth-first).
    const descendantIds = this.tree.getDescendantIds(id);
    for (const did of descendantIds) {
      this.mount.removeNode(did);
      this.selectedIds.delete(did);
    }

    const removed = this.mount.removeNode(id);
    if (removed) {
      this.tree.removeNode(id); // Also removes descendants from tree.
      this.selectedIds.delete(id);
      this.render();
    }
    return removed;
  }

  /** Hot-swaps the inner HTML of a mounted node. */
  updateMarkup(id: string, markup: string): Rect | null {
    const rect = this.mount.updateMarkup(id, markup);
    if (rect) {
      const node = this.tree.get(id);
      if (node) {
        node.rawMarkup = markup;
        node.currentRect = rect;
      }
      this.render();
    }
    return rect;
  }

  // ── Public API: Tree Operations ─────────────────

  /**
   * Moves a node to a new parent (or to root level).
   * Handles both DOM reparenting and tree model update.
   * Fires `onHTMLCommit` with the new parent's HTML.
   */
  reparentNode(
    nodeId: string,
    newParentId: string | null,
    index?: number,
  ): void {
    const node = this.tree.get(nodeId);
    const oldParentId = node?.parentId ?? null;

    // DOM reparenting.
    this.mount.reparentNodeDOM(nodeId, newParentId, index);

    // Tree model update.
    this.tree.reparentNode(nodeId, newParentId, index);

    // Re-measure affected nodes.
    this.remeasureSubtree(nodeId);
    if (newParentId) this.remeasureSubtree(newParentId);
    if (oldParentId) this.remeasureSubtree(oldParentId);

    this.render();

    // Flat string bridge: commit the old parent's HTML if it existed.
    if (oldParentId) {
      const oldHtml = this.mount.extractHTML(oldParentId);
      if (oldHtml) {
        this.callbacks.onHTMLCommit?.(oldParentId, oldHtml);
      }
    }

    // Flat string bridge: commit the new parent's HTML.
    const commitTarget = newParentId ?? nodeId;
    const html = this.mount.extractHTML(commitTarget);
    if (html) {
      this.callbacks.onHTMLCommit?.(commitTarget, html);
    }
  }

  /**
   * Reorders a child within its current parent.
   */
  reorderChild(nodeId: string, newIndex: number): void {
    const node = this.tree.get(nodeId);
    if (!node?.parentId) return;

    // DOM reorder: remove and re-insert at new index.
    this.mount.reparentNodeDOM(nodeId, node.parentId, newIndex);

    // Tree model update.
    this.tree.reorderChild(nodeId, newIndex);

    // Re-measure the parent's children.
    this.remeasureSubtree(node.parentId);

    this.render();
  }

  /** Returns the NodeTree for advanced tree queries. */
  getNodeTree(): NodeTree {
    return this.tree;
  }

  /** Returns the wrapper DOM element for a node ID. */
  getWrapper(id: string): HTMLElement | null {
    return this.mount.getWrapper(id);
  }

  /** Returns the user's content root element for a node ID. */
  getContentRoot(id: string): HTMLElement | null {
    return this.mount.getContentRoot(id);
  }

  /**
   * Mutates a single CSS style property on the specified node's content element.
   * Automatically triggers browser reflow, updates internal tree boundaries,
   * re-renders visual overlays, and commits clean HTML back to AST.
   */
  setNodeStyle(id: string, property: string, value: string | null): void {
    const node = this.tree.get(id);
    if (!node) return;

    // Apply the style change
    this.mount.setNodeStyle(id, property, value);

    // Sync layout display mode changes
    if (property === "display") {
      const contentRoot = this.mount.getContentRoot(id);
      node.layoutMode = contentRoot ? detectLayout(contentRoot).mode : ((value ?? "none") as any);
    }

    // Remeasure layout subtree boundaries
    this.remeasureSubtree(id);
    if (node.parentId) {
      this.remeasureSubtree(node.parentId);
    }

    this.render();

    // Commit html changes via flat string bridge
    const commitTarget = node.parentId ?? id;
    const html = this.mount.extractHTML(commitTarget);
    if (html) {
      this.callbacks.onHTMLCommit?.(commitTarget, html);
    }
  }

  /**
   * Mutates multiple CSS style properties on the specified node's content element.
   * Batch-updates styles, triggers a single reflow/remeasure loop, and commits changes.
   */
  setNodeStyles(id: string, styles: Record<string, string | null>): void {
    const node = this.tree.get(id);
    if (!node) return;

    // Batch apply styles
    this.mount.setNodeStyles(id, styles);

    // Sync layout display mode changes if any
    for (const [prop, val] of Object.entries(styles)) {
      if (prop === "display") {
        const contentRoot = this.mount.getContentRoot(id);
        node.layoutMode = contentRoot ? detectLayout(contentRoot).mode : ((val ?? "none") as any);
      }
    }

    // Remeasure layout subtree boundaries
    this.remeasureSubtree(id);
    if (node.parentId) {
      this.remeasureSubtree(node.parentId);
    }

    this.render();

    // Commit html changes via flat string bridge
    const commitTarget = node.parentId ?? id;
    const html = this.mount.extractHTML(commitTarget);
    if (html) {
      this.callbacks.onHTMLCommit?.(commitTarget, html);
    }
  }

  // ── Public API: Selection ───────────────────────

  /** Selects a node by ID, clearing previous selection. */
  selectNode(id: string): void {
    const prev = new Set(this.selectedIds);
    this.selectedIds.clear();
    this.selectedIds.add(id);
    this.syncLazyChildren(prev, this.selectedIds);
    this.callbacks.onSelectionChange?.(this.selectedIds);
    this.render();
  }

  /** Clears all selection. */
  deselectAll(): void {
    const prev = new Set(this.selectedIds);
    this.selectedIds.clear();
    this.syncLazyChildren(prev, this.selectedIds);
    this.callbacks.onSelectionChange?.(this.selectedIds);
    this.render();
  }

  /** Returns the current selection set (read-only view). */
  getSelectedIds(): ReadonlySet<string> {
    return this.selectedIds;
  }

  // ── Public API: Viewport ────────────────────────

  /** Returns the current viewport transform. */
  getViewport(): Readonly<ViewportMatrix> {
    return this.viewport;
  }

  /** Programmatically sets the viewport (e.g. for "fit to content"). */
  setViewport(vp: ViewportMatrix): void {
    this.viewport = vp;
    this.mount.applyViewportTransform(vp);

    // Re-measure all nodes since the scale/transform has changed
    const roots = this.tree.getRoots();
    for (const root of roots) {
      this.remeasureSubtree(root.id);
    }

    this.callbacks.onViewportChange?.(vp);
    this.render();
  }

  /** Resets viewport to 1:1 scale, zero offset. */
  resetViewport(): void {
    this.setViewport(createDefaultViewport());
  }

  // ── Public API: Preview Mode ────────────────────

  /** Sets whether the workspace is in Preview Mode (disables editing overlays and events). */
  setPreviewMode(enabled: boolean): void {
    if (this.previewMode === enabled) return;
    this.previewMode = enabled;

    this.canvas.style.pointerEvents = "none";

    // Clear selection, hover, and active interactions.
    if (enabled) {
      this.selectedIds.clear();
      this.clearDynamicHover();
      this.hoveredId = null;
      this.activeDropTarget = null;
      this.activeAdjusterType = null;
      this.isDragging = false;
      this.isResizing = false;
      this.isMarqueeSelecting = false;
      this.pointerDownReadyToDrag = false;
      this.callbacks.onSelectionChange?.(this.selectedIds);
      this.callbacks.onInteractionChange?.(null);
    }

    this.render();
  }

  /** Returns whether the workspace is currently in Preview Mode. */
  isPreviewMode(): boolean {
    return this.previewMode;
  }

  // ── Public API: Drawing Tools ───────────────────

  /** Sets the active drawing tool (box, text, or null to return to selection/idle mode). */
  setActiveTool(tool: CanvusTool): void {
    this.activeTool = tool;
    this.container.style.cursor = tool ? "crosshair" : "default";

    if (tool !== null) {
      this.deselectAll();
    }

    this.callbacks.onInteractionChange?.(tool ? `draw-${tool}` : null);
    this.render();
  }

  /** Returns the currently active drawing tool. */
  getActiveTool(): CanvusTool {
    return this.activeTool;
  }

  /** Customizes the HTML tag type for box or text drawing. */
  setDrawingTag(tag: string): void {
    const lower = tag.toLowerCase().trim();
    const textTags = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "a", "strong", "em", "li", "ul", "ol"];
    if (textTags.includes(lower)) {
      this.drawingTextTag = lower;
    } else {
      this.drawingTag = lower;
    }
  }

  /** Returns the active drawing tag based on the selected tool. */
  getDrawingTag(): string {
    return this.activeTool === "text" ? this.drawingTextTag : this.drawingTag;
  }

  // ── Public API: Clipboard Operations ────────────

  /** Deletes the currently selected node from the workspace. */
  deleteSelectedNode(): void {
    const topLevelIds = this.getTopLevelSelectedIds();
    if (topLevelIds.length === 0) return;

    this.mount.setTransitionsEnabled(false);

    const ops: any[] = [];
    const parentsToRemeasure = new Set<string>();

    for (const id of topLevelIds) {
      const node = this.tree.get(id);
      if (!node) continue;

      const parentId = node.parentId;
      const rawMarkup = node.rawMarkup;
      const rect = node.currentRect;

      const removed = this.removeNode(id);
      if (removed) {
        ops.push({
          type: "delete-node" as any,
          nodeId: id,
          payload: { parentId },
          undoPayload: { parentId, rawMarkup, rect }
        });
        if (parentId) {
          parentsToRemeasure.add(parentId);
        }
      }
    }

    if (ops.length > 0) {
      this.callbacks.onOperationsGenerated?.(ops);

      // Commit HTML for affected parent containers or root
      for (const parentId of parentsToRemeasure) {
        this.remeasureSubtree(parentId);
        const html = this.mount.extractHTML(parentId);
        if (html) {
          this.callbacks.onHTMLCommit?.(parentId, html);
        }
      }

      // If any deleted node was a root node, commit HTML for it
      for (const op of ops) {
        if (!op.payload.parentId) {
          this.callbacks.onHTMLCommit?.(op.nodeId, "");
        }
      }
      this.deselectAll();
    }

    this.mount.setTransitionsEnabled(true);
    this.render();
  }

  /** Duplicates the selected node right next to it as a sibling. */
  duplicateSelectedNode(): void {
    const topLevelIds = this.getTopLevelSelectedIds();
    if (topLevelIds.length === 0) return;

    this.mount.setTransitionsEnabled(false);

    const newSelectedIds: string[] = [];
    const ops: any[] = [];
    const parentsToCommit = new Set<string>();
    const rootsToCommit: string[] = [];

    for (const originalId of topLevelIds) {
      const originalNode = this.tree.get(originalId);
      if (!originalNode) continue;

      const rawMarkup = this.mount.extractHTML(originalId);
      if (!rawMarkup) continue;

      this.newElementCounter++;
      const duplicateId = `cloned-${this.newElementCounter}-${Date.now().toString(36)}`;
      const parentId = originalNode.parentId;

      let rect = originalNode.currentRect ? { ...originalNode.currentRect } : null;
      let index: number | undefined;

      if (parentId !== null) {
        index = this.tree.getChildIndex(originalId) + 1;
      } else if (rect) {
        rect.x += 20;
        rect.y += 20;
      }

      this.addNode({
        id: duplicateId,
        rawMarkup,
        currentRect: rect
      }, parentId, index);

      if (this.jsMarkedNodes.has(originalId)) {
        this.markNodeHasJS(duplicateId);
      }

      newSelectedIds.push(duplicateId);

      const finalIndex = parentId !== null ? this.tree.getChildIndex(duplicateId) : -1;
      ops.push({
        type: "create-node" as any,
        nodeId: duplicateId,
        payload: { parentId, index: finalIndex, rawMarkup, rect },
        undoPayload: { parentId }
      });

      if (parentId) {
        parentsToCommit.add(parentId);
      } else {
        rootsToCommit.push(duplicateId);
      }
    }

    if (ops.length > 0) {
      this.selectedIds.clear();
      for (const id of newSelectedIds) {
        this.selectedIds.add(id);
      }
      this.callbacks.onSelectionChange?.(this.selectedIds);
      this.updateBreadcrumb();

      this.callbacks.onOperationsGenerated?.(ops);

      for (const parentId of parentsToCommit) {
        const html = this.mount.extractHTML(parentId);
        if (html) {
          this.callbacks.onHTMLCommit?.(parentId, html);
        }
      }

      for (const rootId of rootsToCommit) {
        const html = this.mount.extractHTML(rootId);
        if (html) {
          this.callbacks.onHTMLCommit?.(rootId, html);
        }
      }
    }

    this.mount.setTransitionsEnabled(true);
    this.render();
  }

  /** Copies the selected node to the internal clipboard. */
  copySelectedNode(): void {
    const topLevelIds = this.getTopLevelSelectedIds();
    if (topLevelIds.length === 0) return;

    this.clipboardItems = [];
    for (const id of topLevelIds) {
      const node = this.tree.get(id);
      const markup = this.mount.extractHTML(id);
      if (node && markup) {
        this.clipboardItems.push({
          rawMarkup: markup,
          rect: node.currentRect ? { ...node.currentRect } : null,
          hasJS: this.jsMarkedNodes.has(id),
        });
      }
    }
  }

  /** Cuts the selected node to the clipboard, removing it from the canvas. */
  cutSelectedNode(): void {
    this.copySelectedNode();
    this.deleteSelectedNode();
  }

  /** Pastes the node currently in the clipboard into the canvas. */
  pasteNode(): void {
    if (this.clipboardItems.length === 0) return;

    this.mount.setTransitionsEnabled(false);

    const newSelectedIds: string[] = [];
    const ops: any[] = [];
    const parentsToCommit = new Set<string>();
    const rootsToCommit: string[] = [];

    const targets = this.selectedIds.size > 0 ? this.getTopLevelSelectedIds() : [];

    if (targets.length === 0) {
      // Paste all items at root level
      for (const item of this.clipboardItems) {
        this.newElementCounter++;
        const id = `pasted-${this.newElementCounter}-${Date.now().toString(36)}`;
        
        let rect: Rect;
        if (item.rect) {
          rect = {
            x: item.rect.x + 20,
            y: item.rect.y + 20,
            width: item.rect.width,
            height: item.rect.height,
          };
          item.rect = {
            x: item.rect.x + 20,
            y: item.rect.y + 20,
            width: item.rect.width,
            height: item.rect.height,
          };
        } else {
          rect = { x: 100, y: 100, width: 120, height: 120 };
        }

        this.addNode({
          id,
          rawMarkup: item.rawMarkup,
          currentRect: rect,
        }, null);

        if (item.hasJS) {
          this.markNodeHasJS(id);
        }
        newSelectedIds.push(id);

        ops.push({
          type: "create-node" as any,
          nodeId: id,
          payload: { parentId: null, index: undefined, rawMarkup: item.rawMarkup, rect },
          undoPayload: { parentId: null }
        });
        rootsToCommit.push(id);
      }
    } else {
      // Paste next to or inside each target
      for (const targetId of targets) {
        const targetNode = this.tree.get(targetId);
        if (!targetNode) continue;

        const isContainer = this.tree.isContainer(targetId);
        const parentId = isContainer ? targetId : targetNode.parentId;
        let startIndex = isContainer ? 0 : this.tree.getChildIndex(targetId) + 1;

        for (const item of this.clipboardItems) {
          this.newElementCounter++;
          const id = `pasted-${this.newElementCounter}-${Date.now().toString(36)}`;

          let rect: Rect;
          if (parentId === null) {
            if (item.rect) {
              rect = {
                x: item.rect.x + 20,
                y: item.rect.y + 20,
                width: item.rect.width,
                height: item.rect.height,
              };
              item.rect = {
                x: item.rect.x + 20,
                y: item.rect.y + 20,
                width: item.rect.width,
                height: item.rect.height,
              };
            } else {
              rect = { x: 100, y: 100, width: 120, height: 120 };
            }
          } else {
            if (item.rect) {
              rect = {
                x: 0,
                y: 0,
                width: item.rect.width,
                height: item.rect.height,
              };
            } else {
              rect = { x: 0, y: 0, width: 120, height: 120 };
            }
          }

          this.addNode({
            id,
            rawMarkup: item.rawMarkup,
            currentRect: rect,
          }, parentId, startIndex);

          if (parentId !== null) {
            startIndex++;
          }

          if (item.hasJS) {
            this.markNodeHasJS(id);
          }
          newSelectedIds.push(id);

          const finalIndex = parentId !== null ? this.tree.getChildIndex(id) : -1;
          ops.push({
            type: "create-node" as any,
            nodeId: id,
            payload: { parentId, index: finalIndex, rawMarkup: item.rawMarkup, rect },
            undoPayload: { parentId }
          });

          if (parentId) {
            parentsToCommit.add(parentId);
          } else {
            rootsToCommit.push(id);
          }
        }
      }
    }

    if (ops.length > 0) {
      this.selectedIds.clear();
      for (const id of newSelectedIds) {
        this.selectedIds.add(id);
      }
      this.callbacks.onSelectionChange?.(this.selectedIds);
      this.updateBreadcrumb();

      this.callbacks.onOperationsGenerated?.(ops);

      for (const parentId of parentsToCommit) {
        const html = this.mount.extractHTML(parentId);
        if (html) {
          this.callbacks.onHTMLCommit?.(parentId, html);
        }
      }

      for (const rootId of rootsToCommit) {
        const html = this.mount.extractHTML(rootId);
        if (html) {
          this.callbacks.onHTMLCommit?.(rootId, html);
        }
      }
    }

    this.mount.setTransitionsEnabled(true);
    this.render();
  }

  // ── Public API: State Forcing ───────────────────

  /** Forces a pseudo-class state (hover, active, focus) on the specified node element. */
  forceNodeState(nodeId: string, state: "hover" | "active" | "focus", enabled: boolean): void {
    if (enabled) {
      this.forcedStates[state].add(nodeId);
    } else {
      this.forcedStates[state].delete(nodeId);
    }
    this.setNodeStateClass(nodeId, state, enabled);
    this.render();
  }

  // ── Public API: JS Badge Marking ────────────────

  /**
   * Explicitly marks a node as containing JavaScript behavior.
   * Renders the ⚡️ JS badge on the canvas overlay when the node is selected.
   * The host application calls this based on its own analysis (static analysis,
   * CDP, source maps, etc.) rather than the SDK auto-detecting scripts.
   */
  markNodeHasJS(nodeId: string): void {
    this.jsMarkedNodes.add(nodeId);
    this.render();
  }

  /**
   * Clears the JS badge from a node.
   */
  unmarkNodeHasJS(nodeId: string): void {
    this.jsMarkedNodes.delete(nodeId);
    this.render();
  }

  /**
   * Returns whether a node is marked as containing JavaScript behavior.
   */
  hasJSMark(nodeId: string): boolean {
    return this.jsMarkedNodes.has(nodeId);
  }

  // ── Public API: Synthetic Interaction ───────────

  /** Dispatches a synthetic pointer/mouse event (e.g. mouseenter, mouseleave, click) to a node. */
  dispatchInteractionEvent(nodeId: string, eventName: string): void {
    const contentRoot = this.mount.getContentRoot(nodeId);
    if (!contentRoot) return;

    let event: Event;
    if (eventName === "click" || eventName === "dblclick" || eventName.startsWith("mouse") || eventName.startsWith("pointer")) {
      event = new MouseEvent(eventName, {
        bubbles: true,
        cancelable: true,
        view: window,
      });
    } else {
      event = new CustomEvent(eventName, {
        bubbles: true,
        cancelable: true,
      });
    }

    contentRoot.dispatchEvent(event);
  }

  // ── Public API: State Accessors ─────────────────

  /** Returns a snapshot of all tracked nodes (depth-first order). */
  getNodes(): ReadonlyArray<Readonly<ResolvedNode>> {
    return this.tree.flatten();
  }

  /** Returns the underlying ShadowMount for advanced access. */
  getShadowMount(): ShadowMount {
    return this.mount;
  }

  /** Returns the underlying OverlayRenderer for advanced access. */
  getOverlayRenderer(): OverlayRenderer {
    return this.renderer;
  }

  /**
   * Extracts the clean inner HTML of a node.
   * This is the **Flat String Bridge** — call it at any time
   * to read the current semantic HTML string.
   */
  extractHTML(id: string): string | null {
    return this.mount.extractHTML(id);
  }

  /**
   * Programmatically replays an Operation (mutation payload) onto the workspace.
   * This is the core API used for Undo/Redo replay and collaboration sync.
   */
  applyOperation(op: Operation): void {
    this.assertNotDisposed();

    if (op.type === "create-node" || op.type === "delete-node") {
      const payload = op.payload as any;
      if (payload && typeof payload.rawMarkup === "string") {
        const { parentId, index, rawMarkup, rect } = payload;
        this.addNode({ id: op.nodeId, rawMarkup, currentRect: rect }, parentId, index);
      } else {
        this.removeNode(op.nodeId);
        this.deselectAll();
      }
      this.render();
      return;
    }

    const node = this.tree.get(op.nodeId);
    if (!node) return;

    switch (op.type) {
      case "reparent": {
        const { newParentId, index } = op.payload;
        this.reparentNode(op.nodeId, newParentId, index);
        break;
      }
      case "reorder": {
        const { index } = op.payload;
        this.reorderChild(op.nodeId, index);
        break;
      }
      case "update-style": {
        const styles = op.payload;
        const contentRoot = this.mount.getContentRoot(op.nodeId);
        if (!contentRoot) break;

        const stylesToApply: Record<string, string | null> = {};

        for (const [prop, val] of Object.entries(styles)) {
          const value = val as string | null;

          // Check if it's wrapper geometric positioning styles for root elements
          if (node.parentId === null && (prop === "left" || prop === "top" || prop === "width" || prop === "height")) {
            if (prop === "left" || prop === "top") {
              const currentX = node.currentRect ? node.currentRect.x : 0;
              const currentY = node.currentRect ? node.currentRect.y : 0;
              const parsedVal = value ? parseFloat(value) : 0;
              const newX = prop === "left" ? parsedVal : currentX;
              const newY = prop === "top" ? parsedVal : currentY;
              this.mount.setNodePosition(op.nodeId, newX, newY);
            } else {
              const parsedVal = value ? (value === "auto" ? "auto" : parseFloat(value)) : "auto";
              const newW = prop === "width" ? parsedVal : null;
              const newH = prop === "height" ? parsedVal : null;
              this.mount.setNodeSize(op.nodeId, newW, newH);
            }
          } else {
            // Apply property directly to content root stylesheet
            stylesToApply[prop] = value;
          }
        }

        if (Object.keys(stylesToApply).length > 0) {
          this.mount.setNodeStyles(op.nodeId, stylesToApply);
        }

        this.remeasureSubtree(op.nodeId);
        if (node.parentId) {
          this.remeasureSubtree(node.parentId);
        }
        this.render();
        break;
      }
      case "update-classes": {
        const { add, remove } = op.payload;
        const contentRoot = this.mount.getContentRoot(op.nodeId);
        if (!contentRoot) break;

        if (Array.isArray(remove)) {
          for (const cls of remove) {
            contentRoot.classList.remove(cls);
          }
        }
        if (Array.isArray(add)) {
          for (const cls of add) {
            contentRoot.classList.add(cls);
          }
        }

        this.remeasureSubtree(op.nodeId);
        if (node.parentId) {
          this.remeasureSubtree(node.parentId);
        }
        this.render();
        break;
      }
      case "update-text": {
        const { path, html } = op.payload;
        const contentRoot = this.mount.getContentRoot(op.nodeId);
        if (!contentRoot) break;

        const targetEl = getDOMElementByPath(contentRoot, path);
        if (targetEl) {
          targetEl.innerHTML = html;
        }

        this.remeasureSubtree(op.nodeId);
        if (node.parentId) {
          this.remeasureSubtree(node.parentId);
        }
        this.render();
        break;
      }
    }
  }

  /** Adds a CSS class name directly to the content root of a node. */
  addClass(id: string, className: string): void {
    const node = this.tree.get(id);
    if (!node) return;

    const contentRoot = this.mount.getContentRoot(id);
    if (!contentRoot) return;

    if (contentRoot.classList.contains(className)) return;

    contentRoot.classList.add(className);

    this.remeasureSubtree(id);
    if (node.parentId) {
      this.remeasureSubtree(node.parentId);
    }
    this.render();

    const commitTarget = node.parentId ?? id;
    const html = this.mount.extractHTML(commitTarget);
    if (html) {
      this.callbacks.onHTMLCommit?.(commitTarget, html);
    }

    this.callbacks.onOperationsGenerated?.([{
      type: "update-classes",
      nodeId: id,
      payload: { add: [className], remove: [] },
      undoPayload: { add: [], remove: [className] }
    }]);
  }

  /** Removes a CSS class name directly from the content root of a node. */
  removeClass(id: string, className: string): void {
    const node = this.tree.get(id);
    if (!node) return;

    const contentRoot = this.mount.getContentRoot(id);
    if (!contentRoot) return;

    if (!contentRoot.classList.contains(className)) return;

    contentRoot.classList.remove(className);

    this.remeasureSubtree(id);
    if (node.parentId) {
      this.remeasureSubtree(node.parentId);
    }
    this.render();

    const commitTarget = node.parentId ?? id;
    const html = this.mount.extractHTML(commitTarget);
    if (html) {
      this.callbacks.onHTMLCommit?.(commitTarget, html);
    }

    this.callbacks.onOperationsGenerated?.([{
      type: "update-classes",
      nodeId: id,
      payload: { add: [], remove: [className] },
      undoPayload: { add: [className], remove: [] }
    }]);
  }

  /** Toggles a CSS class name directly on the content root of a node. */
  toggleClass(id: string, className: string): void {
    const node = this.tree.get(id);
    if (!node) return;

    const contentRoot = this.mount.getContentRoot(id);
    if (!contentRoot) return;

    const hasClass = contentRoot.classList.contains(className);
    if (hasClass) {
      this.removeClass(id, className);
    } else {
      this.addClass(id, className);
    }
  }

  /**
   * Forces a synchronous geometry measurement of all nodes
   * and updates the internal rect cache.
   */
  measureAll(): Map<string, Rect> {
    const rects = this.mount.measureAll();
    for (const [id, rect] of rects) {
      const node = this.tree.get(id);
      if (node) {
        node.currentRect = rect;
        const contentRoot = this.mount.getContentRoot(id);
        if (contentRoot) {
          node.layoutMode = detectLayout(contentRoot).mode;
        }
      }
    }
    this.render();
    return rects;
  }

  // ── Public API: Stylesheet Injection ────────────

  /** Injects a CSS string into the shadow root. */
  injectCSS(css: string): HTMLStyleElement {
    return this.mount.injectStylesheet(css);
  }

  /** Loads an external stylesheet into the shadow root. */
  injectCSSLink(href: string): Promise<HTMLLinkElement> {
    return this.mount.injectStylesheetLink(href);
  }

  // ── Disposal ────────────────────────────────────

  /** Tears down the workspace completely. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Remove event listeners.
    this.container.removeEventListener("wheel", this.onWheel);
    this.container.removeEventListener("pointerdown", this.onPointerDown);
    this.container.removeEventListener("pointermove", this.onPointerMove);
    this.container.removeEventListener("pointerup", this.onPointerUp);
    this.container.removeEventListener("dblclick", this.onDblClick);
    this.container.removeEventListener("dragstart", this.onDragStart);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onWindowResize);

    // Tear down subsystems.
    this.mount.dispose();
    this.canvas.remove();

    // Clear state.
    this.tree.clear();
    this.selectedIds.clear();
  }

  // ── Event Handlers ──────────────────────────────

  /** Cursor-anchored zoom on scroll wheel. */
  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.getContainerRect();
    this.viewport = applyWheelZoom(
      e.clientX, e.clientY, e.deltaY, this.viewport, rect,
    );
    this.mount.applyViewportTransform(this.viewport);
    this.callbacks.onViewportChange?.(this.viewport);
    this.render();
  }

  /** Interaction mode detection on pointer down. */
  private handlePointerDown(e: PointerEvent): void {
    const rect = this.getContainerRect();
    const canvasPos = screenToCanvas(
      e.clientX, e.clientY, this.viewport, rect,
    );
    console.log('DEBUG WORKSPACE DOWN: viewport scale:', this.viewport.scale, 'canvasPos:', canvasPos, 'clientX:', e.clientX, 'clientY:', e.clientY);

    if (this.previewMode) {
      if (this.spaceDown || e.button === 1) {
        if (e.button === 1) {
          e.preventDefault();
        }
        this.isPanning = true;
        this.container.classList.add("canvus-panning");
        this.safeSetPointerCapture(e.pointerId);
        this.callbacks.onInteractionChange?.("pan");
        return;
      }
      return;
    }

    this.pointerDownInsideSelection = null;

    // ── Drawing Tool Interception ─────────────────
    if (this.activeTool !== null && e.button === 0) {
      this.isDrawingNode = true;
      this.drawStartCanvas = canvasPos;
      this.drawCurrentCanvas = canvasPos;
      this.activeDropTarget = null;
      this.guides = [];
      this.safeSetPointerCapture(e.pointerId);
      this.callbacks.onInteractionChange?.("draw-node");
      this.render();
      return;
    }

    // ── Space + pointer = Pan ─────────────────────
    if (this.spaceDown || e.button === 1) {
      if (e.button === 1) {
        e.preventDefault();
      }
      this.isPanning = true;
      this.container.classList.add("canvus-panning");
      this.safeSetPointerCapture(e.pointerId);
      this.callbacks.onInteractionChange?.("pan");
      return;
    }

    // Calculate isDoubleClick early to prevent handles/adjusters from intercepting double-clicks on small/nested nodes
    const nodeList = this.getOrderedNodeList();
    const hitId = hitTestElements(canvasPos.x, canvasPos.y, nodeList);
    const targetEl = e.composedPath()[0] as HTMLElement | null;
    const now = Date.now();
    const isSameTarget = targetEl !== null && this.lastPointerDownTarget !== null &&
      (targetEl === this.lastPointerDownTarget || (this.lastPointerDownTarget as Node).contains(targetEl) || targetEl.contains(this.lastPointerDownTarget as Node));
    const isDoubleClick = (now - this.lastPointerDownTime < 350) && (
      hitId !== null && 
      this.lastPointerDownId !== null && 
      (hitId === this.lastPointerDownId || isSameTarget || this.tree.isAncestor(this.lastPointerDownId, hitId))
    );
    this.lastPointerDownTime = now;
    this.lastPointerDownId = hitId;
    this.lastPointerDownTarget = targetEl;

    // ── Handle hit-test (resize) ──────────────────
    if (!isDoubleClick && this.selectedIds.size === 1) {
      const selId = this.selectedIds.values().next().value as string;
      const selNode = this.tree.get(selId);
      if (selNode?.currentRect) {
        const localX = e.clientX - rect.x;
        const localY = e.clientY - rect.y;
        const anchor = this.renderer.hitTestHandle(
          localX, localY, selNode.currentRect, this.viewport,
        );
        if (anchor) {
          this.isResizing = true;
          this.activeAnchor = anchor;
          this.dragStartCanvas = canvasPos;
          this.resizeStartRect = { ...selNode.currentRect };

          const contentRoot = this.mount.getContentRoot(selId);
          if (contentRoot) {
            this.dragStartStyles = {
              "grid-column-start": contentRoot.style.gridColumnStart || null,
              "grid-column-end": contentRoot.style.gridColumnEnd || null,
              "grid-row-start": contentRoot.style.gridRowStart || null,
              "grid-row-end": contentRoot.style.gridRowEnd || null,
              "position": contentRoot.style.position || null,
              "left": contentRoot.style.left || null,
              "top": contentRoot.style.top || null,
              "width": contentRoot.style.width || null,
              "height": contentRoot.style.height || null,
            };
          }

          this.render();
          return;
        }
      }
    }

    // ── Corner Radius handles hit-test ────────────
    if (!isDoubleClick && this.selectedIds.size > 0) {
      const localX = e.clientX - rect.x;
      const localY = e.clientY - rect.y;
      let hitRadiusCorner: string | null = null;
      let targetNodeId: string | null = null;

      for (const selId of this.selectedIds) {
        const selNode = this.tree.get(selId);
        if (selNode && isContainerNode(selNode) && selNode.currentRect) {
          const hit = this.hitTestRadiusHandle(
            localX, localY, selNode.currentRect, this.viewport,
          );
          if (hit) {
            hitRadiusCorner = hit;
            targetNodeId = selId;
            break;
          }
        }
      }

      if (hitRadiusCorner && targetNodeId) {
        this.isAdjustingRadius = true;
        this.activeRadiusCorner = hitRadiusCorner;
        this.radiusTargetNodeId = targetNodeId;

        this.radiusStartValues.clear();
        for (const selId of this.selectedIds) {
          const selNode = this.tree.get(selId);
          if (selNode && isContainerNode(selNode)) {
            const contentRoot = this.mount.getContentRoot(selId);
            let initialRadiusStr = "0px";
            if (contentRoot) {
              initialRadiusStr = contentRoot.style.borderRadius || window.getComputedStyle(contentRoot).borderRadius || "0px";
            }
            this.radiusStartValues.set(selId, initialRadiusStr);
          }
        }


        this.dragStartCanvas = canvasPos;
        this.safeSetPointerCapture(e.pointerId);
        this.callbacks.onInteractionChange?.("resize-radius");
        this.render();
        return;
      }
    }

    // ── Spacing Adjusters hit-test ────────────────
    if (!isDoubleClick && this.selectedIds.size === 1) {
      const selId = this.selectedIds.values().next().value as string;
      const adjusters = this.computeSpacingAdjusters(selId);
      const hitAdjuster = adjusters.find(adj =>
        canvasPos.x >= adj.rect.x &&
        canvasPos.x <= adj.rect.x + adj.rect.width &&
        canvasPos.y >= adj.rect.y &&
        canvasPos.y <= adj.rect.y + adj.rect.height
      );



      if (hitAdjuster) {
        this.activeAdjusterType = hitAdjuster.type;
        this.adjusterStartValue = hitAdjuster.value;
        const contentRoot = this.mount.getContentRoot(selId);
        this.adjusterStartValueStr = contentRoot ? (contentRoot.style.getPropertyValue(hitAdjuster.type) || null) : null;
        this.dragStartCanvas = canvasPos;
        this.render();
        return;
      }
    }

    // ── Node hit-test (select + drag) ─────────────

    let targetSelectId: string | null = null;
    let clickInsideSelection = false;

    const hasModifier = e.shiftKey || e.metaKey || e.ctrlKey;

    if (this.selectedIds.size > 0 && !hasModifier && !isDoubleClick) {
      for (const selId of this.selectedIds) {
        const selNode = this.tree.get(selId);
        if (selNode?.currentRect && isPointInElement(canvasPos.x, canvasPos.y, selNode.currentRect)) {
          clickInsideSelection = true;
          targetSelectId = selId;
          this.pointerDownInsideSelection = selId;
          break;
        }
      }
    }



    if (!clickInsideSelection) {
      this.pointerDownInsideSelection = null;
      if (hitId) {
        const isCmdClick = e.metaKey || e.ctrlKey;

        if (isCmdClick) {
          // Cmd+Click: deep select the hit element directly
          targetSelectId = hitId;
          this.enteredContainerId = this.tree.get(hitId)?.parentId ?? null;
        } else if (isDoubleClick) {
          // Double click: Figma-like drill down
          const path = this.tree.getPath(hitId);
          let foundSelectedIdx = -1;
          for (let i = 0; i < path.length; i++) {
            if (this.selectedIds.has(path[i]!.id)) {
              foundSelectedIdx = i;
              break;
            }
          }
          if (foundSelectedIdx !== -1 && foundSelectedIdx < path.length - 1) {
            // Drill down one level
            const nextParent = path[foundSelectedIdx]!;
            const nextSelect = path[foundSelectedIdx + 1]!;
            this.enteredContainerId = nextParent.id;
            targetSelectId = nextSelect.id;
          } else if (foundSelectedIdx === path.length - 1) {
            // Leaf is already selected: keep selection on leaf to trigger text editing
            targetSelectId = path[path.length - 1]!.id;
            this.enteredContainerId = path[path.length - 2]?.id ?? null;
          } else {
            // Nothing in the path is selected
            if (path.length > 0) {
              targetSelectId = path[0]!.id;
              this.enteredContainerId = null;
            } else {
              targetSelectId = hitId;
            }
          }
        } else {
          // Single Click: resolve based on current entered scope
          const resolvedId = this.findSelectableNode(hitId, this.enteredContainerId);
          if (resolvedId) {
            targetSelectId = resolvedId;
            const node = this.tree.get(resolvedId);
            this.enteredContainerId = node?.parentId ?? null;
          } else {
            // Clicked outside currently entered container: exit scope, select root ancestor
            this.enteredContainerId = null;
            targetSelectId = this.findSelectableNode(hitId, null);
          }
        }
      }

      if (isDoubleClick && targetSelectId && this.selectedIds.has(targetSelectId)) {
        this.editAllowedOnDblClick = true;
      } else {
        this.editAllowedOnDblClick = false;
      }
    }

    if (targetSelectId) {
      if (!clickInsideSelection) {
        const prevSelection = new Set(this.selectedIds);
        const isShift = e.shiftKey;
        if (isShift) {
          if (this.selectedIds.has(targetSelectId)) {
            this.selectedIds.delete(targetSelectId);
          } else {
            this.selectedIds.add(targetSelectId);
          }
        } else {
          this.selectedIds.clear();
          this.selectedIds.add(targetSelectId);
        }
        this.syncLazyChildren(prevSelection, this.selectedIds);
        this.callbacks.onSelectionChange?.(this.selectedIds);
        this.updateBreadcrumb();
      }

      this.isDragging = false;
      this.pointerDownReadyToDrag = true;
      this.dragStartCanvas = canvasPos;

      this.dragStartNodes.clear();
      const topLevelIds = this.getTopLevelSelectedIds();
      for (const selId of topLevelIds) {
        const selNode = this.tree.get(selId);
        if (selNode && selNode.currentRect) {
          const contentRoot = this.mount.getContentRoot(selId);
          let startStyles: Record<string, string | null> | null = null;
          if (contentRoot) {
            startStyles = {
              "grid-column-start": contentRoot.style.gridColumnStart || null,
              "grid-column-end": contentRoot.style.gridColumnEnd || null,
              "grid-row-start": contentRoot.style.gridRowStart || null,
              "grid-row-end": contentRoot.style.gridRowEnd || null,
              "position": contentRoot.style.position || null,
              "left": contentRoot.style.left || null,
              "top": contentRoot.style.top || null,
              "width": contentRoot.style.width || null,
              "height": contentRoot.style.height || null,
            };
          }
          this.dragStartNodes.set(selId, {
            startPos: { x: selNode.currentRect.x, y: selNode.currentRect.y },
            startParentId: selNode.parentId,
            startIndex: this.tree.getChildIndex(selId),
            startStyles,
          });
        }
      }

      let primaryId = targetSelectId;
      if (!topLevelIds.includes(targetSelectId)) {
        const path = this.tree.getPath(targetSelectId);
        for (const node of path) {
          if (topLevelIds.includes(node.id)) {
            primaryId = node.id;
            break;
          }
        }
      }



      const contentRoot = this.mount.getContentRoot(primaryId);
      if (contentRoot) {
        this.dragStartStyles = {
          "grid-column-start": contentRoot.style.gridColumnStart || null,
          "grid-column-end": contentRoot.style.gridColumnEnd || null,
          "grid-row-start": contentRoot.style.gridRowStart || null,
          "grid-row-end": contentRoot.style.gridRowEnd || null,
          "position": contentRoot.style.position || null,
          "left": contentRoot.style.left || null,
          "top": contentRoot.style.top || null,
          "width": contentRoot.style.width || null,
          "height": contentRoot.style.height || null,
        };
      }
    } else {
      // Click on empty space — start marquee selection
      const isShift = e.shiftKey;
      if (!isShift) {
        const prevSelection = new Set(this.selectedIds);
        this.selectedIds.clear();
        this.enteredContainerId = null;
        this.guides = [];
        this.syncLazyChildren(prevSelection, this.selectedIds);
        this.callbacks.onSelectionChange?.(this.selectedIds);
        this.updateBreadcrumb();
      }

      this.preMarqueeSelectedIds = new Set(this.selectedIds);
      this.isMarqueeSelecting = true;
      this.marqueeStartCanvas = canvasPos;
      this.marqueeCurrentCanvas = canvasPos;
      this.safeSetPointerCapture(e.pointerId);
      this.callbacks.onInteractionChange?.("select-marquee");
    }

    this.render();
  }

  /**
   * The core **Synchronous Reflow Loop**.
   *
   * On each pointer move during an active gesture:
   *   1. Compute canvas-space delta.
   *   2. Style surgery (setNodeRect / setNodePosition).
   *   3. Browser reflows synchronously.
   *   4. measureNode() reads updated dimensions.
   *   5. Rect cache updated.
   *   6. Alignment guides computed.
   *   7. Overlay re-rendered.
   */
  private handlePointerMove(e: PointerEvent): void {
    const rect = this.getContainerRect();
    const canvasPos = screenToCanvas(
      e.clientX, e.clientY, this.viewport, rect,
    );
    this.lastCanvasPos = canvasPos;
    if (this.isDragging) {
      console.log('DEBUG WORKSPACE MOVE: viewport scale:', this.viewport.scale, 'canvasPos:', canvasPos, 'dragStartCanvas:', this.dragStartCanvas, 'clientX:', e.clientX, 'clientY:', e.clientY);
    }

    if (this.previewMode) {
      if (this.isPanning) {
        this.viewport = applyPan(
          e.movementX, e.movementY, this.viewport,
        );
        this.mount.applyViewportTransform(this.viewport);
        this.callbacks.onViewportChange?.(this.viewport);
        this.render();
      }
      return;
    }

    // ── Drawing Tool Dragging ─────────────────────
    if (this.isDrawingNode && this.drawStartCanvas) {
      this.drawCurrentCanvas = canvasPos;

      // Dynamically resolve target container and placement index to show guidelines preview
      this.activeDropTarget = findDropTarget(
        "__new_node__",
        canvasPos,
        this.tree,
        (id) => this.mount.getWrapper(id),
        (id) => this.mount.getContentRoot(id)
      );

      this.render();
      return;
    }

    // ── Corner Radius Adjusting ───────────────────
    if (this.isAdjustingRadius && this.dragStartCanvas && this.radiusTargetNodeId) {
      const targetNode = this.tree.get(this.radiusTargetNodeId);
      if (targetNode && targetNode.currentRect) {
        this.safeSetPointerCapture(e.pointerId);
        this.container.style.cursor = "pointer";
        this.canvas.style.pointerEvents = "auto";
        this.callbacks.onInteractionChange?.("resize-radius");

        const bounds = targetNode.currentRect;
        const s = this.viewport.scale;
        const ox = this.viewport.offsetX;
        const oy = this.viewport.offsetY;

        const left = bounds.x * s + ox;
        const top = bounds.y * s + oy;
        const right = (bounds.x + bounds.width) * s + ox;
        const bottom = (bounds.y + bounds.height) * s + oy;

        let dragX = 0;
        let dragY = 0;
        if (this.activeRadiusCorner === "tl") {
          dragX = e.clientX - rect.x - left;
          dragY = e.clientY - rect.y - top;
        } else if (this.activeRadiusCorner === "tr") {
          dragX = right - (e.clientX - rect.x);
          dragY = e.clientY - rect.y - top;
        } else if (this.activeRadiusCorner === "bl") {
          dragX = e.clientX - rect.x - left;
          dragY = bottom - (e.clientY - rect.y);
        } else if (this.activeRadiusCorner === "br") {
          dragX = right - (e.clientX - rect.x);
          dragY = bottom - (e.clientY - rect.y);
        }

        const dragDistScreen = (dragX + dragY) / 2;
        const dragDistCanvas = dragDistScreen / s;

        // Apply to all selected containers
        for (const selId of this.selectedIds) {
          const selNode = this.tree.get(selId);
          if (selNode && isContainerNode(selNode) && selNode.currentRect) {
            const maxRadius = Math.min(selNode.currentRect.width, selNode.currentRect.height) / 2;
            const newRadius = Math.max(0, Math.min(maxRadius, Math.round(dragDistCanvas)));
            this.mount.setNodeStyle(selId, "border-radius", `${newRadius}px`);
            this.remeasureSubtree(selId);
          }
        }
        this.render();
      }
      return;
    }

    // ── Spacing Adjusters Dragging ────────────────
    if (this.activeAdjusterType && this.dragStartCanvas) {
      const selId = this.selectedIds.values().next().value as string;
      const node = this.tree.get(selId);
      if (!node) return;

      this.safeSetPointerCapture(e.pointerId);
      this.canvas.style.pointerEvents = "auto";
      this.callbacks.onInteractionChange?.("adjust-spacing");

      const isVertical = this.activeAdjusterType.includes("top") || this.activeAdjusterType.includes("bottom");
      this.container.style.cursor = isVertical ? "ns-resize" : "ew-resize";
      this.canvas.style.pointerEvents = "auto";

      const dx = canvasPos.x - this.dragStartCanvas.x;
      const dy = canvasPos.y - this.dragStartCanvas.y;

      let delta = 0;
      switch (this.activeAdjusterType) {
        case "padding-top":
          delta = dy;
          break;
        case "padding-bottom":
          delta = dy;
          break;
        case "padding-left":
          delta = dx;
          break;
        case "padding-right":
          delta = -dx;
          break;
        case "margin-top":
          delta = -dy;
          break;
        case "margin-bottom":
          delta = dy;
          break;
        case "margin-left":
          delta = -dx;
          break;
        case "margin-right":
          delta = -dx;
          break;
      }

      const contentRoot = this.mount.getContentRoot(selId);
      const internalScale = contentRoot ? this.mount.getElementScale(contentRoot) : 1;
      const safeScale = internalScale && !isNaN(internalScale) ? internalScale : 1;

      const newValue = Math.max(0, Math.round(this.adjusterStartValue + delta / safeScale));

      // Style surgery - direct DOM mutation
      this.mount.setNodeStyle(selId, this.activeAdjusterType, `${newValue}px`);

      // Synchronous reflow + measurement
      this.remeasureSubtree(selId);
      if (node.parentId) {
        this.remeasureSubtree(node.parentId);
      }

      this.render();
      return;
    }

    // ── Marquee Selection ──────────────────────────
    if (this.isMarqueeSelecting && this.marqueeStartCanvas) {
      this.marqueeCurrentCanvas = canvasPos;
      const mRect = this.getMarqueeRect()!;

      // Find all selectable nodes inside or intersecting the marquee rect
      const selectableNodes = this.getOrderedNodeList();
      const currentMarqueeSelection = new Set<string>();

      for (const node of selectableNodes) {
        if (!node.currentRect) continue;

        const treeNode = this.tree.get(node.id);
        if (!treeNode) continue;

        // Scoping constraint
        if (this.enteredContainerId !== null) {
          if (treeNode.parentId !== this.enteredContainerId) continue;
        } else {
          if (treeNode.parentId !== null) continue;
        }

        if (rectsIntersect(node.currentRect, mRect)) {
          currentMarqueeSelection.add(node.id);
        }
      }

      this.selectedIds.clear();
      if (e.shiftKey) {
        for (const id of this.preMarqueeSelectedIds) {
          this.selectedIds.add(id);
        }
      }
      for (const id of currentMarqueeSelection) {
        this.selectedIds.add(id);
      }

      this.callbacks.onSelectionChange?.(this.selectedIds);
      this.updateBreadcrumb();
      this.render();
      return;
    }

    // ── Drag initiation ───────────────────────────
    if (this.pointerDownReadyToDrag && this.dragStartCanvas) {
      const dx = canvasPos.x - this.dragStartCanvas.x;
      const dy = canvasPos.y - this.dragStartCanvas.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= 3) {
        if (e.altKey && this.selectedIds.size > 0) {
          const topLevelIds = this.getTopLevelSelectedIds();
          
          this.mount.setTransitionsEnabled(false);

          const newSelectedIds: string[] = [];
          this.dragStartNodes.clear();

          for (const originalId of topLevelIds) {
            const originalNode = this.tree.get(originalId);
            if (originalNode && originalNode.currentRect) {
              const rawMarkup = this.mount.extractHTML(originalId);
              if (rawMarkup) {
                this.newElementCounter++;
                const duplicateId = `cloned-${this.newElementCounter}-${Date.now().toString(36)}`;
                const parentId = originalNode.parentId;
                const index = parentId !== null ? this.tree.getChildIndex(originalId) + 1 : undefined;

                this.addNode({
                  id: duplicateId,
                  rawMarkup,
                  currentRect: { ...originalNode.currentRect }
                }, parentId, index);

                if (this.jsMarkedNodes.has(originalId)) {
                  this.markNodeHasJS(duplicateId);
                }

                newSelectedIds.push(duplicateId);

                const duplicateContentRoot = this.mount.getContentRoot(duplicateId);
                let startStyles: Record<string, string | null> | null = null;
                if (duplicateContentRoot) {
                  startStyles = {
                    "grid-column-start": duplicateContentRoot.style.gridColumnStart || null,
                    "grid-column-end": duplicateContentRoot.style.gridColumnEnd || null,
                    "grid-row-start": duplicateContentRoot.style.gridRowStart || null,
                    "grid-row-end": duplicateContentRoot.style.gridRowEnd || null,
                    "position": duplicateContentRoot.style.position || null,
                    "left": duplicateContentRoot.style.left || null,
                    "top": duplicateContentRoot.style.top || null,
                    "width": duplicateContentRoot.style.width || null,
                    "height": duplicateContentRoot.style.height || null,
                  };
                }

                this.dragStartNodes.set(duplicateId, {
                  startPos: { x: originalNode.currentRect.x, y: originalNode.currentRect.y },
                  startParentId: parentId,
                  startIndex: parentId !== null ? this.tree.getChildIndex(duplicateId) : -1,
                  startStyles,
                });
              }
            }
          }

          if (newSelectedIds.length > 0) {
            this.selectedIds.clear();
            for (const id of newSelectedIds) {
              this.selectedIds.add(id);
            }
            this.callbacks.onSelectionChange?.(this.selectedIds);
            this.updateBreadcrumb();

            const primaryId = newSelectedIds[0] as string;

            const contentRoot = this.mount.getContentRoot(primaryId);
            if (contentRoot) {
              this.dragStartStyles = {
                "grid-column-start": contentRoot.style.gridColumnStart || null,
                "grid-column-end": contentRoot.style.gridColumnEnd || null,
                "grid-row-start": contentRoot.style.gridRowStart || null,
                "grid-row-end": contentRoot.style.gridRowEnd || null,
                "position": contentRoot.style.position || null,
                "left": contentRoot.style.left || null,
                "top": contentRoot.style.top || null,
                "width": contentRoot.style.width || null,
                "height": contentRoot.style.height || null,
              };
            }

            this.isDragCopy = true;
          }
        }

        this.isDragging = true;
        this.pointerDownReadyToDrag = false;
        this.callbacks.onInteractionChange?.("drag-node");
        this.safeSetPointerCapture(e.pointerId);
      }
    }

    // ── Hover tracking ────────────────────────────
    if (!this.isPanning && !this.isDragging && !this.isResizing && !this.isAdjustingRadius) {
      this.updateHover(e.metaKey || e.ctrlKey);

      // Handle hover cursor for multiple elements.
      let hoveredSelectedId: string | null = null;
      for (const selId of this.selectedIds) {
        const selNode = this.tree.get(selId);
        if (selNode?.currentRect && isPointInElement(canvasPos.x, canvasPos.y, selNode.currentRect)) {
          hoveredSelectedId = selId;
          break;
        }
      }

      if (hoveredSelectedId) {
        const selNode = this.tree.get(hoveredSelectedId)!;
        const localX = e.clientX - rect.x;
        const localY = e.clientY - rect.y;

        let hitRadiusCorner: string | null = null;
        if (isContainerNode(selNode) && selNode.currentRect) {
          hitRadiusCorner = this.hitTestRadiusHandle(
            localX, localY, selNode.currentRect, this.viewport
          );
        }

        if (hitRadiusCorner) {
          this.hoveredRadiusCorner = hitRadiusCorner;
          this.container.style.cursor = "pointer";
          this.hoveredAdjusterType = null;
        } else {
          this.hoveredRadiusCorner = null;
          const anchor = this.renderer.hitTestHandle(
            localX, localY, selNode.currentRect!, this.viewport,
          );
          if (anchor) {
            this.container.style.cursor = anchorCursor(anchor);
            this.hoveredAdjusterType = null;
          } else {
            // Spacing adjusters check
            const adjusters = this.computeSpacingAdjusters(hoveredSelectedId);
            const hoveredAdj = adjusters.find(adj =>
              canvasPos.x >= adj.rect.x &&
              canvasPos.x <= adj.rect.x + adj.rect.width &&
              canvasPos.y >= adj.rect.y &&
              canvasPos.y <= adj.rect.y + adj.rect.height
            );

            if (hoveredAdj) {
              this.hoveredAdjusterType = hoveredAdj.type;
              const isVertical = hoveredAdj.type.includes("top") || hoveredAdj.type.includes("bottom");
              this.container.style.cursor = isVertical ? "ns-resize" : "ew-resize";
            } else {
              this.hoveredAdjusterType = null;
              this.container.style.cursor = "default";
            }
          }
        }
      } else {
        this.hoveredRadiusCorner = null;
        this.hoveredAdjusterType = null;
        this.container.style.cursor = "default";
      }

      this.render();
      return;
    }

    // ── Pan ────────────────────────────────────────
    if (this.isPanning) {
      this.viewport = applyPan(
        e.movementX, e.movementY, this.viewport,
      );
      this.mount.applyViewportTransform(this.viewport);
      this.callbacks.onViewportChange?.(this.viewport);
      this.render();
      return;
    }

    // ── Resize (Synchronous Reflow Loop) ──────────
    if (this.isResizing && this.activeAnchor && this.dragStartCanvas && this.resizeStartRect) {
      const selId = this.selectedIds.values().next().value as string;
      const node = this.tree.get(selId);
      if (!node) return;

      this.safeSetPointerCapture(e.pointerId);
      this.container.style.cursor = anchorCursor(this.activeAnchor);
      this.canvas.style.pointerEvents = "auto";
      this.callbacks.onInteractionChange?.("resize-node");

      const dx = canvasPos.x - this.dragStartCanvas.x;
      const dy = canvasPos.y - this.dragStartCanvas.y;

      const wrapper = this.mount.getWrapper(selId);
      let parentIsGrid = false;
      let gridInfo: any = null;
      let parentRect: Rect | null = null;
      let padLeft = 0;
      let padTop = 0;

      if (node.parentId !== null) {
        const parentContent = this.mount.getContentRoot(node.parentId);
        if (parentContent) {
          gridInfo = detectLayout(parentContent);
          if (gridInfo.mode === "grid" || gridInfo.mode === "inline-grid") {
            parentIsGrid = true;
            const parentNode = this.tree.get(node.parentId);
            parentRect = parentNode?.currentRect ?? null;
            const cs = getComputedStyle(parentContent);
            padLeft = parseFloat(cs.paddingLeft) || 0;
            padTop = parseFloat(cs.paddingTop) || 0;
          }
        }
      }

      if (parentIsGrid && gridInfo && parentRect && wrapper) {
        const colTracks = parseGridTracks(gridInfo.gridTemplateColumns || "", gridInfo.gap.column);
        const rowTracks = parseGridTracks(gridInfo.gridTemplateRows || "", gridInfo.gap.row);

        const contentRoot = this.mount.getContentRoot(selId);
        if (contentRoot) {
          const colStart = getGridStart(contentRoot, "column");
          const rowStart = getGridStart(contentRoot, "row");
          const colSpan = getGridSpan(contentRoot, "column");
          const rowSpan = getGridSpan(contentRoot, "row");

          const cx = canvasPos.x - parentRect.x - padLeft;
          const cy = canvasPos.y - parentRect.y - padTop;

          let newColStart = colStart;
          let newColSpan = colSpan;
          let newRowStart = rowStart;
          let newRowSpan = rowSpan;

          console.log('DEBUG WORKSPACE RESIZE GRID templateRows:', gridInfo.gridTemplateRows, 'templateCols:', gridInfo.gridTemplateColumns);
          console.log('DEBUG WORKSPACE RESIZE GRID: colTracks:', JSON.stringify(colTracks), 'rowTracks:', JSON.stringify(rowTracks), 'colStart:', colStart, 'colSpan:', colSpan, 'rowStart:', rowStart, 'rowSpan:', rowSpan, 'cx:', cx, 'cy:', cy);

          const anchor = this.activeAnchor;

          // West / East column resizing
          if (anchor.includes("w")) {
            const colEndIndex = colStart + colSpan;
            for (let i = 0; i < colTracks.length; i++) {
              const c = colTracks[i]!;
              if (cx <= c.start + c.size + gridInfo.gap.column / 2) {
                newColStart = Math.min(i + 1, colEndIndex - 1);
                newColSpan = colEndIndex - newColStart;
                break;
              }
            }
          } else if (anchor.includes("e")) {
            for (let i = 0; i < colTracks.length; i++) {
              const c = colTracks[i]!;
              if (cx <= c.start + c.size + gridInfo.gap.column / 2) {
                newColSpan = Math.max(1, (i + 1) - colStart + 1);
                break;
              }
              newColSpan = Math.max(1, (i + 1) - colStart + 1);
            }
          }

          // North / South row resizing
          if (anchor.includes("n")) {
            const rowEndIndex = rowStart + rowSpan;
            for (let i = 0; i < rowTracks.length; i++) {
              const r = rowTracks[i]!;
              if (cy <= r.start + r.size + gridInfo.gap.row / 2) {
                newRowStart = Math.min(i + 1, rowEndIndex - 1);
                newRowSpan = rowEndIndex - newRowStart;
                break;
              }
            }
          } else if (anchor.includes("s")) {
            for (let i = 0; i < rowTracks.length; i++) {
              const r = rowTracks[i]!;
              if (cy <= r.start + r.size + gridInfo.gap.row / 2) {
                newRowSpan = Math.max(1, (i + 1) - rowStart + 1);
                break;
              }
              newRowSpan = Math.max(1, (i + 1) - rowStart + 1);
            }
          }

          console.log('DEBUG WORKSPACE RESIZE GRID result:', 'colStart:', newColStart, 'colSpan:', newColSpan, 'rowStart:', newRowStart, 'rowSpan:', newRowSpan);

          this.mount.setNodeStyles(selId, {
            "grid-column-start": `${newColStart}`,
            "grid-column-end": `span ${newColSpan}`,
            "grid-row-start": `${newRowStart}`,
            "grid-row-end": `span ${newRowSpan}`,
          });

          this.remeasureSubtree(selId);
          if (node.parentId) {
            this.remeasureSubtree(node.parentId);
          }
        }
      } else {
        // 1. Compute new rect from anchor delta.
        const newRect = computeResizedRect(
          this.resizeStartRect, this.activeAnchor, dx, dy, this.minResizeSize, e.altKey,
        );

        // 2. Style surgery — direct DOM mutation.
        this.mount.setNodeRect(selId, newRect);

        // 3. Synchronous reflow + measurement.
        //    Reading dimensions forces the browser to reflow NOW.
        this.remeasureSubtree(selId);
      }

      // 4. Compute alignment guides.
      if (this.enableSnapGuides && node.currentRect) {
        const otherRects = this.getOtherRects(selId);
        this.guides = computeAlignmentGuides(
          node.currentRect, otherRects, this.snapThreshold,
        );
      }

      // 5. Notify.
      if (node.currentRect) {
        this.callbacks.onNodeRectChange?.(selId, node.currentRect);
      }

      // 6. Render overlay.
      this.container.style.cursor = anchorCursor(this.activeAnchor);
      this.canvas.style.pointerEvents = "auto";
      this.render();
      return;
    }

    // ── Drag (Synchronous Reflow Loop) ────────────
    if (this.isDragging && this.dragStartCanvas && this.dragStartNodes.size > 0) {
      const topLevelIds = this.getTopLevelSelectedIds();
      const primaryId = this.dragStartNodes.keys().next().value as string;
      const primaryStart = this.dragStartNodes.get(primaryId)!;

      const dx = canvasPos.x - this.dragStartCanvas.x;
      const dy = canvasPos.y - this.dragStartCanvas.y;

      let snapDx = dx;
      let snapDy = dy;

      if (primaryStart.startParentId === null) {
        // Absolute Root dragging
        let newX = primaryStart.startPos.x + dx;
        let newY = primaryStart.startPos.y + dy;

        // Snap-to-align
        if (this.enableSnapGuides) {
          const primaryNode = this.tree.get(primaryId);
          if (primaryNode && primaryNode.currentRect) {
            const candidateRect: Rect = {
              x: newX, y: newY,
              width: primaryNode.currentRect.width,
              height: primaryNode.currentRect.height,
            };
            const otherRects = this.getOtherRectsMultiple(topLevelIds);
            const snapped = computeSnappedPosition(
              candidateRect, otherRects, this.snapThreshold,
            );
            snapDx = snapped.x - primaryStart.startPos.x;
            snapDy = snapped.y - primaryStart.startPos.y;

            const snappedRect: Rect = {
              x: snapped.x, y: snapped.y,
              width: primaryNode.currentRect.width,
              height: primaryNode.currentRect.height,
            };
            this.guides = computeAlignmentGuides(
              snappedRect, otherRects, this.snapThreshold,
            );
          }
        }

        // Apply translations on all dragged nodes
        for (const [id, start] of this.dragStartNodes.entries()) {
          if (start.startParentId === null) {
            this.mount.setNodePosition(id, start.startPos.x + snapDx, start.startPos.y + snapDy);
            this.remeasureSubtree(id);
          } else {
            const wrapper = this.mount.getWrapper(id);
            if (wrapper) {
              wrapper.style.transform = `translate3d(${snapDx}px, ${snapDy}px, 0)`;
            }
            const node = this.tree.get(id);
            if (node && node.currentRect) {
              node.currentRect = {
                x: start.startPos.x + snapDx,
                y: start.startPos.y + snapDy,
                width: node.currentRect.width,
                height: node.currentRect.height,
              };
            }
          }
        }
      } else {
        // Flow child dragging (visual translation)
        for (const [id, start] of this.dragStartNodes.entries()) {
          const wrapper = this.mount.getWrapper(id);
          if (wrapper) {
            wrapper.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
          }
          const node = this.tree.get(id);
          if (node && node.currentRect) {
            node.currentRect = {
              x: start.startPos.x + dx,
              y: start.startPos.y + dy,
              width: node.currentRect.width,
              height: node.currentRect.height,
            };
          }
        }
      }

      // Detect active drop target container & flow position based on the primary node / canvasPos
      this.activeDropTarget = findDropTarget(
        primaryId,
        canvasPos,
        this.tree,
        (id) => this.mount.getWrapper(id),
        (id) => this.mount.getContentRoot(id)
      );

      // Notify node rect changes
      for (const id of this.selectedIds) {
        const node = this.tree.get(id);
        if (node?.currentRect) {
          this.callbacks.onNodeRectChange?.(id, node.currentRect);
        }
      }

      this.render();
    }
  }

  /**
   * Gesture completion.
   *
   * **Flat String Bridge**: on mouseup after a mutating gesture,
   * extracts the clean HTML and fires `onHTMLCommit`.
   */
  private handlePointerUp(e: PointerEvent): void {
    if (this.isDragging) {
      console.log('DEBUG WORKSPACE UP: viewport scale:', this.viewport.scale, 'dragStartNodes:', Array.from(this.dragStartNodes.entries()).map(([id, s]) => ({ id, startPos: s.startPos, startParentId: s.startParentId })), 'clientX:', e.clientX, 'clientY:', e.clientY);
    }
    if (this.previewMode) {
      if (this.isPanning) {
        this.isPanning = false;
        this.container.classList.remove("canvus-panning");
      }
      return;
    }

    // ── Drawing Tool Completion ──────────────────
    if (this.isDrawingNode && this.drawStartCanvas && this.drawCurrentCanvas) {
      this.isDrawingNode = false;
      const start = this.drawStartCanvas;
      const end = this.drawCurrentCanvas;
      this.drawStartCanvas = null;
      this.drawCurrentCanvas = null;

      try {
        this.container.releasePointerCapture(e.pointerId);
      } catch {}

      // Calculate drawn dimensions
      let x = Math.min(start.x, end.x);
      let y = Math.min(start.y, end.y);
      let width = Math.abs(start.x - end.x);
      let height = Math.abs(start.y - end.y);

      // Apply defaults if users did a simple click-to-draw instead of drag-to-draw
      if (width < 8 && height < 8) {
        if (this.activeTool === "box") {
          width = 120;
          height = 120;
        } else {
          width = 180;
          height = 40; // Let text height be auto/placeholder size
        }
      }

      const parentTarget = this.activeDropTarget;
      this.activeDropTarget = null;

      // Determine final placement
      let parentId = parentTarget?.parentId ?? null;
      let index = parentTarget?.insertionIndex;

      this.newElementCounter++;
      const id = `${this.activeTool || "node"}-${this.newElementCounter}-${Date.now().toString(36)}`;

      let rawMarkup = "";
      if (this.activeTool === "box") {
        const tag = this.drawingTag;
        rawMarkup = `<${tag} style="background:rgba(99, 102, 241, 0.05);border:1.5px dashed #6366f1;border-radius:8px;box-sizing:border-box;width:100%;height:100%;min-width:40px;min-height:40px;"></${tag}>`;
      } else {
        const tag = this.drawingTextTag;
        let fontSize = "16px";
        let fontWeight = "400";
        if (tag.match(/^h[1-6]$/)) {
          fontWeight = "700";
          if (tag === "h1") fontSize = "28px";
          else if (tag === "h2") fontSize = "24px";
          else if (tag === "h3") fontSize = "20px";
          else fontSize = "18px";
        }
        rawMarkup = `<${tag} style="margin:0;font-family:sans-serif;font-size:${fontSize};font-weight:${fontWeight};color:#e8e8f0;line-height:1.5;outline:none;min-width:100px;">Double-click to edit text</${tag}>`;
      }

      let rect: Rect = { x, y, width, height };

      // Temporary disable transitions during mount
      this.mount.setTransitionsEnabled(false);

      // Perform addition
      if (parentId !== null && parentTarget?.gridPlacement) {
        const gp = parentTarget.gridPlacement;
        // Construct grid position styles directly
        const gridStyles = {
          "grid-column-start": `${gp.colStart}`,
          "grid-column-end": `span ${gp.colSpan}`,
          "grid-row-start": `${gp.rowStart}`,
          "grid-row-end": `span ${gp.rowSpan}`,
        };

        this.addNode({ id, rawMarkup, currentRect: gp.rect }, parentId, 0);
        this.setNodeStyles(id, gridStyles);
        rect = gp.rect;
      } else {
        this.addNode({ id, rawMarkup, currentRect: rect }, parentId, index);
      }

      this.selectNode(id);

      // Operations
      this.callbacks.onOperationsGenerated?.([{
        type: "create-node" as any,
        nodeId: id,
        payload: { parentId, index, rawMarkup, rect },
        undoPayload: { parentId }
      }]);

      // HTML commit
      const commitTarget = parentId ?? id;
      const html = this.mount.extractHTML(commitTarget);
      if (html) {
        this.callbacks.onHTMLCommit?.(commitTarget, html);
      }

      // Clear active tool (resets back to selection/idle mode)
      this.setActiveTool(null);
      this.mount.setTransitionsEnabled(true);

      this.render();
      return;
    }

    // Identify the node that was being manipulated.
    let commitId: string | null = null;
    const operations: Operation[] = [];

    if (this.isDragging || this.isResizing || this.isAdjustingRadius) {
      if (this.selectedIds.size === 1) {
        commitId = this.selectedIds.values().next().value as string;
      }
    }

    if (this.activeAdjusterType) {
      if (this.selectedIds.size === 1) {
        const selId = this.selectedIds.values().next().value as string;
        const contentRoot = this.mount.getContentRoot(selId);
        if (contentRoot && this.activeAdjusterType) {
          const finalValueStr = contentRoot.style.getPropertyValue(this.activeAdjusterType) || null;
          if (finalValueStr !== this.adjusterStartValueStr) {
            operations.push({
              type: "update-style",
              nodeId: selId,
              payload: { [this.activeAdjusterType]: finalValueStr },
              undoPayload: { [this.activeAdjusterType]: this.adjusterStartValueStr }
            });
          }
        }
        const node = this.tree.get(selId);
        commitId = (node && node.parentId !== null) ? node.parentId : selId;
      }
      this.activeAdjusterType = null;
      this.dragStartCanvas = null;
      this.container.style.cursor = "default";
      this.adjusterStartValueStr = null;
    }

    if (this.isAdjustingRadius) {
      const parentsToCommit = new Set<string>();
      for (const selId of this.selectedIds) {
        const selNode = this.tree.get(selId);
        if (selNode && isContainerNode(selNode)) {
          const contentRoot = this.mount.getContentRoot(selId);
          if (contentRoot) {
            const finalRadiusStr = contentRoot.style.borderRadius || "";
            const initialRadiusStr = this.radiusStartValues.get(selId) || "0px";
            if (finalRadiusStr !== initialRadiusStr) {
              operations.push({
                type: "update-style",
                nodeId: selId,
                payload: { "border-radius": finalRadiusStr },
                undoPayload: { "border-radius": initialRadiusStr }
              });
              if (selNode.parentId) {
                parentsToCommit.add(selNode.parentId);
              } else {
                parentsToCommit.add(selId);
              }
            }
          }
        }
      }

      for (const commitId of parentsToCommit) {
        const html = this.mount.extractHTML(commitId);
        if (html) {
          this.callbacks.onHTMLCommit?.(commitId, html);
        }
      }

      this.isAdjustingRadius = false;
      this.activeRadiusCorner = null;
      this.radiusTargetNodeId = null;
      this.radiusStartValues.clear();
      this.dragStartCanvas = null;
      this.container.style.cursor = "default";
    }

    if (this.isMarqueeSelecting) {
      this.isMarqueeSelecting = false;
      this.marqueeStartCanvas = null;
      this.marqueeCurrentCanvas = null;
      this.preMarqueeSelectedIds.clear();
    }

    // Reset interaction state.
    if (this.isPanning) {
      this.isPanning = false;
      this.container.classList.remove("canvus-panning");
    }

    if (this.isDragging) {
      this.isDragging = false;
      this.dragStartCanvas = null;

      this.mount.setTransitionsEnabled(false);

      if (this.dragStartNodes.size > 0) {
        if (this.isDragCopy) {
          this.isDragCopy = false;
          const parentsToCommit = new Set<string>();
          const rootsToCommit: string[] = [];

          for (const clonedId of this.dragStartNodes.keys()) {
            const node = this.tree.get(clonedId);
            if (!node || !node.currentRect) continue;

            const wrapper = this.mount.getWrapper(clonedId);
            if (wrapper) {
              wrapper.style.transform = "";
            }

            const rawMarkup = this.mount.extractHTML(clonedId) || "";
            let rect = { ...node.currentRect };

            if (this.activeDropTarget) {
              const { parentId, gridPlacement } = this.activeDropTarget;
              if (gridPlacement) {
                const gridStyles = {
                  "grid-column-start": `${gridPlacement.colStart}`,
                  "grid-column-end": `span ${gridPlacement.colSpan}`,
                  "grid-row-start": `${gridPlacement.rowStart}`,
                  "grid-row-end": `span ${gridPlacement.rowSpan}`,
                };
                this.setNodeStyles(clonedId, gridStyles);
                rect = gridPlacement.rect;
              }

              const insertionIndex = this.activeDropTarget.insertionIndex;
              if (node.parentId !== parentId) {
                this.reparentNode(clonedId, parentId, insertionIndex !== undefined ? insertionIndex : 0);
              }

              operations.push({
                type: "create-node" as any,
                nodeId: clonedId,
                payload: { parentId, index: this.tree.getChildIndex(clonedId), rawMarkup, rect },
                undoPayload: { parentId }
              });

              if (parentId) {
                parentsToCommit.add(parentId);
              }
            } else {
              if (node.parentId !== null) {
                this.reparentNode(clonedId, null);
                this.mount.setNodePosition(clonedId, rect.x, rect.y);
              }

              operations.push({
                type: "create-node" as any,
                nodeId: clonedId,
                payload: { parentId: null, index: -1, rawMarkup, rect },
                undoPayload: { parentId: null }
              });

              rootsToCommit.push(clonedId);
            }
          }

          this.activeDropTarget = null;
          this.dragStartNodes.clear();
          this.dragStartStyles = null;
          this.mount.setTransitionsEnabled(true);

          if (operations.length > 0) {
            this.callbacks.onOperationsGenerated?.(operations);
          }

          for (const id of this.selectedIds) {
            this.remeasureSubtree(id);
            const node = this.tree.get(id);
            if (node?.currentRect) {
              this.callbacks.onNodeRectChange?.(id, node.currentRect);
            }
          }

          for (const parentId of parentsToCommit) {
            const html = this.mount.extractHTML(parentId);
            if (html) {
              this.callbacks.onHTMLCommit?.(parentId, html);
            }
          }

          for (const rootId of rootsToCommit) {
            const html = this.mount.extractHTML(rootId);
            if (html) {
              this.callbacks.onHTMLCommit?.(rootId, html);
            }
          }

          this.canvas.style.pointerEvents = "none";
          this.callbacks.onInteractionChange?.(null);
          this.render();
          return;
        }

        if (this.activeDropTarget) {
          const { parentId, insertionIndex, gridPlacement } = this.activeDropTarget;
          let currentInsertion = insertionIndex !== undefined ? insertionIndex : 0;

          for (const [id, start] of this.dragStartNodes.entries()) {
            const node = this.tree.get(id);
            if (!node) continue;

            const oldParentId = start.startParentId;
            const oldIndex = start.startIndex;

            const wrapper = this.mount.getWrapper(id);
            if (wrapper) {
              wrapper.style.transform = "";
            }

            if (gridPlacement) {
              const payloadStyles = {
                "grid-column-start": `${gridPlacement.colStart}`,
                "grid-column-end": `span ${gridPlacement.colSpan}`,
                "grid-row-start": `${gridPlacement.rowStart}`,
                "grid-row-end": `span ${gridPlacement.rowSpan}`,
                "position": null, "left": null, "top": null, "width": null, "height": null,
              };
              this.mount.setNodeStyles(id, payloadStyles);

              const undoPayloadStyles: Record<string, string | null> = {};
              for (const prop of Object.keys(payloadStyles)) {
                undoPayloadStyles[prop] = (start.startStyles && start.startStyles[prop] !== undefined) ? start.startStyles[prop] : null;
              }

              operations.push({
                type: "update-style",
                nodeId: id,
                payload: payloadStyles,
                undoPayload: undoPayloadStyles
              });

              if (parentId !== node.parentId) {
                this.reparentNode(id, parentId, 0);
                operations.push({
                  type: "reparent",
                  nodeId: id,
                  payload: { newParentId: parentId, index: 0 },
                  undoPayload: { newParentId: oldParentId, index: oldIndex }
                });
              } else {
                this.remeasureSubtree(parentId);
                const html = this.mount.extractHTML(parentId);
                if (html) {
                  this.callbacks.onHTMLCommit?.(parentId, html);
                }
              }
            } else {
              let styleChanged = false;
              const payloadStyles: any = {};
              const undoPayloadStyles: any = {};
              for (const prop of ["grid-column-start", "grid-column-end", "grid-row-start", "grid-row-end"]) {
                const orig = start.startStyles ? start.startStyles[prop] : null;
                if (orig !== null) {
                  payloadStyles[prop] = null;
                  undoPayloadStyles[prop] = orig;
                  styleChanged = true;
                }
              }
              if (styleChanged) {
                this.mount.setNodeStyles(id, payloadStyles);
                operations.push({
                  type: "update-style",
                  nodeId: id,
                  payload: payloadStyles,
                  undoPayload: undoPayloadStyles
                });
              }

              if (parentId === node.parentId) {
                this.reorderChild(id, currentInsertion);
                const newIndex = this.tree.getChildIndex(id);
                if (newIndex !== oldIndex) {
                  operations.push({
                    type: "reorder",
                    nodeId: id,
                    payload: { index: newIndex },
                    undoPayload: { index: oldIndex }
                  });
                }
                currentInsertion = newIndex + 1;
              } else {
                this.reparentNode(id, parentId, currentInsertion);
                const newIndex = this.tree.getChildIndex(id);
                operations.push({
                  type: "reparent",
                  nodeId: id,
                  payload: { newParentId: parentId, index: newIndex },
                  undoPayload: { newParentId: oldParentId, index: oldIndex }
                });
                currentInsertion = newIndex + 1;
              }
            }
          }
        } else {
          for (const [id, start] of this.dragStartNodes.entries()) {
            const node = this.tree.get(id);
            if (!node) continue;

            const oldParentId = start.startParentId;
            const oldIndex = start.startIndex;
            const oldPos = start.startPos;

            const wrapper = this.mount.getWrapper(id);
            if (wrapper) {
              wrapper.style.transform = "";
            }

            if (node.parentId !== null) {
              this.reparentNode(id, null);
              if (node.currentRect) {
                this.mount.setNodePosition(id, node.currentRect.x, node.currentRect.y);
                this.remeasureSubtree(id);
              }
              operations.push({
                type: "reparent",
                nodeId: id,
                payload: { newParentId: null, index: -1 },
                undoPayload: { newParentId: oldParentId, index: oldIndex }
              });

              let styleChanged = false;
              const payloadStyles: any = {};
              const undoPayloadStyles: any = {};
              for (const prop of ["grid-column-start", "grid-column-end", "grid-row-start", "grid-row-end"]) {
                const orig = start.startStyles ? start.startStyles[prop] : null;
                if (orig !== null) {
                  payloadStyles[prop] = null;
                  undoPayloadStyles[prop] = orig;
                  styleChanged = true;
                }
              }
              if (styleChanged) {
                this.mount.setNodeStyles(id, payloadStyles);
                operations.push({
                  type: "update-style",
                  nodeId: id,
                  payload: payloadStyles,
                  undoPayload: undoPayloadStyles
                });
              }
            } else if (oldParentId === null && oldPos) {
              const newX = node.currentRect ? node.currentRect.x : oldPos.x;
              const newY = node.currentRect ? node.currentRect.y : oldPos.y;
              if (newX !== oldPos.x || newY !== oldPos.y) {
                operations.push({
                  type: "update-style",
                  nodeId: id,
                  payload: { left: `${newX}px`, top: `${newY}px` },
                  undoPayload: { left: `${oldPos.x}px`, top: `${oldPos.y}px` }
                });
              }
            }
          }
        }
      }

      this.activeDropTarget = null;
      this.dragStartStyles = null;
      this.dragStartNodes.clear();

      for (const id of this.selectedIds) {
        this.remeasureSubtree(id);
        const node = this.tree.get(id);
        if (node?.currentRect) {
          this.callbacks.onNodeRectChange?.(id, node.currentRect);
        }
      }

      this.mount.setTransitionsEnabled(true);
    }

    this.pointerDownReadyToDrag = false;

    if (this.isResizing) {
      this.isResizing = false;
      this.activeAnchor = null;
      this.dragStartCanvas = null;

      if (commitId && this.resizeStartRect) {
        const node = this.tree.get(commitId);
        if (node?.currentRect) {
          let parentIsGrid = false;
          if (node.parentId !== null) {
            const parentContent = this.mount.getContentRoot(node.parentId);
            if (parentContent) {
              const info = detectLayout(parentContent);
              parentIsGrid = info.mode === "grid" || info.mode === "inline-grid";
            }
          }

          if (parentIsGrid) {
            const contentRoot = this.mount.getContentRoot(commitId);
            if (contentRoot && this.dragStartStyles) {
              const payload: any = {};
              const undoPayload: any = {};
              let styleChanged = false;

              const styleProps = [
                "grid-column-start",
                "grid-column-end",
                "grid-row-start",
                "grid-row-end",
              ];

              for (const prop of styleProps) {
                const val = contentRoot.style.getPropertyValue(prop) || null;
                const origVal = this.dragStartStyles[prop] || null;
                if (val !== origVal) {
                  payload[prop] = val;
                  undoPayload[prop] = origVal;
                  styleChanged = true;
                }
              }

              if (styleChanged) {
                operations.push({
                  type: "update-style",
                  nodeId: commitId,
                  payload,
                  undoPayload
                });
              }
            }
          } else {
            const finalRect = node.currentRect;
            const startRect = this.resizeStartRect;
            if (finalRect.width !== startRect.width || finalRect.height !== startRect.height ||
                finalRect.x !== startRect.x || finalRect.y !== startRect.y) {
              
              const payload: any = {
                width: `${finalRect.width}px`,
                height: `${finalRect.height}px`
              };
              const undoPayload: any = {
                width: `${startRect.width}px`,
                height: `${startRect.height}px`
              };

              if (node.parentId === null) {
                payload.left = `${finalRect.x}px`;
                payload.top = `${finalRect.y}px`;
                undoPayload.left = `${startRect.x}px`;
                undoPayload.top = `${startRect.y}px`;
              }

              operations.push({
                type: "update-style",
                nodeId: commitId,
                payload,
                undoPayload
              });
            }
          }
          this.callbacks.onNodeRectChange?.(commitId, node.currentRect);
        }
      }
      this.resizeStartRect = null;
      this.dragStartStyles = null;
    }

    // Clear guides.
    this.guides = [];

    // Release pointer capture.
    try {
      this.container.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was already released or lost
    }

    if (operations.length > 0) {
      this.callbacks.onOperationsGenerated?.(operations);
    }

    this.canvas.style.pointerEvents = "none";
    this.callbacks.onInteractionChange?.(null);
    this.render();

    // ── Flat String Bridge ────────────────────────
    // Extract clean HTML and fire commit callback.
    if (commitId) {
      const node = this.tree.get(commitId);
      const commitTarget = (node && node.parentId !== null) ? node.parentId : commitId;
      const html = this.mount.extractHTML(commitTarget);
      if (html) {
        this.callbacks.onHTMLCommit?.(commitTarget, html);
      }
    }

    // Cycle overlapping elements on simple click inside selection
    if (!this.isDragging && !this.isResizing && !this.isPanning && this.pointerDownInsideSelection) {
      const rect = this.getContainerRect();
      const canvasPos = screenToCanvas(
        e.clientX, e.clientY, this.viewport, rect,
      );
      const nodeList = this.getOrderedNodeList();
      // Find all selectable nodes under the cursor in the current selection scope
      const hitNodes = nodeList.filter(n => {
        if (!n.currentRect || !isPointInElement(canvasPos.x, canvasPos.y, n.currentRect)) {
          return false;
        }
        const treeNode = this.tree.get(n.id);
        return treeNode && treeNode.parentId === this.enteredContainerId;
      });

      if (hitNodes.length > 1) {
        const idx = hitNodes.findIndex(n => n.id === this.pointerDownInsideSelection);
        if (idx !== -1) {
          const nextIdx = (idx - 1 + hitNodes.length) % hitNodes.length;
          const nextNode = hitNodes[nextIdx];
          if (nextNode) {
            const nextId = nextNode.id;

            this.selectedIds.clear();
            this.selectedIds.add(nextId);
            this.callbacks.onSelectionChange?.(this.selectedIds);
            this.updateBreadcrumb();
            this.render();
          }
        }
      }
    }
    this.pointerDownInsideSelection = null;
  }

  /** Spacebar tracking for pan mode. */
  private handleKeyDown(e: KeyboardEvent): void {
    const target = e.composedPath()[0] || null;
    if (isEditableTarget(target)) return;

    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      this.spaceDown = true;
      this.container.classList.add("canvus-panning");
    } else if (e.code === "Escape") {
      this.handleEscapeKey();
    } else if (e.key === "Meta" || e.key === "Control") {
      this.updateHover(true);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        this.ungroupSelectedOrParent();
      } else {
        this.deleteSelectedNode();
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      this.duplicateSelectedNode();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
      this.copySelectedNode();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "x") {
      this.cutSelectedNode();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
      this.pasteNode();
    } else if (e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      this.wrapSelectedInFlex();
    } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      if (this.selectedIds.size > 0) {
        e.preventDefault();
        this.nudgeOrReorderSelected(e.key, e.shiftKey);
      }
    }
  }

  private nudgeOrReorderSelected(key: string, shiftKey: boolean): void {
    const topLevelIds = this.getTopLevelSelectedIds();
    if (topLevelIds.length === 0) return;

    const rootNodes: ResolvedNode[] = [];
    const groupedByParent = new Map<string, ResolvedNode[]>();

    for (const id of topLevelIds) {
      const node = this.tree.get(id);
      if (!node) continue;
      if (node.parentId === null) {
        rootNodes.push(node);
      } else {
        if (!groupedByParent.has(node.parentId)) {
          groupedByParent.set(node.parentId, []);
        }
        groupedByParent.get(node.parentId)!.push(node);
      }
    }

    this.mount.setTransitionsEnabled(false);

    const ops: any[] = [];

    // ── Absolute Nudging (Root Nodes) ─────────────
    if (rootNodes.length > 0) {
      const nudgeAmount = shiftKey ? 10 : 1;
      for (const node of rootNodes) {
        const currentX = node.currentRect ? node.currentRect.x : 0;
        const currentY = node.currentRect ? node.currentRect.y : 0;

        let newX = currentX;
        let newY = currentY;

        if (key === "ArrowLeft") newX -= nudgeAmount;
        if (key === "ArrowRight") newX += nudgeAmount;
        if (key === "ArrowUp") newY -= nudgeAmount;
        if (key === "ArrowDown") newY += nudgeAmount;

        if (newX !== currentX || newY !== currentY) {
          const payload = { left: `${newX}px`, top: `${newY}px` };
          const undoPayload = { left: `${currentX}px`, top: `${currentY}px` };

          this.setNodeStyles(node.id, payload);

          ops.push({
            type: "update-style",
            nodeId: node.id,
            payload,
            undoPayload
          });

          if (node.currentRect) {
            this.callbacks.onNodeRectChange?.(node.id, node.currentRect);
          }
        }
      }
    }

    // ── Flow Child Reordering (Grouped by Parent) ──
    for (const [parentId, nodes] of groupedByParent.entries()) {
      const parentContent = this.mount.getContentRoot(parentId);
      if (!parentContent) continue;

      const layoutInfo = detectLayout(parentContent);
      const flowAxis = getFlowAxis(layoutInfo); // "x" or "y"
      const siblings = this.tree.getChildren(parentId);
      const maxIndex = siblings.length - 1;

      let direction = 0;
      if (layoutInfo.mode === "grid" || layoutInfo.mode === "inline-grid") {
        if (key === "ArrowLeft" || key === "ArrowUp") direction = -1;
        else if (key === "ArrowRight" || key === "ArrowDown") direction = 1;
      } else if (flowAxis === "x") {
        if (key === "ArrowLeft") direction = -1;
        else if (key === "ArrowRight") direction = 1;
      } else {
        if (key === "ArrowUp") direction = -1;
        else if (key === "ArrowDown") direction = 1;
      }

      if (direction !== 0) {
        const sortedNodes = nodes.slice().sort((a, b) => {
          return this.tree.getChildIndex(a.id) - this.tree.getChildIndex(b.id);
        });

        if (direction === -1) {
          for (const node of sortedNodes) {
            const currentIndex = this.tree.getChildIndex(node.id);
            const oldIndex = currentIndex;
            const newIndex = Math.max(0, currentIndex - 1);
            if (newIndex !== currentIndex) {
              this.reorderChild(node.id, newIndex);
              ops.push({
                type: "reorder",
                nodeId: node.id,
                payload: { index: newIndex },
                undoPayload: { index: oldIndex }
              });
            }
          }
        } else {
          for (let i = sortedNodes.length - 1; i >= 0; i--) {
            const node = sortedNodes[i] as ResolvedNode;
            const currentIndex = this.tree.getChildIndex(node.id);
            const oldIndex = currentIndex;
            const newIndex = Math.min(maxIndex, currentIndex + 1);
            if (newIndex !== currentIndex) {
              this.reorderChild(node.id, newIndex);
              ops.push({
                type: "reorder",
                nodeId: node.id,
                payload: { index: newIndex },
                undoPayload: { index: oldIndex }
              });
            }
          }
        }

        const html = this.mount.extractHTML(parentId);
        if (html) {
          this.callbacks.onHTMLCommit?.(parentId, html);
        }
      }
    }

    if (ops.length > 0) {
      this.callbacks.onOperationsGenerated?.(ops);
    }

    this.mount.setTransitionsEnabled(true);
    this.render();
  }

  private ungroupSelectedOrParent(): void {
    const targetContainers = new Set<string>();
    for (const id of this.selectedIds) {
      const node = this.tree.get(id);
      if (!node) continue;
      if (this.tree.isContainer(id)) {
        if (node.parentId !== null) {
          targetContainers.add(id);
        }
      } else {
        if (node.parentId !== null) {
          targetContainers.add(node.parentId);
        }
      }
    }

    if (targetContainers.size === 0) return;

    this.mount.setTransitionsEnabled(false);

    const ops: any[] = [];
    const parentsToCommit = new Set<string>();
    const rootsToCommit = new Set<string>();

    for (const containerId of targetContainers) {
      const containerNode = this.tree.get(containerId);
      if (!containerNode) continue;

      const parentId = containerNode.parentId;
      const index = parentId !== null ? this.tree.getChildIndex(containerId) : -1;
      const children = this.tree.getChildren(containerId);

      let childIndexOffset = 0;
      for (const child of children) {
        const childId = child.id;
        const oldParentId = containerId;
        const oldIndex = this.tree.getChildIndex(childId);

        const newIndex = parentId !== null ? index + childIndexOffset : undefined;
        this.mount.reparentNodeDOM(childId, parentId, newIndex);
        this.tree.reparentNode(childId, parentId, newIndex);
        this.remeasureSubtree(childId);

        ops.push({
          type: "reparent",
          nodeId: childId,
          payload: { newParentId: parentId, index: newIndex !== undefined ? this.tree.getChildIndex(childId) : undefined },
          undoPayload: { newParentId: oldParentId, index: oldIndex }
        });

        childIndexOffset++;
      }

      const rawMarkup = this.mount.extractHTML(containerId);
      const rect = containerNode.currentRect;

      this.removeNode(containerId);

      ops.push({
        type: "delete-node" as any,
        nodeId: containerId,
        payload: { parentId },
        undoPayload: { parentId, rawMarkup, rect }
      });

      if (parentId) {
        parentsToCommit.add(parentId);
        this.remeasureSubtree(parentId);
      } else {
        rootsToCommit.add(containerId);
      }
    }

    if (ops.length > 0) {
      this.deselectAll();
      this.callbacks.onOperationsGenerated?.(ops);

      for (const parentId of parentsToCommit) {
        const html = this.mount.extractHTML(parentId);
        if (html) {
          this.callbacks.onHTMLCommit?.(parentId, html);
        }
      }
      for (const rootId of rootsToCommit) {
        this.callbacks.onHTMLCommit?.(rootId, "");
      }
    }

    this.mount.setTransitionsEnabled(true);
    this.render();
  }

  private wrapSelectedInFlex(): void {
    const topLevelIds = this.getTopLevelSelectedIds();
    if (topLevelIds.length === 0) return;

    this.mount.setTransitionsEnabled(false);

    const firstId = topLevelIds[0] as string;
    const firstNode = this.tree.get(firstId);
    if (!firstNode) {
      this.mount.setTransitionsEnabled(true);
      return;
    }

    const parentId = firstNode.parentId;
    const index = parentId !== null ? this.tree.getChildIndex(firstId) : -1;

    const nodesToWrap = topLevelIds.map(id => this.tree.get(id)).filter((n): n is ResolvedNode => n !== undefined);
    const bounds = computeAggregateBounds(nodesToWrap);

    this.newElementCounter++;
    const wrapperId = `flex-wrapper-${this.newElementCounter}-${Date.now().toString(36)}`;
    const rawMarkup = `<div style="display: flex; justify-content: center; align-items: center; gap: 10px; flex-direction: row; box-sizing: border-box;"></div>`;

    let rect = bounds ? { ...bounds } : null;
    this.addNode({
      id: wrapperId,
      rawMarkup,
      currentRect: rect
    }, parentId, index === -1 ? undefined : index);

    const ops: any[] = [];
    ops.push({
      type: "create-node" as any,
      nodeId: wrapperId,
      payload: { parentId, index: index === -1 ? undefined : this.tree.getChildIndex(wrapperId), rawMarkup, rect },
      undoPayload: { parentId }
    });

    let childIdx = 0;
    for (const nodeId of topLevelIds) {
      const node = this.tree.get(nodeId);
      if (!node) continue;
      const oldParentId = node.parentId;
      const oldIndex = this.tree.getChildIndex(nodeId);

      this.mount.reparentNodeDOM(nodeId, wrapperId, childIdx);
      this.tree.reparentNode(nodeId, wrapperId, childIdx);
      this.remeasureSubtree(nodeId);

      ops.push({
        type: "reparent",
        nodeId: nodeId,
        payload: { newParentId: wrapperId, index: childIdx },
        undoPayload: { newParentId: oldParentId, index: oldIndex }
      });

      childIdx++;
    }

    this.remeasureSubtree(wrapperId);
    if (parentId) {
      this.remeasureSubtree(parentId);
    }

    this.selectedIds.clear();
    this.selectedIds.add(wrapperId);
    this.callbacks.onSelectionChange?.(this.selectedIds);
    this.updateBreadcrumb();

    this.callbacks.onOperationsGenerated?.(ops);

    const commitTarget = parentId ?? wrapperId;
    const html = this.mount.extractHTML(commitTarget);
    if (html) {
      this.callbacks.onHTMLCommit?.(commitTarget, html);
    }

    this.mount.setTransitionsEnabled(true);
    this.render();
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const target = e.composedPath()[0] || null;
    if (isEditableTarget(target)) return;

    if (e.code === "Space") {
      this.spaceDown = false;
      if (!this.isPanning) {
        this.container.classList.remove("canvus-panning");
      }
    } else if (e.key === "Meta" || e.key === "Control") {
      this.updateHover(e.metaKey || e.ctrlKey);
    }
  }

  /** Resize canvas to match container dimensions. */
  private handleResize(): void {
    this.renderer.resize(
      this.container.clientWidth,
      this.container.clientHeight,
    );
    this.render();
  }

  /** Double-click text editing handler. */
  private handleDblClick(e: MouseEvent): void {
    if (this.previewMode) return;
    const targetEl = e.composedPath()[0] as HTMLElement | null;
    if (!targetEl) return;

    // Ensure we only edit text-like or leaf elements, rather than entire layout containers
    const textTags = new Set([
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "span", "strong", "em", "b", "i", "u",
      "a", "button", "label", "li", "code", "pre", "td", "th"
    ]);
    const ignoredTags = new Set([
      "img", "svg", "canvas", "video", "audio",
      "iframe", "input", "select", "textarea", "br", "hr",
      "object", "embed", "path", "g", "rect", "circle"
    ]);

    const tag = targetEl.tagName?.toLowerCase() || "";
    const isTextLike = textTags.has(tag) || (targetEl.children.length === 0 && !ignoredTags.has(tag));
    if (!isTextLike) {
      this.editAllowedOnDblClick = false;
      return;
    }
 
    // Find the enclosing node wrapper (both wrapper-based and direct nodes have data-canvus-id)
    let curr: HTMLElement | null = targetEl;
    let nodeId: string | null = null;
    while (curr && curr !== this.container) {
      if (curr.hasAttribute("data-canvus-id")) {
        nodeId = curr.getAttribute("data-canvus-id");
        break;
      }
      curr = curr.parentElement;
    }
 
    if (!nodeId) return;
    if (!this.editAllowedOnDblClick || !this.selectedIds.has(nodeId)) {
      this.editAllowedOnDblClick = false;
      return;
    }
    this.editAllowedOnDblClick = false;
 
    const node = this.tree.get(nodeId);
    if (!node) return;
 
    const wrapper = this.mount.getWrapper(nodeId);
    const contentRoot = this.mount.getContentRoot(nodeId);
    if (!wrapper || !contentRoot) return;
 
    const path = getDOMPath(contentRoot, targetEl);
    const originalHTML = targetEl.innerHTML;
 
    // Option B: Custom Editor Mount Escape Hatch
    if (this.callbacks.onTextEditRequest) {
      this.callbacks.onTextEditRequest(nodeId, targetEl, (newHTML: string) => {
        targetEl.innerHTML = newHTML;
 
        this.remeasureSubtree(nodeId!);
        if (node.parentId) {
          this.remeasureSubtree(node.parentId);
        }
        this.render();
 
        const commitTarget = node.parentId ?? nodeId!;
        const htmlStr = this.mount.extractHTML(commitTarget);
        if (htmlStr) {
          this.callbacks.onHTMLCommit?.(commitTarget, htmlStr);
        }
 
        this.callbacks.onOperationsGenerated?.([{
          type: "update-text",
          nodeId: nodeId!,
          payload: { path, html: newHTML },
          undoPayload: { path, html: originalHTML }
        }]);
      });
      return;
    }
 
    // Option A: Plain-Text Inline Editor
    // Restrict to plaintext only to prevent formatting tag injection
    wrapper.classList.add("canvus-editing");
    targetEl.setAttribute("contenteditable", "plaintext-only");
    targetEl.focus();
 
    // Select all text natively for easier editing
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(targetEl);
      selection.removeAllRanges();
      selection.addRange(range);
    }
 
    const handleKey = (ev: KeyboardEvent) => {
      // Space -> Insert space for BUTTON element (bypass browser default click trigger)
      if ((ev.key === " " || ev.code === "Space") && targetEl.tagName === "BUTTON") {
        ev.preventDefault();
        ev.stopPropagation();
        document.execCommand("insertText", false, " ");
        return;
      }

      // Escape -> Cancel
      if (ev.key === "Escape") {
        ev.preventDefault();
        targetEl.innerHTML = originalHTML;
        targetEl.blur();
        return;
      }
 
      // Enter -> Save for single line tags
      const isSingleLine = /^(H[1-6]|BUTTON|A|SPAN|LABEL)$/i.test(targetEl.tagName);
      if (isSingleLine && ev.key === "Enter") {
        ev.preventDefault();
        targetEl.blur();
        return;
      }
 
      // Block rich text hotkeys (Cmd+B, Cmd+I, etc.)
      const isCmdOrCtrl = ev.metaKey || ev.ctrlKey;
      if (isCmdOrCtrl && (ev.key.toLowerCase() === "b" || ev.key.toLowerCase() === "i" || ev.key.toLowerCase() === "u")) {
        ev.preventDefault();
      }
    };
 
    const handleBlur = () => {
      wrapper.classList.remove("canvus-editing");
      targetEl.removeAttribute("contenteditable");
      targetEl.removeEventListener("keydown", handleKey);
      targetEl.removeEventListener("blur", handleBlur);

      const finalHTML = targetEl.innerHTML;
      if (finalHTML !== originalHTML) {
        this.remeasureSubtree(nodeId!);
        if (node.parentId) {
          this.remeasureSubtree(node.parentId);
        }
        this.render();

        const commitTarget = node.parentId ?? nodeId!;
        const htmlStr = this.mount.extractHTML(commitTarget);
        if (htmlStr) {
          this.callbacks.onHTMLCommit?.(commitTarget, htmlStr);
        }

        this.callbacks.onOperationsGenerated?.([{
          type: "update-text",
          nodeId: nodeId!,
          payload: { path, html: finalHTML },
          undoPayload: { path, html: originalHTML }
        }]);
      }
    };

    targetEl.addEventListener("keydown", handleKey);
    targetEl.addEventListener("blur", handleBlur);
  }

  // ── Render ──────────────────────────────────────

  /** Throttles redrawing using requestAnimationFrame to prevent layout thrashing. */
  private render(): void {
    if (this.renderRequested) return;
    this.renderRequested = true;
    requestAnimationFrame(() => {
      this.renderRequested = false;
      this.renderSync();
    });
  }

  /** Pushes a complete frame to the overlay renderer immediately. */
  private renderSync(): void {
    if (this.previewMode) {
      this.renderer.render({
        viewport: this.viewport,
        nodes: [],
        selectedIds: new Set(),
        hoveredId: null,
        activeAnchor: null,
        guides: [],
        layoutBadges: undefined,
        gridOverlays: undefined,
        activeDropTarget: null,
        marqueeRect: null,
        spacingAdjusters: undefined,
        draggedNodeId: null,
        resizedNodeId: null,
        drawingRect: null,
        drawingTag: null,
        activeRadiusCorner: null,
      });
      return;
    }

    // Compute layout badges for selected containers.
    const layoutBadges: LayoutBadgeInfo[] = [];
    const gridOverlays: GridOverlayInfo[] = [];

    for (const selId of this.selectedIds) {
      const node = this.tree.get(selId);
      if (!node?.currentRect) continue;

      // Detect layout mode from the shadow DOM element.
      const wrapper = this.mount.getWrapper(selId);
      if (!wrapper) continue;

      // Inspect the user's content root.
      const contentRoot = this.mount.getContentRoot(selId);
      if (!contentRoot) continue;

      // JS Badge (⚡️ JS) — uses explicit markNodeHasJS() tracking
      if (this.jsMarkedNodes.has(selId)) {
        layoutBadges.push({
          rect: node.currentRect,
          label: "⚡️ JS",
          isJS: true,
        });
      }

      const info = detectLayout(contentRoot);
      node.layoutMode = info.mode;

      // Only show badges for containers with children.
      if (node.childIds.length > 0 || info.mode === "flex" || info.mode === "grid" ||
          info.mode === "inline-flex" || info.mode === "inline-grid") {
        const label = getLayoutLabel(info);
        layoutBadges.push({ rect: node.currentRect, label });

        // Grid track overlays.
        if ((info.mode === "grid" || info.mode === "inline-grid") &&
            info.gridTemplateColumns && info.gridTemplateRows) {
          gridOverlays.push({
            rect: node.currentRect,
            columns: parseGridTracks(info.gridTemplateColumns, info.gap.column),
            rows: parseGridTracks(info.gridTemplateRows, info.gap.row),
          });
        }
      }
    }

    // Draw active drop target grid overlay even if it is not selected
    if (this.activeDropTarget) {
      const dropParentId = this.activeDropTarget.parentId;
      const dropParentContent = this.mount.getContentRoot(dropParentId);
      if (dropParentContent) {
        const dropParentInfo = detectLayout(dropParentContent);
        if ((dropParentInfo.mode === "grid" || dropParentInfo.mode === "inline-grid") &&
            dropParentInfo.gridTemplateColumns && dropParentInfo.gridTemplateRows) {
          const dropParentNode = this.tree.get(dropParentId);
          if (dropParentNode?.currentRect) {
            if (!gridOverlays.some(g => g.rect === dropParentNode.currentRect)) {
              gridOverlays.push({
                rect: dropParentNode.currentRect,
                columns: parseGridTracks(dropParentInfo.gridTemplateColumns, dropParentInfo.gap.column),
                rows: parseGridTracks(dropParentInfo.gridTemplateRows, dropParentInfo.gap.row),
              });
            }
          }
        }
      }
    }

    // Compute spacing adjusters if a single node is selected
    let spacingAdjusters: SpacingAdjusterInfo[] | undefined;
    if (this.selectedIds.size === 1 && !this.isMarqueeSelecting) {
      const selId = this.selectedIds.values().next().value as string;
      spacingAdjusters = this.computeSpacingAdjusters(selId);
    }

    this.renderer.render({
      viewport: this.viewport,
      nodes: this.getOrderedNodeList(),
      selectedIds: this.selectedIds,
      hoveredId: this.hoveredId,
      activeAnchor: this.activeAnchor,
      guides: this.guides,
      layoutBadges: layoutBadges.length > 0 ? layoutBadges : undefined,
      gridOverlays: gridOverlays.length > 0 ? gridOverlays : undefined,
      activeDropTarget: this.activeDropTarget,
      marqueeRect: this.getMarqueeRect(),
      spacingAdjusters,
      draggedNodeId: this.isDragging && this.selectedIds.size === 1 ? this.selectedIds.values().next().value : null,
      resizedNodeId: this.isResizing && this.selectedIds.size === 1 ? this.selectedIds.values().next().value : null,
      drawingRect: this.getDrawingRect(),
      drawingTag: this.isDrawingNode ? this.getDrawingTag() : null,
      activeRadiusCorner: this.isAdjustingRadius ? this.activeRadiusCorner : this.hoveredRadiusCorner,
    });
  }

  // ── Private Helpers ─────────────────────────────

  /** Returns the container's bounding rect as our `Rect`. */
  private getContainerRect(): Rect {
    const b = this.container.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }

  // ── Lazy Child Registration ──────────────────────

  /**
   * Orchestrates lazy child registration on selection changes.
   * When a node is newly selected, its immediate DOM children are
   * registered for tracking. When deselected, its lazy children
   * are unregistered (DOM left untouched).
   */
  private syncLazyChildren(
    prev: ReadonlySet<string>,
    next: ReadonlySet<string>,
  ): void {
    // Deregister children of nodes that were deselected —
    // BUT keep siblings alive if a child of that node is now selected
    // (user drilled down, not backed out).
    for (const id of prev) {
      if (!next.has(id)) {
        const children = this.tree.getChildren(id);
        const hasSelectedChild = children.some(c => next.has(c.id));
        if (!hasSelectedChild) {
          this.deregisterLazyChildren(id);
        }
      }
    }
    // Register children of newly selected nodes
    for (const id of next) {
      if (!prev.has(id)) {
        this.registerImmediateChildren(id);
      }
    }
  }

  /**
   * Registers the immediate DOM children of a node as tracked
   * workspace nodes. Uses `trackExistingElement` — no wrapper
   * divs, no DOM structure changes. Children get hover states,
   * selection handles, resize, and drag for free.
   */
  private registerImmediateChildren(parentId: string): void {
    const wrapper = this.mount.getWrapper(parentId);
    if (!wrapper) return;

    const contentRoot = this.mount.getContentRoot(parentId);
    if (!contentRoot) return;

    const children = Array.from(contentRoot.children) as HTMLElement[];

    for (const child of children) {
      const tag = child.tagName?.toLowerCase();
      if (!tag || tag === "script" || tag === "style" || tag === "link") continue;

      // Use existing id or generate a stable one
      const existingId = child.getAttribute("id");
      const id = existingId || `${parentId}__child-${++this.lazyChildCounter}`;
      if (!existingId) {
        child.setAttribute("id", id);
      }

      // Skip if already tracked
      if (this.tree.get(id)) continue;

      // Track the existing DOM element (adds data-canvus-id + ResizeObserver)
      const rect = this.mount.trackExistingElement(id, child);

      // Add to the workspace tree as a child of the parent
      const resolved = resolveNode({
        id,
        rawMarkup: child.outerHTML,
        currentRect: rect,
      });
      resolved.parentId = parentId;
      if (rect) resolved.currentRect = rect;

      this.tree.addNode(resolved);
      this.lazyRegisteredIds.add(id);

      // Detect layout mode
      resolved.layoutMode = detectLayout(child).mode;
    }

    // Enter the parent scope so the next click targets children
    if (children.length > 0) {
      this.enteredContainerId = parentId;
      this.updateBreadcrumb();
    }
  }

  /**
   * Deregisters all lazily-registered children of a node.
   * Removes tracking (ResizeObserver, data-canvus-id attribute,
   * tree entry) but leaves the DOM element in place.
   */
  private deregisterLazyChildren(parentId: string): void {
    const childNodes = this.tree.getChildren(parentId);

    for (const child of childNodes) {
      if (!this.lazyRegisteredIds.has(child.id)) continue;

      // Skip children that are currently selected — they're being
      // drilled into and must stay alive in the tree.
      if (this.selectedIds.has(child.id)) continue;

      // Recursively deregister grandchildren first
      this.deregisterLazyChildren(child.id);

      // Remove selection state
      this.selectedIds.delete(child.id);

      // Untrack from ShadowMount (removes data-canvus-id, ResizeObserver)
      this.mount.untrackNode(child.id);

      // Remove from tree
      this.tree.removeNode(child.id);

      // Clean up lazy tracking
      this.lazyRegisteredIds.delete(child.id);
    }
  }

  /** Returns nodes in depth-first order for hit testing and rendering. */
  private getOrderedNodeList(): ReadonlyArray<ResolvedNode> {
    return this.tree.flatten();
  }

  private getTopLevelSelectedIds(): string[] {
    const list: string[] = [];
    for (const id of this.selectedIds) {
      let currentId: string | null = id;
      let hasSelectedAncestor = false;
      while (currentId !== null) {
        const node = this.tree.get(currentId);
        if (!node) break;
        const parentId = node.parentId;
        if (parentId !== null && this.selectedIds.has(parentId)) {
          hasSelectedAncestor = true;
          break;
        }
        currentId = parentId;
      }
      if (!hasSelectedAncestor) {
        list.push(id);
      }
    }
    return list;
  }

  private hitTestRadiusHandle(
    screenX: number,
    screenY: number,
    bounds: Readonly<Rect>,
    viewport: Readonly<ViewportMatrix>,
  ): string | null {
    const s = viewport.scale;
    const ox = viewport.offsetX;
    const oy = viewport.offsetY;

    const left = bounds.x * s + ox;
    const top = bounds.y * s + oy;
    const right = (bounds.x + bounds.width) * s + ox;
    const bottom = (bounds.y + bounds.height) * s + oy;

    const sw = right - left;
    const sh = bottom - top;

    if (sw < 64 || sh < 64) {
      return null;
    }

    const inset = 16;
    const handles = [
      { type: "tl", hx: left + inset, hy: top + inset },
      { type: "tr", hx: right - inset, hy: top + inset },
      { type: "bl", hx: left + inset, hy: bottom - inset },
      { type: "br", hx: right - inset, hy: bottom - inset },
    ];

    const r = 8;
    for (const h of handles) {
      const dx = screenX - h.hx;
      const dy = screenY - h.hy;
      if (dx * dx + dy * dy <= r * r) {
        return h.type;
      }
    }
    return null;
  }

  /** Returns canvas-space rects of all nodes except the given ID. */
  private getOtherRects(excludeId: string): Rect[] {
    const rects: Rect[] = [];
    for (const node of this.tree.values()) {
      if (node.id !== excludeId && node.currentRect) {
        rects.push(node.currentRect);
      }
    }
    return rects;
  }

  private getOtherRectsMultiple(excludeIds: string[]): Rect[] {
    const excludeSet = new Set(excludeIds);
    const rects: Rect[] = [];
    for (const node of this.tree.values()) {
      if (!excludeSet.has(node.id) && node.currentRect) {
        rects.push(node.currentRect);
      }
    }
    return rects;
  }

  /**
   * Re-measures a node and all its descendants using
   * canvas-space coordinate extraction.
   */
  private remeasureSubtree(id: string): void {
    const rect = this.mount.measureNodeCanvasSpace(id);
    const node = this.tree.get(id);
    if (node) {
      if (rect) node.currentRect = rect;
      const contentRoot = this.mount.getContentRoot(id);
      if (contentRoot) {
        node.layoutMode = detectLayout(contentRoot).mode;
      }
    }

    const descendants = this.tree.getDescendantIds(id);
    for (const did of descendants) {
      const dRect = this.mount.measureNodeCanvasSpace(did);
      const dNode = this.tree.get(did);
      if (dNode) {
        if (dRect) dNode.currentRect = dRect;
        const dContentRoot = this.mount.getContentRoot(did);
        if (dContentRoot) {
          dNode.layoutMode = detectLayout(dContentRoot).mode;
        }
      }
    }
  }

  /** Ascends selection and scope when Escape key is pressed. */
  private handleEscapeKey(): void {
    if (this.selectedIds.size === 1) {
      const selId = this.selectedIds.values().next().value as string;
      const node = this.tree.get(selId);
      if (node && node.parentId !== null) {
        this.selectedIds.clear();
        this.selectedIds.add(node.parentId);
        this.enteredContainerId = this.tree.get(node.parentId)?.parentId ?? null;
        this.callbacks.onSelectionChange?.(this.selectedIds);
      } else {
        this.deselectAll();
        this.enteredContainerId = null;
      }
    } else if (this.enteredContainerId) {
      const parent = this.tree.get(this.enteredContainerId);
      this.enteredContainerId = parent?.parentId ?? null;
    } else {
      this.deselectAll();
      this.enteredContainerId = null;
    }
    this.updateBreadcrumb();
    this.render();
  }

  /** Resolves which node is selectable based on click position and scope depth. */
  private findSelectableNode(hitId: string, scopeId: string | null): string | null {
    const path = this.tree.getPath(hitId);
    if (path.length === 0) return null;

    if (scopeId === null) {
      return path[0]?.id ?? null;
    }

    const scopePath = this.tree.getPath(scopeId);
    let deepestCommonIdxInPath = -1;
    let deepestCommonIdxInScope = -1;

    for (let i = 0; i < path.length; i++) {
      const idx = scopePath.findIndex(n => n.id === path[i]!.id);
      if (idx !== -1) {
        deepestCommonIdxInPath = i;
        deepestCommonIdxInScope = idx;
      }
    }

    if (deepestCommonIdxInPath !== -1) {
      if (deepestCommonIdxInScope === scopePath.length - 1) {
        if (deepestCommonIdxInPath < path.length - 1) {
          return path[deepestCommonIdxInPath + 1]?.id ?? null;
        }
        return scopeId;
      } else {
        if (deepestCommonIdxInPath < path.length - 1) {
          return path[deepestCommonIdxInPath + 1]?.id ?? null;
        }
        return path[deepestCommonIdxInPath]?.id ?? null;
      }
    }

    return path[0]?.id ?? null;
  }

  /** Updates the hovered node ID based on current pointer position and Cmd/Ctrl modifier. */
  private updateHover(isCmdPressed: boolean): void {
    if (!this.lastCanvasPos || this.isPanning || this.isDragging || this.isResizing) {
      this.clearDynamicHover();
      this.hoveredId = null;
      return;
    }
    const nodeList = this.getOrderedNodeList();
    const hitId = hitTestElements(this.lastCanvasPos.x, this.lastCanvasPos.y, nodeList);
    let nextHoveredId: string | null = null;
    if (hitId) {
      if (isCmdPressed) {
        nextHoveredId = hitId;
      } else {
        nextHoveredId = this.findSelectableNode(hitId, this.enteredContainerId);
      }
    }

    if (nextHoveredId !== this.dynamicHoveredId) {
      if (this.dynamicHoveredId && !this.forcedStates.hover.has(this.dynamicHoveredId)) {
        this.setNodeStateClass(this.dynamicHoveredId, "hover", false);
      }
      if (nextHoveredId) {
        this.setNodeStateClass(nextHoveredId, "hover", true);
      }
      this.dynamicHoveredId = nextHoveredId;
    }

    this.hoveredId = nextHoveredId;
    this.render();
  }

  private clearDynamicHover(): void {
    if (this.dynamicHoveredId) {
      if (!this.forcedStates.hover.has(this.dynamicHoveredId)) {
        this.setNodeStateClass(this.dynamicHoveredId, "hover", false);
      }
      this.dynamicHoveredId = null;
    }
  }

  private setNodeStateClass(nodeId: string, state: "hover" | "active" | "focus", enabled: boolean): void {
    const wrapper = this.mount.getWrapper(nodeId);
    if (!wrapper) return;
    const contentRoot = this.mount.getContentRoot(nodeId);
    const className = `canvus-state-${state}`;
    if (enabled) {
      wrapper.classList.add(className);
      if (contentRoot && contentRoot !== wrapper) {
        contentRoot.classList.add(className);
      }
    } else {
      wrapper.classList.remove(className);
      if (contentRoot && contentRoot !== wrapper) {
        contentRoot.classList.remove(className);
      }
    }
    this.remeasureSubtree(nodeId);

    // Delegate pseudo-state forcing if callback or electronAPI is available
    if (this.callbacks.onForcePseudoState) {
      this.callbacks.onForcePseudoState(nodeId, state, enabled);
    } else if (typeof window !== "undefined" && (window as any).electronAPI?.forcePseudoState) {
      (window as any).electronAPI.forcePseudoState(nodeId, state, enabled).catch((err: any) => {
        console.error(`[Workspace] Failed to force pseudo state ${state} on ${nodeId} via electronAPI:`, err);
      });
    }
  }

  /** Updates the active breadcrumbs and calls external callback. */
  private updateBreadcrumb(): void {
    if (this.callbacks.onBreadcrumbChange) {
      if (this.selectedIds.size === 1) {
        const selId = this.selectedIds.values().next().value as string;
        const path = this.tree.getPath(selId).map(n => n.id);
        this.callbacks.onBreadcrumbChange(path);
      } else if (this.enteredContainerId) {
        const path = this.tree.getPath(this.enteredContainerId).map(n => n.id);
        this.callbacks.onBreadcrumbChange(path);
      } else {
        this.callbacks.onBreadcrumbChange([]);
      }
    }
  }

  private getDrawingRect(): Rect | null {
    if (!this.isDrawingNode || !this.drawStartCanvas || !this.drawCurrentCanvas) {
      return null;
    }
    return {
      x: Math.min(this.drawStartCanvas.x, this.drawCurrentCanvas.x),
      y: Math.min(this.drawStartCanvas.y, this.drawCurrentCanvas.y),
      width: Math.abs(this.drawStartCanvas.x - this.drawCurrentCanvas.x),
      height: Math.abs(this.drawStartCanvas.y - this.drawCurrentCanvas.y),
    };
  }

  private getMarqueeRect(): Rect | null {
    if (!this.isMarqueeSelecting || !this.marqueeStartCanvas || !this.marqueeCurrentCanvas) {
      return null;
    }
    return {
      x: Math.min(this.marqueeStartCanvas.x, this.marqueeCurrentCanvas.x),
      y: Math.min(this.marqueeStartCanvas.y, this.marqueeCurrentCanvas.y),
      width: Math.abs(this.marqueeStartCanvas.x - this.marqueeCurrentCanvas.x),
      height: Math.abs(this.marqueeStartCanvas.y - this.marqueeCurrentCanvas.y),
    };
  }

  private computeSpacingAdjusters(id: string): SpacingAdjusterInfo[] {
    const node = this.tree.get(id);
    if (!node || !node.currentRect) return [];

    const contentRoot = this.mount.getContentRoot(id);
    if (!contentRoot) return [];

    const cs = getComputedStyle(contentRoot);

    // Compute the accumulated internal CSS zoom/scale factor.
    const internalScale = this.mount.getElementScale(contentRoot);
    const safeScale = internalScale && !isNaN(internalScale) ? internalScale : 1;

    const padTop = (parseFloat(cs.paddingTop) || 0) * safeScale;
    const padRight = (parseFloat(cs.paddingRight) || 0) * safeScale;
    const padBottom = (parseFloat(cs.paddingBottom) || 0) * safeScale;
    const padLeft = (parseFloat(cs.paddingLeft) || 0) * safeScale;

    const marTop = (parseFloat(cs.marginTop) || 0) * safeScale;
    const marRight = (parseFloat(cs.marginRight) || 0) * safeScale;
    const marBottom = (parseFloat(cs.marginBottom) || 0) * safeScale;
    const marLeft = (parseFloat(cs.marginLeft) || 0) * safeScale;

    const { x, y, width, height } = node.currentRect;
    const thickness = 10;

    const adjusters: SpacingAdjusterInfo[] = [];

    const addAdjuster = (type: SpacingAdjusterType, rect: Rect, visualRect: Rect, value: number) => {
      if (value > 0 || this.activeAdjusterType === type) {
        adjusters.push({
          type,
          rect,
          visualRect,
          value,
          isHovered: this.hoveredAdjusterType === type,
          isActive: this.activeAdjusterType === type,
        });
      }
    };

    // Calculate content bounds (use direct border box bounds as currentRect doesn't include margins)
    const cx = x;
    const cy = y;
    const cw = width;
    const ch = height;

    // Padding adjusters (drawn inside the content bounds)
    // Pad top
    const pth = Math.max(thickness, padTop);
    addAdjuster("padding-top", {
      x: cx + padLeft,
      y: cy,
      width: Math.max(10, cw - padLeft - padRight),
      height: pth,
    }, {
      x: cx + padLeft,
      y: cy,
      width: Math.max(10, cw - padLeft - padRight),
      height: padTop,
    }, parseFloat(cs.paddingTop) || 0);

    // Pad bottom
    const pbh = Math.max(thickness, padBottom);
    addAdjuster("padding-bottom", {
      x: cx + padLeft,
      y: cy + ch - pbh,
      width: Math.max(10, cw - padLeft - padRight),
      height: pbh,
    }, {
      x: cx + padLeft,
      y: cy + ch - padBottom,
      width: Math.max(10, cw - padLeft - padRight),
      height: padBottom,
    }, parseFloat(cs.paddingBottom) || 0);

    // Pad left
    const plw = Math.max(thickness, padLeft);
    addAdjuster("padding-left", {
      x: cx,
      y: cy + padTop,
      width: plw,
      height: Math.max(10, ch - padTop - padBottom),
    }, {
      x: cx,
      y: cy + padTop,
      width: padLeft,
      height: Math.max(10, ch - padTop - padBottom),
    }, parseFloat(cs.paddingLeft) || 0);

    // Pad right
    const prw = Math.max(thickness, padRight);
    addAdjuster("padding-right", {
      x: cx + cw - prw,
      y: cy + padTop,
      width: prw,
      height: Math.max(10, ch - padTop - padBottom),
    }, {
      x: cx + cw - padRight,
      y: cy + padTop,
      width: padRight,
      height: Math.max(10, ch - padTop - padBottom),
    }, parseFloat(cs.paddingRight) || 0);

    // Margin adjusters (drawn inside the wrapper, outside/around the content bounds)
    // Mar top
    const mth = Math.max(thickness, marTop);
    addAdjuster("margin-top", {
      x: cx,
      y: cy - mth,
      width: cw,
      height: mth,
    }, {
      x: cx,
      y: cy - marTop,
      width: cw,
      height: marTop,
    }, parseFloat(cs.marginTop) || 0);

    // Mar bottom
    const mbh = Math.max(thickness, marBottom);
    addAdjuster("margin-bottom", {
      x: cx,
      y: cy + ch,
      width: cw,
      height: mbh,
    }, {
      x: cx,
      y: cy + ch,
      width: cw,
      height: marBottom,
    }, parseFloat(cs.marginBottom) || 0);

    // Mar left
    const mlw = Math.max(thickness, marLeft);
    addAdjuster("margin-left", {
      x: cx - mlw,
      y: cy,
      width: mlw,
      height: ch,
    }, {
      x: cx - marLeft,
      y: cy,
      width: marLeft,
      height: ch,
    }, parseFloat(cs.marginLeft) || 0);

    // Mar right
    const mrw = Math.max(thickness, marRight);
    addAdjuster("margin-right", {
      x: cx + cw,
      y: cy,
      width: mrw,
      height: ch,
    }, {
      x: cx + cw,
      y: cy,
      width: marRight,
      height: ch,
    }, parseFloat(cs.marginRight) || 0);

    return adjusters;
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error(
        "[Workspace] Instance has been disposed.",
      );
    }
  }

  private safeSetPointerCapture(pointerId: number): void {
    if (navigator.webdriver || /HeadlessChrome/.test(navigator.userAgent) || /Electron/.test(navigator.userAgent)) {
      return;
    }
    try {
      this.container.setPointerCapture(pointerId);
    } catch {
      // Ignore
    }
  }
}

// ── DOM Path Helpers ────────────────────────────────────────

/**
 * Computes a relative DOM index path from a container root to a target element.
 */
function getDOMPath(root: HTMLElement, target: HTMLElement): number[] {
  const path: number[] = [];
  let curr: HTMLElement | null = target;
  while (curr && curr !== root) {
    const parentEl: HTMLElement | null = curr.parentElement;
    if (!parentEl) break;
    const index = Array.from(parentEl.children).indexOf(curr);
    path.unshift(index);
    curr = parentEl;
  }
  return path;
}

/**
 * Retrieves a descendant element inside a container root using a DOM index path.
 */
function getDOMElementByPath(root: HTMLElement, path: number[]): HTMLElement | null {
  let curr: HTMLElement = root;
  for (const index of path) {
    const next = curr.children[index] as HTMLElement | null;
    if (!next) return null;
    curr = next;
  }
  return curr;
}

/**
 * Checks if the target element of an event is editable (input, textarea, select, or contenteditable).
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as any;
  const tagName = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  const isContentEditable = el.isContentEditable === true || 
                            (typeof el.hasAttribute === "function" && el.hasAttribute("contenteditable")) ||
                            (typeof el.getAttribute === "function" && el.getAttribute("contenteditable") !== null);
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    isContentEditable
  );
}

// ── Layout Grid Helpers ─────────────────────────────────────

function getGridStart(element: HTMLElement, dimension: "column" | "row"): number {
  const cs = getComputedStyle(element);
  const startVal = cs.getPropertyValue(`grid-${dimension}-start`);
  const val = cs.getPropertyValue(`grid-${dimension}`);
  
  const startNum = parseInt(startVal, 10);
  if (!isNaN(startNum)) return startNum;

  if (val) {
    const match = val.match(/^\s*(\d+)/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  return getRealGridStart(element, dimension);
}

function getRealGridStart(element: HTMLElement, dimension: "column" | "row"): number {
  const parent = element.parentElement;
  if (!parent) return 1;

  let current: HTMLElement | null = parent;
  let offset = 0;
  let gap = 0;
  let tracks: GridTrack[] = [];
  let definingGrid: HTMLElement | null = null;

  while (current) {
    const cs = getComputedStyle(current);
    const display = cs.display;
    if (display.includes("grid")) {
      const template = cs.getPropertyValue(`grid-template-${dimension}s`);
      if (template && !template.includes("subgrid")) {
        definingGrid = current;
        gap = parseFloat(cs.getPropertyValue(`${dimension}-gap`)) || 0;
        tracks = parseGridTracks(template, gap);
        break;
      }
    }

    const nextParent: HTMLElement | null = current.parentElement;
    if (!nextParent) break;

    const currentRect = current.getBoundingClientRect();
    const parentRect = nextParent.getBoundingClientRect();
    const pcs = getComputedStyle(nextParent);
    const padLeft = parseFloat(pcs.paddingLeft) || 0;
    const padTop = parseFloat(pcs.paddingTop) || 0;

    offset += (dimension === "column")
      ? (currentRect.left - parentRect.left - padLeft)
      : (currentRect.top - parentRect.top - padTop);

    current = nextParent;
  }

  if (!definingGrid || tracks.length === 0) return 1;

  const elRect = element.getBoundingClientRect();
  const defRect = definingGrid.getBoundingClientRect();
  const defStyle = getComputedStyle(definingGrid);
  const defPadLeft = parseFloat(defStyle.paddingLeft) || 0;
  const defPadTop = parseFloat(defStyle.paddingTop) || 0;

  const elOffset = (dimension === "column")
    ? (elRect.left - defRect.left - defPadLeft)
    : (elRect.top - defRect.top - defPadTop);

  const cellIndex = getCellIndexAtOffset(elOffset, tracks, gap);

  if (parent !== definingGrid) {
    const parentRect = parent.getBoundingClientRect();
    const parentOffset = (dimension === "column")
      ? (parentRect.left - defRect.left - defPadLeft)
      : (parentRect.top - defRect.top - defPadTop);
    const parentCellIndex = getCellIndexAtOffset(parentOffset, tracks, gap);
    return Math.max(1, cellIndex - parentCellIndex + 1);
  }

  return cellIndex;
}

function getCellIndexAtOffset(offset: number, tracks: GridTrack[], gap: number): number {
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]!;
    if (offset <= t.start + t.size + gap / 2) {
      return i + 1;
    }
  }
  return tracks.length;
}

function getGridSpan(element: HTMLElement, dimension: "column" | "row"): number {
  const cs = getComputedStyle(element);
  const startVal = cs.getPropertyValue(`grid-${dimension}-start`);
  const endVal = cs.getPropertyValue(`grid-${dimension}-end`);
  const val = cs.getPropertyValue(`grid-${dimension}`);

  const spanMatch = (startVal + " " + endVal + " " + val).match(/span\s+(\d+)/i);
  if (spanMatch && spanMatch[1]) {
    return parseInt(spanMatch[1], 10);
  }

  const startNum = parseInt(startVal, 10);
  const endNum = parseInt(endVal, 10);
  if (!isNaN(startNum) && !isNaN(endNum) && endNum > startNum) {
    return endNum - startNum;
  }

  return 1;
}

