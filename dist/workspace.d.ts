import type { Rect, ResolvedNode, ViewportMatrix, WebHTMLNode, Operation } from "./types.js";
import { ShadowMount } from "./shadow-mount.js";
import { NodeTree } from "./tree.js";
import type { OverlayStyle } from "./renderer.js";
import { OverlayRenderer } from "./renderer.js";
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
    onTextEditRequest?: (nodeId: string, element: HTMLElement, commit: (newHTML: string) => void) => void;
}
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
export declare class Workspace {
    private readonly mount;
    private readonly renderer;
    private readonly container;
    private readonly canvas;
    private readonly callbacks;
    private readonly snapThreshold;
    private readonly minResizeSize;
    private readonly enableSnapGuides;
    private viewport;
    private readonly tree;
    private readonly selectedIds;
    private hoveredId;
    private activeAnchor;
    private guides;
    private enteredContainerId;
    private lastPointerDownTime;
    private lastPointerDownId;
    private editAllowedOnDblClick;
    private activeDropTarget;
    private pointerDownInsideSelection;
    private spaceDown;
    private isPanning;
    private isDragging;
    private pointerDownReadyToDrag;
    private isResizing;
    private isMarqueeSelecting;
    private marqueeStartCanvas;
    private marqueeCurrentCanvas;
    private preMarqueeSelectedIds;
    private hoveredAdjusterType;
    private activeAdjusterType;
    private adjusterStartValue;
    private adjusterStartValueStr;
    private dragStartCanvas;
    private dragStartNodePos;
    private dragStartParentId;
    private dragStartIndex;
    private resizeStartRect;
    private dragStartStyles;
    private disposed;
    private renderRequested;
    private previewMode;
    private readonly onWheel;
    private readonly onPointerDown;
    private readonly onPointerMove;
    private readonly onPointerUp;
    private readonly onKeyDown;
    private readonly onKeyUp;
    private readonly onWindowResize;
    private readonly onDblClick;
    constructor(container: HTMLElement, callbacks?: WorkspaceCallbacks, config?: WorkspaceConfig);
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
    addNode(node: Readonly<WebHTMLNode>, parentId?: string | null, index?: number): Rect;
    /** Removes a node and all its descendants from the workspace. */
    removeNode(id: string): boolean;
    /** Hot-swaps the inner HTML of a mounted node. */
    updateMarkup(id: string, markup: string): Rect | null;
    /**
     * Moves a node to a new parent (or to root level).
     * Handles both DOM reparenting and tree model update.
     * Fires `onHTMLCommit` with the new parent's HTML.
     */
    reparentNode(nodeId: string, newParentId: string | null, index?: number): void;
    /**
     * Reorders a child within its current parent.
     */
    reorderChild(nodeId: string, newIndex: number): void;
    /** Returns the NodeTree for advanced tree queries. */
    getNodeTree(): NodeTree;
    /** Returns the wrapper DOM element for a node ID. */
    getWrapper(id: string): HTMLElement | null;
    /**
     * Mutates a single CSS style property on the specified node's content element.
     * Automatically triggers browser reflow, updates internal tree boundaries,
     * re-renders visual overlays, and commits clean HTML back to AST.
     */
    setNodeStyle(id: string, property: string, value: string | null): void;
    /**
     * Mutates multiple CSS style properties on the specified node's content element.
     * Batch-updates styles, triggers a single reflow/remeasure loop, and commits changes.
     */
    setNodeStyles(id: string, styles: Record<string, string | null>): void;
    /** Selects a node by ID, clearing previous selection. */
    selectNode(id: string): void;
    /** Clears all selection. */
    deselectAll(): void;
    /** Returns the current selection set (read-only view). */
    getSelectedIds(): ReadonlySet<string>;
    /** Returns the current viewport transform. */
    getViewport(): Readonly<ViewportMatrix>;
    /** Programmatically sets the viewport (e.g. for "fit to content"). */
    setViewport(vp: ViewportMatrix): void;
    /** Resets viewport to 1:1 scale, zero offset. */
    resetViewport(): void;
    /** Sets whether the workspace is in Preview Mode (disables editing overlays and events). */
    setPreviewMode(enabled: boolean): void;
    /** Returns whether the workspace is currently in Preview Mode. */
    isPreviewMode(): boolean;
    /** Forces a pseudo-class state (hover, active, focus) on the specified node element. */
    forceNodeState(nodeId: string, state: "hover" | "active" | "focus", enabled: boolean): void;
    /** Dispatches a synthetic pointer/mouse event (e.g. mouseenter, mouseleave, click) to a node. */
    dispatchInteractionEvent(nodeId: string, eventName: string): void;
    /** Returns a snapshot of all tracked nodes (depth-first order). */
    getNodes(): ReadonlyArray<Readonly<ResolvedNode>>;
    /** Returns the underlying ShadowMount for advanced access. */
    getShadowMount(): ShadowMount;
    /** Returns the underlying OverlayRenderer for advanced access. */
    getOverlayRenderer(): OverlayRenderer;
    /**
     * Extracts the clean inner HTML of a node.
     * This is the **Flat String Bridge** — call it at any time
     * to read the current semantic HTML string.
     */
    extractHTML(id: string): string | null;
    /**
     * Programmatically replays an Operation (mutation payload) onto the workspace.
     * This is the core API used for Undo/Redo replay and collaboration sync.
     */
    applyOperation(op: Operation): void;
    /** Adds a CSS class name directly to the content root of a node. */
    addClass(id: string, className: string): void;
    /** Removes a CSS class name directly from the content root of a node. */
    removeClass(id: string, className: string): void;
    /** Toggles a CSS class name directly on the content root of a node. */
    toggleClass(id: string, className: string): void;
    /**
     * Forces a synchronous geometry measurement of all nodes
     * and updates the internal rect cache.
     */
    measureAll(): Map<string, Rect>;
    /** Injects a CSS string into the shadow root. */
    injectCSS(css: string): HTMLStyleElement;
    /** Loads an external stylesheet into the shadow root. */
    injectCSSLink(href: string): Promise<HTMLLinkElement>;
    /** Tears down the workspace completely. */
    dispose(): void;
    /** Cursor-anchored zoom on scroll wheel. */
    private handleWheel;
    /** Interaction mode detection on pointer down. */
    private handlePointerDown;
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
    private handlePointerMove;
    /**
     * Gesture completion.
     *
     * **Flat String Bridge**: on mouseup after a mutating gesture,
     * extracts the clean HTML and fires `onHTMLCommit`.
     */
    private handlePointerUp;
    /** Spacebar tracking for pan mode. */
    private handleKeyDown;
    private handleKeyUp;
    /** Resize canvas to match container dimensions. */
    private handleResize;
    /** Double-click text editing handler. */
    private handleDblClick;
    /** Throttles redrawing using requestAnimationFrame to prevent layout thrashing. */
    private render;
    /** Pushes a complete frame to the overlay renderer immediately. */
    private renderSync;
    /** Returns the container's bounding rect as our `Rect`. */
    private getContainerRect;
    /** Returns nodes in depth-first order for hit testing and rendering. */
    private getOrderedNodeList;
    /** Returns canvas-space rects of all nodes except the given ID. */
    private getOtherRects;
    /**
     * Re-measures a node and all its descendants using
     * canvas-space coordinate extraction.
     */
    private remeasureSubtree;
    /** Ascends selection and scope when Escape key is pressed. */
    private handleEscapeKey;
    /** Resolves which node is selectable based on click position and scope depth. */
    private findSelectableNode;
    /** Updates the active breadcrumbs and calls external callback. */
    private updateBreadcrumb;
    private getMarqueeRect;
    private computeSpacingAdjusters;
    private assertNotDisposed;
}
//# sourceMappingURL=workspace.d.ts.map