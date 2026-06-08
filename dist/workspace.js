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
import { createDefaultViewport, resolveNode } from "./types.js";
import { applyPan, applyWheelZoom, hitTestElements, screenToCanvas, isPointInElement, } from "./matrix.js";
import { ShadowMount } from "./shadow-mount.js";
import { NodeTree } from "./tree.js";
import { OverlayRenderer, anchorCursor, isContainerNode, } from "./renderer.js";
import { detectLayout, getLayoutLabel, parseGridTracks } from "./layout.js";
import { PanHandler } from "./handlers/pan.handler.js";
import { DrawHandler } from "./handlers/draw.handler.js";
import { ClipboardHandler } from "./handlers/clipboard.handler.js";
import { CommandHandler } from "./handlers/command.handler.js";
import { SpacingHandler } from "./handlers/spacing.handler.js";
import { ResizeHandler, getLockedPropertiesForAnchor } from "./handlers/resize.handler.js";
import { DragHandler } from "./handlers/drag.handler.js";
import { SelectionHandler } from "./handlers/selection.handler.js";
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
    mount;
    renderer;
    container;
    canvas;
    // ── Configuration ───────────────────────────────
    callbacks;
    snapThreshold;
    minResizeSize;
    enableSnapGuides;
    // ── Workspace State ─────────────────────────────
    viewport;
    tree = new NodeTree();
    selectedIds = new Set();
    hoveredId = null;
    dynamicHoveredId = null;
    forcedStates = {
        hover: new Set(),
        active: new Set(),
        focus: new Set()
    };
    guides = [];
    // ── Scoped Selection Scope ──────────────────────
    enteredContainerId = null;
    lastPointerDownTime = 0;
    lastPointerDownId = null;
    lastPointerDownTarget = null;
    editAllowedOnDblClick = false;
    // ── Drag & Drop State ───────────────────────────
    activeDropTarget = null;
    // ── Interaction State Machine ───────────────────
    get hoveredAdjusterType() {
        return this.spacingHandler ? this.spacingHandler.hoveredAdjusterType : null;
    }
    set hoveredAdjusterType(value) {
        if (this.spacingHandler) {
            this.spacingHandler.hoveredAdjusterType = value;
        }
    }
    get hoveredRadiusCorner() {
        return this.spacingHandler ? this.spacingHandler.hoveredRadiusCorner : null;
    }
    set hoveredRadiusCorner(value) {
        if (this.spacingHandler) {
            this.spacingHandler.hoveredRadiusCorner = value;
        }
    }
    lastCanvasPos = null;
    disposed = false;
    renderRequested = false;
    previewMode = false;
    /** Set of node IDs explicitly marked as containing JavaScript behavior. */
    jsMarkedNodes = new Set();
    /** Set of node IDs explicitly locked by the host. Locked nodes are non-interactive. */
    lockedNodes = new Set();
    /** Set of node IDs that were lazily registered (children discovered on selection). */
    lazyRegisteredIds = new Set();
    lazyChildCounter = 0;
    // ── Shared Counter ──────────────────────────────
    /** Monotonic counter for generating unique element IDs (shared across draw, clone, paste). */
    newElementCounter = 0;
    // ── Handler Architecture ────────────────────────
    /** Registered pointer-gesture handlers in priority order. */
    interactionHandlers = [];
    /** Registered keyboard handlers in priority order. */
    keyboardHandlers = [];
    /** The handler that currently owns the active pointer gesture. */
    activeHandler = null;
    /** Pan handler instance (for direct space-key delegation). */
    panHandler;
    /** Draw handler instance (for public API delegation). */
    drawHandler;
    /** Clipboard handler instance (for public API delegation). */
    clipboardHandler;
    /** Command handler instance (for public API delegation). */
    commandHandler;
    /** Spacing handler instance (for interaction delegation). */
    spacingHandler;
    /** Resize handler instance (for interaction delegation). */
    resizeHandler;
    /** Drag handler instance (for interaction delegation). */
    dragHandler;
    /** Selection handler instance (for interaction delegation). */
    selectionHandler;
    // ── Bound Event Handlers (for cleanup) ──────────
    onWheel;
    onPointerDown;
    onPointerMove;
    onPointerUp;
    onKeyDown;
    onKeyUp;
    onWindowResize;
    onDblClick;
    onDragStart;
    // ── Constructor ─────────────────────────────────
    constructor(container, callbacks = {}, config = {}) {
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
        shadowRoot.addEventListener("click", (e) => {
            if (!this.previewMode) {
                e.stopPropagation();
                e.preventDefault();
            }
        }, { capture: true });
        shadowRoot.addEventListener("submit", (e) => {
            if (!this.previewMode) {
                e.stopPropagation();
                e.preventDefault();
            }
        }, { capture: true });
        // ── Bind Events ───────────────────────────────
        this.onWheel = this.handleWheel.bind(this);
        this.onPointerDown = this.handlePointerDown.bind(this);
        this.onPointerMove = this.handlePointerMove.bind(this);
        this.onPointerUp = this.handlePointerUp.bind(this);
        this.onKeyDown = this.handleKeyDown.bind(this);
        this.onKeyUp = this.handleKeyUp.bind(this);
        this.onWindowResize = this.handleResize.bind(this);
        this.onDblClick = this.handleDblClick.bind(this);
        this.onDragStart = (e) => e.preventDefault();
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
        // ── Register Handlers ─────────────────────────
        // Handlers receive `this` as WorkspaceContext. The Workspace
        // class implements the context interface implicitly.
        this.panHandler = new PanHandler(this);
        this.registerInteractionHandler(this.panHandler, 0); // Highest priority
        this.drawHandler = new DrawHandler(this);
        this.registerInteractionHandler(this.drawHandler, 1); // After pan
        this.clipboardHandler = new ClipboardHandler(this);
        this.registerKeyboardHandler(this.clipboardHandler);
        this.commandHandler = new CommandHandler(this);
        this.registerKeyboardHandler(this.commandHandler);
        this.resizeHandler = new ResizeHandler(this);
        this.registerInteractionHandler(this.resizeHandler, 2);
        this.spacingHandler = new SpacingHandler(this);
        this.registerInteractionHandler(this.spacingHandler, 3);
        this.dragHandler = new DragHandler(this);
        this.registerInteractionHandler(this.dragHandler, 4);
        this.selectionHandler = new SelectionHandler(this);
        this.registerInteractionHandler(this.selectionHandler, 5);
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
    addNode(node, parentId, index) {
        this.assertNotDisposed();
        // Resolve to internal representation.
        const resolved = resolveNode(node);
        resolved.parentId = parentId ?? null;
        // Mount into shadow DOM.
        let rect;
        if (resolved.parentId !== null) {
            rect = this.mount.addChildNode(node, resolved.parentId, index);
        }
        else {
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
        this.callbacks.onNodeAdded?.(resolved.id);
        this.render();
        return resolved.currentRect ?? rect;
    }
    /** Removes a node and all its descendants from the workspace. */
    removeNode(id) {
        // Remove all descendants first (depth-first).
        const descendantIds = this.tree.getDescendantIds(id);
        for (const did of descendantIds) {
            this.mount.removeNode(did);
            this.selectedIds.delete(did);
            this.callbacks.onNodeRemoved?.(did);
        }
        const removed = this.mount.removeNode(id);
        if (removed) {
            this.tree.removeNode(id); // Also removes descendants from tree.
            this.selectedIds.delete(id);
            this.callbacks.onNodeRemoved?.(id);
            this.render();
        }
        return removed;
    }
    /** Hot-swaps the inner HTML of a mounted node. */
    updateMarkup(id, markup) {
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
    reparentNode(nodeId, newParentId, index) {
        const node = this.tree.get(nodeId);
        const oldParentId = node?.parentId ?? null;
        // DOM reparenting.
        this.mount.reparentNodeDOM(nodeId, newParentId, index);
        // Tree model update.
        this.tree.reparentNode(nodeId, newParentId, index);
        // Re-measure affected nodes.
        this.remeasureSubtree(nodeId);
        if (newParentId)
            this.remeasureSubtree(newParentId);
        if (oldParentId)
            this.remeasureSubtree(oldParentId);
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
    reorderChild(nodeId, newIndex) {
        const node = this.tree.get(nodeId);
        if (!node?.parentId)
            return;
        // DOM reorder: remove and re-insert at new index.
        this.mount.reparentNodeDOM(nodeId, node.parentId, newIndex);
        // Tree model update.
        this.tree.reorderChild(nodeId, newIndex);
        // Re-measure the parent's children.
        this.remeasureSubtree(node.parentId);
        this.render();
    }
    /** Returns the NodeTree for advanced tree queries. */
    getNodeTree() {
        return this.tree;
    }
    /** Returns the wrapper DOM element for a node ID. */
    getWrapper(id) {
        return this.mount.getWrapper(id);
    }
    /** Returns the user's content root element for a node ID. */
    getContentRoot(id) {
        return this.mount.getContentRoot(id);
    }
    /**
     * Mutates a single CSS style property on the specified node's content element.
     * Automatically triggers browser reflow, updates internal tree boundaries,
     * re-renders visual overlays, and commits clean HTML back to AST.
     */
    setNodeStyle(id, property, value) {
        const node = this.tree.get(id);
        if (!node)
            return;
        // Apply the style change
        this.mount.setNodeStyle(id, property, value);
        // Sync layout display mode changes
        if (property === "display") {
            const contentRoot = this.mount.getContentRoot(id);
            node.layoutMode = contentRoot ? detectLayout(contentRoot).mode : (value ?? "none");
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
    setNodeStyles(id, styles) {
        const node = this.tree.get(id);
        if (!node)
            return;
        // Batch apply styles
        this.mount.setNodeStyles(id, styles);
        // Sync layout display mode changes if any
        for (const [prop, val] of Object.entries(styles)) {
            if (prop === "display") {
                const contentRoot = this.mount.getContentRoot(id);
                node.layoutMode = contentRoot ? detectLayout(contentRoot).mode : (val ?? "none");
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
    selectNode(id) {
        const prev = new Set(this.selectedIds);
        this.selectedIds.clear();
        this.selectedIds.add(id);
        this.syncLazyChildren(prev, this.selectedIds);
        this.callbacks.onSelectionChange?.(this.selectedIds);
        this.render();
    }
    /** Clears all selection. */
    deselectAll() {
        const prev = new Set(this.selectedIds);
        this.selectedIds.clear();
        this.syncLazyChildren(prev, this.selectedIds);
        this.callbacks.onSelectionChange?.(this.selectedIds);
        this.render();
    }
    /** Returns the current selection set (read-only view). */
    getSelectedIds() {
        return this.selectedIds;
    }
    // ── Public API: Drawing Tools ───────────────
    /** Sets the active drawing tool (box, text, or null to return to selection/idle mode). */
    setActiveTool(tool) {
        this.drawHandler.setActiveTool(tool);
    }
    /** Returns the currently active drawing tool. */
    getActiveTool() {
        return this.drawHandler.getActiveTool();
    }
    /** Customizes the HTML tag type for box or text drawing. */
    setDrawingTag(tag) {
        this.drawHandler.setDrawingTag(tag);
    }
    /** Returns the active drawing tag based on the selected tool. */
    getDrawingTag() {
        return this.drawHandler.getDrawingTag();
    }
    // ── Public API: Viewport ────────────────────────
    /** Returns the current viewport transform. */
    getViewport() {
        return this.viewport;
    }
    /** Programmatically sets the viewport (e.g. for "fit to content"). */
    setViewport(vp) {
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
    resetViewport() {
        this.setViewport(createDefaultViewport());
    }
    // ── Public API: Preview Mode ────────────────────
    /** Sets whether the workspace is in Preview Mode (disables editing overlays and events). */
    setPreviewMode(enabled) {
        if (this.previewMode === enabled)
            return;
        this.previewMode = enabled;
        this.canvas.style.pointerEvents = "none";
        // Clear selection, hover, and active interactions.
        if (enabled) {
            if (this.activeHandler) {
                this.activeHandler.onCancel?.();
                this.activeHandler = null;
            }
            this.selectedIds.clear();
            this.clearDynamicHover();
            this.hoveredId = null;
            this.activeDropTarget = null;
            this.dragHandler.onCancel();
            this.selectionHandler.onCancel();
            this.callbacks.onSelectionChange?.(this.selectedIds);
            this.callbacks.onInteractionChange?.(null);
        }
        this.render();
    }
    /** Returns whether the workspace is currently in Preview Mode. */
    isPreviewMode() {
        return this.previewMode;
    }
    // (Drawing tool API moved — see setActiveTool/getActiveTool/setDrawingTag/getDrawingTag above)
    // ── Public API: Clipboard Operations ────────────
    /** Deletes the currently selected node from the workspace. */
    deleteSelectedNode() {
        this.clipboardHandler.deleteSelectedNode();
    }
    /** Duplicates the selected node right next to it as a sibling. */
    duplicateSelectedNode() {
        this.clipboardHandler.duplicateSelectedNode();
    }
    /** Copies the selected node to the internal clipboard. */
    copySelectedNode() {
        this.clipboardHandler.copySelectedNode();
    }
    /** Cuts the selected node to the clipboard, removing it from the canvas. */
    cutSelectedNode() {
        this.clipboardHandler.cutSelectedNode();
    }
    /** Pastes the node currently in the clipboard into the canvas. */
    pasteNode() {
        this.clipboardHandler.pasteNode();
    }
    // ── Public API: State Forcing ───────────────────
    /** Forces a pseudo-class state (hover, active, focus) on the specified node element. */
    forceNodeState(nodeId, state, enabled) {
        if (enabled) {
            this.forcedStates[state].add(nodeId);
        }
        else {
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
    markNodeHasJS(nodeId) {
        this.jsMarkedNodes.add(nodeId);
        this.render();
    }
    /**
     * Clears the JS badge from a node.
     */
    unmarkNodeHasJS(nodeId) {
        this.jsMarkedNodes.delete(nodeId);
        this.render();
    }
    /**
     * Returns whether a node is marked as containing JavaScript behavior.
     */
    hasJSMark(nodeId) {
        return this.jsMarkedNodes.has(nodeId);
    }
    // ── Public API: Layer Locking ───────────────────
    /**
     * Locks a node, making it non-interactive on the canvas.
     * Locked nodes cannot be selected, dragged, resized, or hovered
     * via user pointer/keyboard interaction. If the node is currently
     * selected, it will be deselected. Locking a parent node also
     * locks all of its descendants.
     */
    lockNode(nodeId) {
        this.lockedNodes.add(nodeId);
        // Deselect this node and any locked descendants
        let changed = false;
        for (const selId of [...this.selectedIds]) {
            if (this.isNodeLocked(selId)) {
                this.selectedIds.delete(selId);
                changed = true;
            }
        }
        if (changed) {
            this.callbacks.onSelectionChange?.(this.selectedIds);
            this.updateBreadcrumb();
        }
        this.render();
    }
    /**
     * Unlocks a previously locked node, restoring interactivity.
     */
    unlockNode(nodeId) {
        this.lockedNodes.delete(nodeId);
        this.render();
    }
    /**
     * Returns whether a node is currently locked (directly or via a locked ancestor).
     */
    isNodeLocked(nodeId) {
        if (this.lockedNodes.has(nodeId))
            return true;
        // Walk up the tree checking ancestors
        let currentId = this.tree.get(nodeId)?.parentId ?? null;
        while (currentId !== null) {
            if (this.lockedNodes.has(currentId))
                return true;
            currentId = this.tree.get(currentId)?.parentId ?? null;
        }
        return false;
    }
    /**
     * Returns the set of directly locked node IDs.
     * Does not include nodes that are only locked via ancestor inheritance.
     */
    getLockedNodeIds() {
        return this.lockedNodes;
    }
    // ── Public API: Property Lock Queries ───────────
    /**
     * Checks whether a CSS property on a node is locked by the host.
     * Delegates to the `isPropertyLocked` callback if provided.
     * Returns `false` (unlocked) when no callback is registered.
     */
    isPropertyLocked(nodeId, property) {
        return this.callbacks.isPropertyLocked?.(nodeId, property) ?? false;
    }
    /**
     * Notifies the host that the user attempted to adjust a locked property.
     * Reads the current computed value from the node's content root and
     * fires the `onPropertyLockInteraction` callback.
     * No-op when the callback is not registered.
     */
    notifyPropertyLockInteraction(nodeId, property) {
        if (!this.callbacks.onPropertyLockInteraction)
            return;
        const contentRoot = this.mount.getContentRoot(nodeId);
        let currentValue = "";
        if (contentRoot) {
            currentValue =
                contentRoot.style.getPropertyValue(property) ||
                    window.getComputedStyle(contentRoot).getPropertyValue(property) ||
                    "";
        }
        this.callbacks.onPropertyLockInteraction(nodeId, property, currentValue);
    }
    // ── Public API: Synthetic Interaction ───────────
    /** Dispatches a synthetic pointer/mouse event (e.g. mouseenter, mouseleave, click) to a node. */
    dispatchInteractionEvent(nodeId, eventName) {
        const contentRoot = this.mount.getContentRoot(nodeId);
        if (!contentRoot)
            return;
        let event;
        if (eventName === "click" || eventName === "dblclick" || eventName.startsWith("mouse") || eventName.startsWith("pointer")) {
            event = new MouseEvent(eventName, {
                bubbles: true,
                cancelable: true,
                view: window,
            });
        }
        else {
            event = new CustomEvent(eventName, {
                bubbles: true,
                cancelable: true,
            });
        }
        contentRoot.dispatchEvent(event);
    }
    // ── Public API: State Accessors ─────────────────
    /** Returns a snapshot of all tracked nodes (depth-first order). */
    getNodes() {
        return this.tree.flatten();
    }
    /** Returns the underlying ShadowMount for advanced access. */
    getShadowMount() {
        return this.mount;
    }
    /** Returns the underlying OverlayRenderer for advanced access. */
    getOverlayRenderer() {
        return this.renderer;
    }
    /**
     * Extracts the clean inner HTML of a node.
     * This is the **Flat String Bridge** — call it at any time
     * to read the current semantic HTML string.
     */
    extractHTML(id) {
        return this.mount.extractHTML(id);
    }
    /**
     * Programmatically replays an Operation (mutation payload) onto the workspace.
     * This is the core API used for Undo/Redo replay and collaboration sync.
     */
    applyOperation(op) {
        this.assertNotDisposed();
        if (op.type === "create-node" || op.type === "delete-node") {
            const payload = op.payload;
            if (payload && typeof payload.rawMarkup === "string") {
                const { parentId, index, rawMarkup, rect } = payload;
                this.addNode({ id: op.nodeId, rawMarkup, currentRect: rect }, parentId, index);
            }
            else {
                this.removeNode(op.nodeId);
                this.deselectAll();
            }
            this.render();
            return;
        }
        const node = this.tree.get(op.nodeId);
        if (!node)
            return;
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
                if (!contentRoot)
                    break;
                const stylesToApply = {};
                for (const [prop, val] of Object.entries(styles)) {
                    const value = val;
                    // Check if it's wrapper geometric positioning styles for root elements
                    if (node.parentId === null && (prop === "left" || prop === "top" || prop === "width" || prop === "height")) {
                        if (prop === "left" || prop === "top") {
                            const currentX = node.currentRect ? node.currentRect.x : 0;
                            const currentY = node.currentRect ? node.currentRect.y : 0;
                            const parsedVal = value ? parseFloat(value) : 0;
                            const newX = prop === "left" ? parsedVal : currentX;
                            const newY = prop === "top" ? parsedVal : currentY;
                            this.mount.setNodePosition(op.nodeId, newX, newY);
                        }
                        else {
                            const parsedVal = value ? (value === "auto" ? "auto" : parseFloat(value)) : "auto";
                            const newW = prop === "width" ? parsedVal : null;
                            const newH = prop === "height" ? parsedVal : null;
                            this.mount.setNodeSize(op.nodeId, newW, newH);
                        }
                    }
                    else {
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
                if (!contentRoot)
                    break;
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
                if (!contentRoot)
                    break;
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
    addClass(id, className) {
        const node = this.tree.get(id);
        if (!node)
            return;
        const contentRoot = this.mount.getContentRoot(id);
        if (!contentRoot)
            return;
        if (contentRoot.classList.contains(className))
            return;
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
    removeClass(id, className) {
        const node = this.tree.get(id);
        if (!node)
            return;
        const contentRoot = this.mount.getContentRoot(id);
        if (!contentRoot)
            return;
        if (!contentRoot.classList.contains(className))
            return;
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
    toggleClass(id, className) {
        const node = this.tree.get(id);
        if (!node)
            return;
        const contentRoot = this.mount.getContentRoot(id);
        if (!contentRoot)
            return;
        const hasClass = contentRoot.classList.contains(className);
        if (hasClass) {
            this.removeClass(id, className);
        }
        else {
            this.addClass(id, className);
        }
    }
    /**
     * Forces a synchronous geometry measurement of all nodes
     * and updates the internal rect cache.
     */
    measureAll() {
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
    injectCSS(css) {
        return this.mount.injectStylesheet(css);
    }
    /** Loads an external stylesheet into the shadow root. */
    injectCSSLink(href) {
        return this.mount.injectStylesheetLink(href);
    }
    // ── Handler Architecture API ─────────────────────
    /**
     * Registers a pointer-gesture handler at the specified priority position.
     * Lower index = higher priority (checked first on pointerdown).
     * If no index is given, the handler is appended (lowest priority).
     */
    registerInteractionHandler(handler, index) {
        if (index !== undefined) {
            this.interactionHandlers.splice(index, 0, handler);
        }
        else {
            this.interactionHandlers.push(handler);
        }
    }
    /**
     * Registers a keyboard handler at the specified priority position.
     * Lower index = higher priority (checked first on keydown).
     * If no index is given, the handler is appended (lowest priority).
     */
    registerKeyboardHandler(handler, index) {
        if (index !== undefined) {
            this.keyboardHandlers.splice(index, 0, handler);
        }
        else {
            this.keyboardHandlers.push(handler);
        }
    }
    /**
     * Emit an interaction mode change to the host.
     * Enriches the existing `onInteractionChange` callback with
     * optional `InteractionDetail` for richer host observability.
     */
    emitInteraction(mode, _detail) {
        this.callbacks.onInteractionChange?.(mode);
    }
    /**
     * Increment and return a unique counter for generating element IDs.
     * Used by handlers that create new nodes (DrawHandler, ClipboardHandler, etc.).
     */
    nextElementId() {
        return ++this.newElementCounter;
    }
    // ── Disposal ────────────────────────────────────
    /** Tears down the workspace completely. */
    dispose() {
        if (this.disposed)
            return;
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
    /**
     * Handles wheel events with Figma-style behavior:
     * - **Trackpad two-finger scroll** → pans the canvas
     * - **Trackpad pinch-to-zoom** → zooms (browsers report this with ctrlKey=true)
     * - **Ctrl + mouse wheel** → zooms
     */
    handleWheel(e) {
        e.preventDefault();
        const rect = this.getContainerRect();
        // Browsers report trackpad pinch gestures as wheel events with ctrlKey=true.
        // Regular two-finger scrolling does NOT set ctrlKey.
        const isPinchOrCtrlWheel = e.ctrlKey || e.metaKey;
        if (isPinchOrCtrlWheel) {
            // Pinch-to-zoom or Ctrl+scroll → zoom anchored at cursor
            this.viewport = applyWheelZoom(e.clientX, e.clientY, e.deltaY, this.viewport, rect, true);
        }
        else {
            // Regular two-finger scroll → pan the canvas
            this.viewport = applyPan(-e.deltaX, -e.deltaY, this.viewport);
        }
        this.mount.applyViewportTransform(this.viewport);
        this.callbacks.onViewportChange?.(this.viewport);
        this.render();
    }
    /** Interaction mode detection on pointer down. */
    handlePointerDown(e) {
        const rect = this.getContainerRect();
        const canvasPos = screenToCanvas(e.clientX, e.clientY, this.viewport, rect);
        console.log('DEBUG WORKSPACE DOWN: viewport scale:', this.viewport.scale, 'canvasPos:', canvasPos, 'clientX:', e.clientX, 'clientY:', e.clientY);
        // ── Handler Dispatch: try registered handlers first ──────
        if (this.interactionHandlers.length > 0) {
            const nodeList = this.getOrderedNodeList();
            const hitId = hitTestElements(canvasPos.x, canvasPos.y, nodeList);
            for (const handler of this.interactionHandlers) {
                if (handler.claim(e, canvasPos, hitId, rect)) {
                    this.activeHandler = handler;
                    const isDoubleClick = (Date.now() - this.lastPointerDownTime < 350);
                    this.lastPointerDownTime = isDoubleClick ? 0 : Date.now();
                    this.lastPointerDownId = isDoubleClick ? null : hitId;
                    this.lastPointerDownTarget = isDoubleClick ? null : (e.composedPath()[0] || null);
                    return;
                }
            }
        }
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
    handlePointerMove(e) {
        const rect = this.getContainerRect();
        const canvasPos = screenToCanvas(e.clientX, e.clientY, this.viewport, rect);
        this.lastCanvasPos = canvasPos;
        // ── Handler Dispatch: route to active handler ────────────
        if (this.activeHandler) {
            this.activeHandler.onPointerMove?.(e, canvasPos, rect);
            return;
        }
        if (this.previewMode) {
            return;
        }
        // (Drawing tool dragging now handled by DrawHandler via dispatch loop)
        // ── Hover tracking ────────────────────────────
        if (!this.panHandler.isActive && !this.dragHandler.isDragging && !this.resizeHandler.isResizing && !this.spacingHandler.isAdjustingRadius) {
            this.updateHover(e.metaKey || e.ctrlKey);
            // Handle hover cursor for multiple elements.
            let hoveredSelectedId = null;
            for (const selId of this.selectedIds) {
                const selNode = this.tree.get(selId);
                if (selNode?.currentRect && isPointInElement(canvasPos.x, canvasPos.y, selNode.currentRect)) {
                    hoveredSelectedId = selId;
                    break;
                }
            }
            if (hoveredSelectedId) {
                const selNode = this.tree.get(hoveredSelectedId);
                const localX = e.clientX - rect.x;
                const localY = e.clientY - rect.y;
                let hitRadiusCorner = null;
                if (isContainerNode(selNode) && selNode.currentRect) {
                    hitRadiusCorner = this.hitTestRadiusHandle(localX, localY, selNode.currentRect, this.viewport);
                }
                if (hitRadiusCorner) {
                    this.hoveredRadiusCorner = hitRadiusCorner;
                    // ── Lock check: suppress radius cursor if locked ──
                    const radiusLocked = this.isPropertyLocked(hoveredSelectedId, "border-radius");
                    this.container.style.cursor = radiusLocked ? "default" : "pointer";
                    this.hoveredAdjusterType = null;
                }
                else {
                    this.hoveredRadiusCorner = null;
                    const anchor = this.renderer.hitTestHandle(localX, localY, selNode.currentRect, this.viewport);
                    if (anchor) {
                        // ── Lock check: suppress resize cursor if locked ──
                        const affectedProps = getLockedPropertiesForAnchor(anchor);
                        const anyLocked = affectedProps.some(p => this.isPropertyLocked(hoveredSelectedId, p));
                        this.container.style.cursor = anyLocked ? "default" : anchorCursor(anchor);
                        this.hoveredAdjusterType = null;
                    }
                    else {
                        // Spacing adjusters check
                        const adjusters = this.computeSpacingAdjusters(hoveredSelectedId);
                        const hoveredAdj = adjusters.find(adj => canvasPos.x >= adj.rect.x &&
                            canvasPos.x <= adj.rect.x + adj.rect.width &&
                            canvasPos.y >= adj.rect.y &&
                            canvasPos.y <= adj.rect.y + adj.rect.height);
                        if (hoveredAdj) {
                            // ── Lock check: suppress adjuster cursor if locked ──
                            if (this.isPropertyLocked(hoveredSelectedId, hoveredAdj.type)) {
                                this.hoveredAdjusterType = null;
                                this.container.style.cursor = "default";
                            }
                            else {
                                this.hoveredAdjusterType = hoveredAdj.type;
                                const isVertical = hoveredAdj.type.includes("top") || hoveredAdj.type.includes("bottom");
                                this.container.style.cursor = isVertical ? "ns-resize" : "ew-resize";
                            }
                        }
                        else {
                            this.hoveredAdjusterType = null;
                            this.container.style.cursor = "default";
                        }
                    }
                }
            }
            else {
                this.hoveredRadiusCorner = null;
                this.hoveredAdjusterType = null;
                this.container.style.cursor = "default";
            }
            this.render();
            return;
        }
        // ── Pan ────────────────────────────────────────
        // (Pan is now handled by PanHandler via dispatch loop.
        //  This block is kept as a guard in case of stale state.)
        if (this.panHandler.isActive) {
            return;
        }
    }
    /**
     * Gesture completion.
     *
     * **Flat String Bridge**: on mouseup after a mutating gesture,
     * extracts the clean HTML and fires `onHTMLCommit`.
     */
    handlePointerUp(e) {
        // ── Handler Dispatch: route to active handler ────────────
        if (this.activeHandler) {
            const rect = this.getContainerRect();
            const canvasPos = screenToCanvas(e.clientX, e.clientY, this.viewport, rect);
            this.activeHandler.onPointerUp?.(e, canvasPos, rect);
            this.activeHandler = null;
            return;
        }
        if (this.previewMode) {
            return;
        }
        // (Drawing tool completion now handled by DrawHandler via dispatch loop)
        this.guides = [];
        // Release pointer capture.
        try {
            this.container.releasePointerCapture(e.pointerId);
        }
        catch {
            // Ignore if capture was already released or lost
        }
        this.canvas.style.pointerEvents = "none";
        this.callbacks.onInteractionChange?.(null);
        this.render();
    }
    handleKeyDown(e) {
        const target = e.composedPath()[0] || null;
        if (isEditableTarget(target))
            return;
        for (const handler of this.keyboardHandlers) {
            if (handler.onKeyDown?.(e)) {
                return;
            }
        }
        if (e.code === "Space" && !e.repeat) {
            e.preventDefault();
            this.panHandler.onSpaceDown();
        }
        else if (e.code === "Escape") {
            this.handleEscapeKey();
        }
        else if (e.key === "Meta" || e.key === "Control") {
            this.updateHover(true);
        }
    }
    /** Registers a custom keyboard command shortcut. */
    registerCommand(cmd) {
        this.commandHandler.registerCommand(cmd);
    }
    handleKeyUp(e) {
        const target = e.composedPath()[0] || null;
        if (isEditableTarget(target))
            return;
        for (const handler of this.keyboardHandlers) {
            if (handler.onKeyUp?.(e)) {
                return;
            }
        }
        if (e.code === "Space") {
            this.panHandler.onSpaceUp();
        }
        else if (e.key === "Meta" || e.key === "Control") {
            this.updateHover(e.metaKey || e.ctrlKey);
        }
    }
    /** Resize canvas to match container dimensions. */
    handleResize() {
        this.renderer.resize(this.container.clientWidth, this.container.clientHeight);
        this.render();
    }
    /** Double-click text editing handler. */
    handleDblClick(e) {
        if (this.previewMode)
            return;
        const targetEl = e.composedPath()[0];
        if (!targetEl)
            return;
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
        let curr = targetEl;
        let nodeId = null;
        while (curr && curr !== this.container) {
            if (curr.hasAttribute("data-canvus-id")) {
                nodeId = curr.getAttribute("data-canvus-id");
                break;
            }
            curr = curr.parentElement;
        }
        if (!nodeId)
            return;
        if (!this.editAllowedOnDblClick || !this.selectedIds.has(nodeId)) {
            this.editAllowedOnDblClick = false;
            return;
        }
        this.editAllowedOnDblClick = false;
        const node = this.tree.get(nodeId);
        if (!node)
            return;
        const wrapper = this.mount.getWrapper(nodeId);
        const contentRoot = this.mount.getContentRoot(nodeId) || wrapper;
        if (!wrapper || !contentRoot)
            return;
        // Disallow inline text editing for React nodes (marked with data-canvus-react)
        const isReact = contentRoot.hasAttribute("data-canvus-react") || contentRoot.querySelector("[data-canvus-react]") !== null;
        if (isReact) {
            this.editAllowedOnDblClick = false;
            return;
        }
        const path = getDOMPath(contentRoot, targetEl);
        const originalHTML = targetEl.innerHTML;
        // Option B: Custom Editor Mount Escape Hatch
        if (this.callbacks.onTextEditRequest) {
            this.callbacks.onTextEditRequest(nodeId, targetEl, (newHTML) => {
                targetEl.innerHTML = newHTML;
                this.remeasureSubtree(nodeId);
                if (node.parentId) {
                    this.remeasureSubtree(node.parentId);
                }
                this.render();
                const commitTarget = node.parentId ?? nodeId;
                const htmlStr = this.mount.extractHTML(commitTarget);
                if (htmlStr) {
                    this.callbacks.onHTMLCommit?.(commitTarget, htmlStr);
                }
                this.callbacks.onOperationsGenerated?.([{
                        type: "update-text",
                        nodeId: nodeId,
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
        const handleKey = (ev) => {
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
                this.remeasureSubtree(nodeId);
                if (node.parentId) {
                    this.remeasureSubtree(node.parentId);
                }
                this.render();
                const commitTarget = node.parentId ?? nodeId;
                const htmlStr = this.mount.extractHTML(commitTarget);
                if (htmlStr) {
                    this.callbacks.onHTMLCommit?.(commitTarget, htmlStr);
                }
                this.callbacks.onOperationsGenerated?.([{
                        type: "update-text",
                        nodeId: nodeId,
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
    render() {
        if (this.renderRequested)
            return;
        this.renderRequested = true;
        requestAnimationFrame(() => {
            this.renderRequested = false;
            this.renderSync();
        });
    }
    /** Pushes a complete frame to the overlay renderer immediately. */
    renderSync() {
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
        const layoutBadges = [];
        const gridOverlays = [];
        for (const selId of this.selectedIds) {
            const node = this.tree.get(selId);
            if (!node?.currentRect)
                continue;
            // Detect layout mode from the shadow DOM element.
            const wrapper = this.mount.getWrapper(selId);
            if (!wrapper)
                continue;
            // Inspect the user's content root.
            const contentRoot = this.mount.getContentRoot(selId);
            if (!contentRoot)
                continue;
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
        let spacingAdjusters;
        if (this.selectedIds.size === 1 && !this.selectionHandler.isMarqueeSelecting) {
            const selId = this.selectedIds.values().next().value;
            spacingAdjusters = this.computeSpacingAdjusters(selId);
        }
        this.renderer.render({
            viewport: this.viewport,
            nodes: this.getOrderedNodeList(),
            selectedIds: this.selectedIds,
            hoveredId: this.hoveredId,
            activeAnchor: this.resizeHandler.activeAnchor,
            guides: this.guides,
            layoutBadges: layoutBadges.length > 0 ? layoutBadges : undefined,
            gridOverlays: gridOverlays.length > 0 ? gridOverlays : undefined,
            activeDropTarget: this.activeDropTarget,
            marqueeRect: this.getMarqueeRect(),
            spacingAdjusters,
            draggedNodeId: this.dragHandler.isDragging && this.selectedIds.size === 1 ? this.selectedIds.values().next().value : null,
            resizedNodeId: this.resizeHandler.isResizing && this.selectedIds.size === 1 ? this.selectedIds.values().next().value : null,
            drawingRect: this.drawHandler.getDrawingRect(),
            drawingTag: this.drawHandler.isDrawing ? this.drawHandler.getDrawingTag() : null,
            activeRadiusCorner: this.spacingHandler.isAdjustingRadius ? this.spacingHandler.activeRadiusCorner : this.hoveredRadiusCorner,
        });
    }
    // ── Private Helpers ─────────────────────────────
    /** Returns the container's bounding rect as our `Rect`. */
    getContainerRect() {
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
    syncLazyChildren(prev, next) {
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
    registerImmediateChildren(parentId) {
        const wrapper = this.mount.getWrapper(parentId);
        if (!wrapper)
            return;
        const contentRoot = this.mount.getContentRoot(parentId);
        if (!contentRoot)
            return;
        const children = Array.from(contentRoot.children);
        for (const child of children) {
            const tag = child.tagName?.toLowerCase();
            if (!tag || tag === "script" || tag === "style" || tag === "link")
                continue;
            // Use existing id or generate a stable one
            let existingId = child.getAttribute("data-canvus-id") || child.getAttribute("id");
            if (existingId) {
                const hasNodeInTree = !!this.tree.get(existingId);
                const trackedWrapper = this.mount.getWrapper(existingId);
                const trackedContentRoot = this.mount.getContentRoot(existingId);
                // If the ID is tracked but points to a different DOM element, we have an ID conflict.
                if (hasNodeInTree && trackedWrapper !== child && trackedContentRoot !== child) {
                    existingId = null;
                }
            }
            const id = existingId || `${parentId}__child-${++this.lazyChildCounter}`;
            if (!existingId) {
                child.setAttribute("id", id);
            }
            // Skip if already tracked
            if (this.tree.get(id))
                continue;
            // Track the existing DOM element (adds data-canvus-id + ResizeObserver)
            const rect = this.mount.trackExistingElement(id, child);
            // Add to the workspace tree as a child of the parent
            const resolved = resolveNode({
                id,
                rawMarkup: child.outerHTML,
                currentRect: rect,
            });
            resolved.parentId = parentId;
            if (rect)
                resolved.currentRect = rect;
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
    deregisterLazyChildren(parentId) {
        const childNodes = this.tree.getChildren(parentId);
        for (const child of childNodes) {
            if (!this.lazyRegisteredIds.has(child.id))
                continue;
            // Skip children that are currently selected — they're being
            // drilled into and must stay alive in the tree.
            if (this.selectedIds.has(child.id))
                continue;
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
    getOrderedNodeList() {
        return this.tree.flatten();
    }
    getTopLevelSelectedIds() {
        const list = [];
        for (const id of this.selectedIds) {
            let currentId = id;
            let hasSelectedAncestor = false;
            while (currentId !== null) {
                const node = this.tree.get(currentId);
                if (!node)
                    break;
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
    hitTestRadiusHandle(screenX, screenY, bounds, viewport) {
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
    getOtherRects(excludeId) {
        const rects = [];
        for (const node of this.tree.values()) {
            if (node.id !== excludeId && node.currentRect) {
                rects.push(node.currentRect);
            }
        }
        return rects;
    }
    getOtherRectsMultiple(excludeIds) {
        const excludeSet = new Set(excludeIds);
        const rects = [];
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
    remeasureSubtree(id) {
        const rect = this.mount.measureNodeCanvasSpace(id);
        const node = this.tree.get(id);
        if (node) {
            if (rect)
                node.currentRect = rect;
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
                if (dRect)
                    dNode.currentRect = dRect;
                const dContentRoot = this.mount.getContentRoot(did);
                if (dContentRoot) {
                    dNode.layoutMode = detectLayout(dContentRoot).mode;
                }
            }
        }
    }
    /** Ascends selection and scope when Escape key is pressed. */
    handleEscapeKey() {
        if (this.selectedIds.size === 1) {
            const selId = this.selectedIds.values().next().value;
            const node = this.tree.get(selId);
            if (node && node.parentId !== null) {
                this.selectedIds.clear();
                this.selectedIds.add(node.parentId);
                this.enteredContainerId = this.tree.get(node.parentId)?.parentId ?? null;
                this.callbacks.onSelectionChange?.(this.selectedIds);
            }
            else {
                this.deselectAll();
                this.enteredContainerId = null;
            }
        }
        else if (this.enteredContainerId) {
            const parent = this.tree.get(this.enteredContainerId);
            this.enteredContainerId = parent?.parentId ?? null;
        }
        else {
            this.deselectAll();
            this.enteredContainerId = null;
        }
        this.updateBreadcrumb();
        this.render();
    }
    /** Resolves which node is selectable based on click position and scope depth. */
    findSelectableNode(hitId, scopeId) {
        const path = this.tree.getPath(hitId);
        if (path.length === 0)
            return null;
        if (scopeId === null) {
            return path[0]?.id ?? null;
        }
        const scopePath = this.tree.getPath(scopeId);
        let deepestCommonIdxInPath = -1;
        let deepestCommonIdxInScope = -1;
        for (let i = 0; i < path.length; i++) {
            const idx = scopePath.findIndex(n => n.id === path[i].id);
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
            }
            else {
                if (deepestCommonIdxInPath < path.length - 1) {
                    return path[deepestCommonIdxInPath + 1]?.id ?? null;
                }
                return path[deepestCommonIdxInPath]?.id ?? null;
            }
        }
        return path[0]?.id ?? null;
    }
    /** Updates the hovered node ID based on current pointer position and Cmd/Ctrl modifier. */
    updateHover(isCmdPressed) {
        if (!this.lastCanvasPos || this.panHandler.isActive || this.dragHandler.isDragging || this.resizeHandler.isResizing) {
            this.clearDynamicHover();
            this.hoveredId = null;
            return;
        }
        const nodeList = this.getOrderedNodeList();
        const hitId = hitTestElements(this.lastCanvasPos.x, this.lastCanvasPos.y, nodeList);
        let nextHoveredId = null;
        if (hitId) {
            // Skip hover on locked nodes
            if (this.isNodeLocked(hitId)) {
                nextHoveredId = null;
            }
            else if (isCmdPressed) {
                nextHoveredId = hitId;
            }
            else {
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
    clearDynamicHover() {
        if (this.dynamicHoveredId) {
            if (!this.forcedStates.hover.has(this.dynamicHoveredId)) {
                this.setNodeStateClass(this.dynamicHoveredId, "hover", false);
            }
            this.dynamicHoveredId = null;
        }
    }
    setNodeStateClass(nodeId, state, enabled) {
        const wrapper = this.mount.getWrapper(nodeId);
        if (!wrapper)
            return;
        const contentRoot = this.mount.getContentRoot(nodeId);
        const className = `canvus-state-${state}`;
        if (enabled) {
            wrapper.classList.add(className);
            if (contentRoot && contentRoot !== wrapper) {
                contentRoot.classList.add(className);
            }
        }
        else {
            wrapper.classList.remove(className);
            if (contentRoot && contentRoot !== wrapper) {
                contentRoot.classList.remove(className);
            }
        }
        this.remeasureSubtree(nodeId);
        // Delegate pseudo-state forcing if callback or electronAPI is available
        if (this.callbacks.onForcePseudoState) {
            this.callbacks.onForcePseudoState(nodeId, state, enabled);
        }
        else if (typeof window !== "undefined" && window.electronAPI?.forcePseudoState) {
            window.electronAPI.forcePseudoState(nodeId, state, enabled).catch((err) => {
                console.error(`[Workspace] Failed to force pseudo state ${state} on ${nodeId} via electronAPI:`, err);
            });
        }
    }
    /** Updates the active breadcrumbs and calls external callback. */
    updateBreadcrumb() {
        if (this.callbacks.onBreadcrumbChange) {
            if (this.selectedIds.size === 1) {
                const selId = this.selectedIds.values().next().value;
                const path = this.tree.getPath(selId).map(n => n.id);
                this.callbacks.onBreadcrumbChange(path);
            }
            else if (this.enteredContainerId) {
                const path = this.tree.getPath(this.enteredContainerId).map(n => n.id);
                this.callbacks.onBreadcrumbChange(path);
            }
            else {
                this.callbacks.onBreadcrumbChange([]);
            }
        }
    }
    // (getDrawingRect moved to DrawHandler)
    getMarqueeRect() {
        return this.selectionHandler ? this.selectionHandler.getMarqueeRect() : null;
    }
    computeSpacingAdjusters(id) {
        const node = this.tree.get(id);
        if (!node || !node.currentRect)
            return [];
        const contentRoot = this.mount.getContentRoot(id);
        if (!contentRoot)
            return [];
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
        const adjusters = [];
        const addAdjuster = (type, rect, visualRect, value) => {
            if (value > 0 || this.spacingHandler.activeAdjusterType === type) {
                adjusters.push({
                    type,
                    rect,
                    visualRect,
                    value,
                    isHovered: this.hoveredAdjusterType === type,
                    isActive: this.spacingHandler.activeAdjusterType === type,
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
    assertNotDisposed() {
        if (this.disposed) {
            throw new Error("[Workspace] Instance has been disposed.");
        }
    }
    safeSetPointerCapture(pointerId) {
        if (navigator.webdriver || /HeadlessChrome/.test(navigator.userAgent) || /Electron/.test(navigator.userAgent)) {
            return;
        }
        try {
            this.container.setPointerCapture(pointerId);
        }
        catch {
            // Ignore
        }
    }
}
// ── DOM Path Helpers ────────────────────────────────────────
/**
 * Computes a relative DOM index path from a container root to a target element.
 */
function getDOMPath(root, target) {
    const path = [];
    let curr = target;
    while (curr && curr !== root) {
        const parentEl = curr.parentElement;
        if (!parentEl)
            break;
        const index = Array.from(parentEl.children).indexOf(curr);
        path.unshift(index);
        curr = parentEl;
    }
    return path;
}
/**
 * Retrieves a descendant element inside a container root using a DOM index path.
 */
function getDOMElementByPath(root, path) {
    let curr = root;
    for (const index of path) {
        const next = curr.children[index];
        if (!next)
            return null;
        curr = next;
    }
    return curr;
}
/**
 * Checks if the target element of an event is editable (input, textarea, select, or contenteditable).
 */
function isEditableTarget(target) {
    if (!target)
        return false;
    const el = target;
    const tagName = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
    const isContentEditable = el.isContentEditable === true ||
        (typeof el.hasAttribute === "function" && el.hasAttribute("contenteditable")) ||
        (typeof el.getAttribute === "function" && el.getAttribute("contenteditable") !== null);
    return (tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        isContentEditable);
}
//# sourceMappingURL=workspace.js.map