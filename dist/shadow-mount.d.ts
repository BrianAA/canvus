import type { Rect, ViewportMatrix, WebHTMLNode } from "./types.js";
/**
 * Fired when a mounted node's bounding box changes due to
 * content reflow, explicit resize, or initial layout.
 *
 * @param id   - The `WebHTMLNode.id` whose rect changed.
 * @param rect - The new canvas-space bounding rectangle.
 */
export type RectChangeCallback = (id: string, rect: Rect) => void;
/**
 * Manages the Shadow DOM projection layer lifecycle.
 *
 * ### Responsibilities
 * 1. Creates a host `<div>` and attaches an open `ShadowRoot`.
 * 2. Mounts user HTML fragments as isolated, absolutely-positioned
 *    wrapper nodes inside the shadow tree.
 * 3. Applies viewport CSS transforms to keep the shadow layer
 *    visually synchronized with the canvas overlay.
 * 4. Runs a `ResizeObserver` on every mounted wrapper to detect
 *    content reflow and fire `RectChangeCallback` notifications.
 * 5. Provides geometry extraction (`.measureNode`, `.measureAll`)
 *    and the flat string bridge (`.extractHTML`).
 *
 * ### Coordinate Convention
 * All positions stored and returned by this class are in
 * **canvas-space** (world coordinates). The viewport CSS transform
 * on the host element handles the canvas→screen projection.
 */
export declare class ShadowMount {
    /** The host element appended to the user's container. */
    private readonly host;
    /** The open ShadowRoot attached to the host. */
    private readonly shadow;
    /** Map of node ID → internal metadata (wrapper + position). */
    private readonly nodes;
    /**
     * Reverse lookup: wrapper Element → node ID.
     * Required because `ResizeObserver` callbacks receive the
     * observed `Element`, not our application-level ID.
     */
    private readonly elementToId;
    /** Single shared observer watching all mounted wrappers. */
    private readonly resizeObserver;
    /** External rect-change callback, or `null` if none provided. */
    private readonly onRectChange;
    /**
     * Guard flag to suppress ResizeObserver notifications during
     * our own programmatic style mutations (e.g. `setNodeSize`).
     * Prevents feedback loops where our write triggers an
     * observer read that triggers another write.
     */
    private suppressObserver;
    /** Whether `dispose()` has been called. */
    private disposed;
    /**
     * @param container    - The parent DOM element to mount into.
     *                       Typically the workspace root `<div>`.
     * @param onRectChange - Optional callback fired whenever a
     *                       mounted node's bounding rect changes.
     */
    constructor(container: HTMLElement, onRectChange?: RectChangeCallback);
    /**
     * Mounts a `WebHTMLNode` into the shadow tree.
     *
     * Creates an absolutely-positioned wrapper `<div>`, injects
     * the raw markup via `innerHTML`, positions it in canvas-space,
     * and starts observing it for size changes.
     *
     * @param node - The node descriptor to mount.
     * @returns The initial canvas-space bounding rect after the
     *          browser has performed synchronous layout.
     * @throws If a node with the same `id` is already mounted.
     */
    addNode(node: Readonly<WebHTMLNode>): Rect;
    /**
     * Mounts a node as a child of another mounted node.
     *
     * The child wrapper is inserted inside the parent's wrapper
     * (not at the shadow root) and uses `position: relative` so
     * it participates in the parent's CSS layout flow (flex, grid,
     * block).
     *
     * @param node     - The node descriptor to mount.
     * @param parentId - The ID of the parent node.
     * @param index    - Optional insertion index within the parent's
     *                   DOM children. Defaults to appending at the end.
     * @returns The initial canvas-space bounding rect.
     * @throws If the parent is not mounted or the node ID already exists.
     */
    addChildNode(node: Readonly<WebHTMLNode>, parentId: string, index?: number): Rect;
    /**
     * Unmounts and destroys a node by ID.
     *
     * Stops observing, removes the wrapper from the shadow tree,
     * and cleans up all internal references.
     *
     * @param id - The node ID to remove.
     * @returns `true` if the node existed and was removed.
     */
    removeNode(id: string): boolean;
    /**
     * Registers an existing DOM element for tracking without modifying
     * the DOM structure. Used for lazy child registration: when the user
     * drills into a node, its immediate children are tracked so they
     * get hover states, selection handles, resize, and drag.
     *
     * The element receives a `data-canvus-id` attribute for identity,
     * but NO wrapper div is added — CSS selectors remain intact.
     *
     * @param id      - The node ID to assign.
     * @param element - The existing DOM element to track.
     * @returns The element's canvas-space bounding rect, or null.
     */
    trackExistingElement(id: string, element: HTMLElement): Rect | null;
    /**
     * Stops tracking a node without removing the DOM element.
     * The inverse of `trackExistingElement` — cleans up the
     * `data-canvus-id` attribute, ResizeObserver, and internal maps,
     * but leaves the element in the DOM untouched.
     *
     * Used for lazy deregistration when the user drills back up
     * or deselects a parent node.
     *
     * @param id - The node ID to stop tracking.
     * @returns `true` if the node was being tracked and was untracked.
     */
    untrackNode(id: string): boolean;
    /**
     * Moves a node's DOM wrapper from its current parent into a
     * new parent's wrapper at the specified index.
     *
     * If `newParentId` is `null`, the node is moved to the shadow
     * root and becomes absolutely positioned (root-level node).
     *
     * @param id          - The node to move.
     * @param newParentId - The new parent ID, or `null` for root.
     * @param index       - Insertion index in the new parent.
     */
    reparentNodeDOM(id: string, newParentId: string | null, index?: number): void;
    /**
     * Replaces the inner HTML content of an already-mounted node.
     *
     * Preserves the wrapper's position and size constraints.
     * After the markup swap, forces a synchronous layout read
     * and fires the rect-change callback if dimensions changed.
     *
     * @param id     - The mounted node's ID.
     * @param markup - The new raw HTML fragment string.
     * @returns The new canvas-space bounding rect, or `null` if
     *          the node is not mounted.
     */
    updateMarkup(id: string, markup: string): Rect | null;
    /**
     * Returns whether a node with the given ID is currently mounted.
     */
    hasNode(id: string): boolean;
    /**
     * Returns an array of all currently mounted node IDs.
     */
    getNodeIds(): string[];
    /**
     * Applies a CSS transform to the shadow host so that all
     * child wrappers (positioned in canvas-space) are projected
     * correctly onto the screen in sync with the canvas overlay.
     *
     * Must be called every time the viewport changes (pan/zoom).
     *
     * The transform maps canvas-space → screen-space:
     *   `translate(offsetX, offsetY) scale(scale)`
     *
     * @param viewport - The current viewport matrix state.
     */
    applyViewportTransform(viewport: Readonly<ViewportMatrix>): void;
    /**
     * Returns the wrapper DOM element for a mounted node.
     * Useful for layout introspection (reading getComputedStyle).
     *
     * @param id - The node ID.
     * @returns The wrapper element, or `null` if not mounted.
     */
    getWrapper(id: string): HTMLElement | null;
    /**
     * Reads the current canvas-space bounding rect of a mounted
     * node by performing a synchronous layout query.
     *
     * Uses `offsetWidth` / `offsetHeight` (which return pre-transform
     * layout dimensions) combined with our tracked canvas-space
     * position to avoid inverse-transform math.
     *
     * @param id - The node ID to measure.
     * @returns The canvas-space bounding rect, or `null` if not mounted.
     */
    measureNode(id: string): Rect | null;
    /**
     * Batch-measures all mounted nodes in a single pass.
     *
     * Returns a `Map<id, Rect>` of canvas-space bounding rects.
     * Triggers a single synchronous reflow for the entire batch.
     *
     * This is the "Geometry Extraction Loop" from the architecture
     * spec — a fast initialization sweep to populate state caches.
     */
    measureAll(): Map<string, Rect>;
    /**
     * Moves a node to a new canvas-space position by directly
     * mutating its inline `left` / `top` styles.
     *
     * This is the "Transient Style Surgery Pass" for drag-node
     * interactions — no async message bus, just a direct write.
     *
     * @param id - The node ID to reposition.
     * @param x  - New canvas-space X position.
     * @param y  - New canvas-space Y position.
     */
    setNodePosition(id: string, x: number, y: number): void;
    /**
     * Sets explicit width and/or height on a node's wrapper.
     *
     * This is the "Transient Style Surgery Pass" for resize-node
     * interactions. The browser will reflow the inner content
     * (e.g. text wrapping) synchronously, and the ResizeObserver
     * will fire a rect-change callback with the new dimensions.
     *
     * Pass `null` for either dimension to leave it unchanged.
     * Pass `"auto"` to clear an explicit dimension and let content
     * determine the size.
     *
     * @param id     - The node ID to resize.
     * @param width  - New width in canvas-space pixels, `"auto"`, or `null`.
     * @param height - New height in canvas-space pixels, `"auto"`, or `null`.
     */
    setNodeSize(id: string, width: number | "auto" | null, height: number | "auto" | null): void;
    /**
     * Convenience: sets both position and size in a single call.
     * Useful during resize-from-anchor operations where both
     * origin and dimensions change simultaneously.
     */
    setNodeRect(id: string, rect: Readonly<Rect>): void;
    /**
     * Sets a single CSS style property directly on the node's content element
     * (the first child element of the wrapper), and synchronizes width/height
     * wrapper bounds if applicable.
     */
    setNodeStyle(id: string, property: string, value: string | null): void;
    /**
     * Sets multiple CSS style properties directly on the node's content element
     * (the first child element of the wrapper) in a single batch.
     */
    setNodeStyles(id: string, styles: Record<string, string | null>): void;
    /**
     * Computes the canvas-space bounding rect of a node by walking
     * the `offsetLeft`/`offsetTop` chain up to the shadow host.
     *
     * This handles arbitrarily nested elements — each child's offset
     * is accumulated relative to its offsetParent until we reach the
     * shadow host (the transform origin).
     *
     * The result is in **canvas-space** (pre-viewport-transform),
     * consistent with all other rect measurements in the SDK.
     */
    measureNodeCanvasSpace(id: string): Rect | null;
    /**
     * Extracts the pristine semantic HTML string from a mounted
     * node's wrapper. Returns the `.innerHTML` of the wrapper,
     * which is the user's manipulated HTML fragment without any
     * SDK wrapper chrome.
     *
     * This is the "Flat String Bridge" output described in the
     * architecture spec — clean HTML ready for AST commit.
     *
     * @param id - The node ID to extract HTML from.
     * @returns The inner HTML string, or `null` if not mounted.
     */
    extractHTML(id: string): string | null;
    /**
     * Extracts the outer HTML of the wrapper (includes the wrapper
     * `<div>` itself). Useful for debugging or serialization that
     * needs the positioning context.
     *
     * @param id - The node ID to extract.
     * @returns The outer HTML string, or `null` if not mounted.
     */
    extractOuterHTML(id: string): string | null;
    /**
     * Returns the `ShadowRoot` reference.
     * Useful for injecting additional stylesheets (e.g. user theme
     * CSS, Google Fonts `@import`, Tailwind resets).
     */
    getShadowRoot(): ShadowRoot;
    /**
     * Injects an additional `<style>` element into the shadow root.
     * Returns the created element so it can be removed later.
     *
     * @param css - Raw CSS text to inject.
     * @returns The created `HTMLStyleElement`.
     */
    injectStylesheet(css: string): HTMLStyleElement;
    /**
     * Injects a `<link rel="stylesheet">` into the shadow root
     * for loading external CSS (e.g. Google Fonts, Tailwind CDN).
     *
     * @param href - The stylesheet URL.
     * @returns A promise that resolves when the stylesheet loads,
     *          or rejects on error.
     */
    injectStylesheetLink(href: string): Promise<HTMLLinkElement>;
    /**
     * Evaluates a script string inside a scoped closure where 'document' and 'window'
     * are proxied to target the ShadowRoot.
     */
    executeScopedScript(code: string, context?: HTMLElement | ShadowRoot): void;
    /**
     * Tears down the entire shadow mount.
     *
     * Disconnects the ResizeObserver, removes all wrappers,
     * detaches the host element from the DOM, and clears all
     * internal maps. After calling `dispose()`, the instance
     * is inert — all mutating methods will throw.
     */
    dispose(): void;
    /**
     * Reads the canvas-space bounding rect of a mounted wrapper
     * using pre-transform layout dimensions.
     */
    private readWrapperRect;
    /**
     * Returns the content root element for a mounted node.
     * For wrapper-based nodes, this is `wrapper.firstElementChild`.
     * For direct (wrapper-less) nodes, the wrapper IS the content root.
     */
    private getContentRoot;
    /**
     * Processes a batch of `ResizeObserverEntry` records, resolving
     * each observed element back to its node ID and firing the
     * external `onRectChange` callback.
     */
    private handleResizeEntries;
    /** Throws if `dispose()` has been called. */
    private assertNotDisposed;
}
//# sourceMappingURL=shadow-mount.d.ts.map