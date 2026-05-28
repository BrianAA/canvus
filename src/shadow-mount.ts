// ─────────────────────────────────────────────────────────────
// canvus/src/shadow-mount.ts
// Shadow DOM Projection Layer — Lifecycle, Observer, and
// Geometry Extraction Engine.
//
// This module owns the open ShadowRoot that hosts all user HTML
// fragments. It keeps the shadow layer visually synchronized
// with the canvas viewport via CSS transforms, drives a
// ResizeObserver for reflow detection, and exposes the "flat
// string bridge" for clean HTML extraction.
// ─────────────────────────────────────────────────────────────

import type { Rect, ViewportMatrix, WebHTMLNode } from "./types.js";


// ── Callback Contracts ──────────────────────────────────────

/**
 * Fired when a mounted node's bounding box changes due to
 * content reflow, explicit resize, or initial layout.
 *
 * @param id   - The `WebHTMLNode.id` whose rect changed.
 * @param rect - The new canvas-space bounding rectangle.
 */
export type RectChangeCallback = (id: string, rect: Rect) => void;

// ── Internal Node Wrapper Metadata ──────────────────────────

/**
 * Tracks the DOM element and its last-known canvas-space
 * position for each mounted node. Position is stored explicitly
 * rather than parsed back from `style.left` to avoid float
 * round-trip errors.
 */
interface MountedNode {
  /**
   * For root nodes: the absolutely-positioned wrapper `<div>`.
   * For direct (wrapper-less) flow children: the content element itself.
   */
  wrapper: HTMLElement;
  /** Canvas-space X position (matches `wrapper.style.left`). */
  canvasX: number;
  /** Canvas-space Y position (matches `wrapper.style.top`). */
  canvasY: number;
  /**
   * When `true`, `wrapper` IS the content element (no intermediate
   * wrapper div). Used for flow children so CSS selectors like
   * `parent > child` match correctly through the DOM tree.
   */
  isDirect?: boolean;
}

// ── Reset Stylesheet ────────────────────────────────────────

/**
 * Injected into the ShadowRoot to isolate user content from the
 * host application's styles. Resets the `:host` display context
 * and enforces `border-box` sizing on all user elements.
 */
const SHADOW_RESET_CSS = `
:host(.canvus-no-transitions) * {
  transition: none !important;
  animation: none !important;
}

:host {
  all: initial;
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  overflow: visible;
  transform-origin: 0 0;
  pointer-events: none;
}

.canvus-node-wrapper {
  position: absolute;
  pointer-events: auto;
  transform-origin: 0 0;
  overflow: visible;
  display: flex;
  flex-direction: column;
  user-select: none;
  -webkit-user-select: none;
}

.canvus-node-wrapper.canvus-editing {
  user-select: text !important;
  -webkit-user-select: text !important;
}

/* Flow-positioned children inherit their parent's layout mode. */
.canvus-node-wrapper.canvus-flow-child {
  display: contents;
}

.canvus-node-wrapper > * {
  flex: 1 0 auto;
  min-width: 0;
  min-height: 0;
}

.canvus-node-wrapper * {
  box-sizing: border-box;
}
`;

// ── ShadowMount Class ───────────────────────────────────────

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
export class ShadowMount {
  // ── Private State ───────────────────────────────────────

  /** The host element appended to the user's container. */
  private readonly host: HTMLDivElement;

  /** The open ShadowRoot attached to the host. */
  private readonly shadow: ShadowRoot;

  /** Map of node ID → internal metadata (wrapper + position). */
  private readonly nodes = new Map<string, MountedNode>();

  /** Uniform scale applied to host via applied viewport transform. */
  private currentScale = 1;

  /**
   * Reverse lookup: wrapper Element → node ID.
   * Required because `ResizeObserver` callbacks receive the
   * observed `Element`, not our application-level ID.
   */
  private readonly elementToId = new Map<Element, string>();

  /** Single shared observer watching all mounted wrappers. */
  private readonly resizeObserver: ResizeObserver;

  /** External rect-change callback, or `null` if none provided. */
  private readonly onRectChange: RectChangeCallback | null;

  /**
   * Guard flag to suppress ResizeObserver notifications during
   * our own programmatic style mutations (e.g. `setNodeSize`).
   * Prevents feedback loops where our write triggers an
   * observer read that triggers another write.
   */
  private suppressObserver = false;

  /** Whether `dispose()` has been called. */
  private disposed = false;

  // ── Constructor ─────────────────────────────────────────

  /**
   * @param container    - The parent DOM element to mount into.
   *                       Typically the workspace root `<div>`.
   * @param onRectChange - Optional callback fired whenever a
   *                       mounted node's bounding rect changes.
   */
  constructor(
    container: HTMLElement,
    onRectChange?: RectChangeCallback,
  ) {
    this.onRectChange = onRectChange ?? null;

    // ── Host Element ──────────────────────────────────────
    this.host = document.createElement("div");
    this.host.setAttribute("data-canvus-shadow-host", "");

    // ── Shadow Root ───────────────────────────────────────
    this.shadow = this.host.attachShadow({ mode: "open" });

    // Inject the isolation reset stylesheet.
    const style = document.createElement("style");
    style.textContent = SHADOW_RESET_CSS;
    this.shadow.appendChild(style);

    // ── ResizeObserver ────────────────────────────────────
    this.resizeObserver = new ResizeObserver(
      (entries: ResizeObserverEntry[]) => {
        if (this.suppressObserver) return;
        this.handleResizeEntries(entries);
      },
    );

    // Attach to the DOM tree.
    container.appendChild(this.host);
  }

  // ── Node Lifecycle ──────────────────────────────────────

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
  addNode(node: Readonly<WebHTMLNode>): Rect {
    this.assertNotDisposed();

    if (this.nodes.has(node.id)) {
      throw new Error(
        `[ShadowMount] Node "${node.id}" is already mounted. ` +
        `Call removeNode() first or use updateMarkup().`,
      );
    }

    // Check if the wrapper is already present in the shadow tree (e.g. from document importer)
    let wrapper = this.shadow.querySelector(`.canvus-node-wrapper[data-canvus-id="${node.id}"]`) as HTMLDivElement | null;
    const isPreMounted = !!wrapper;

    if (!wrapper) {
      // ── Create Wrapper ──────────────────────────────────
      wrapper = document.createElement("div");
      wrapper.className = "canvus-node-wrapper";
      wrapper.setAttribute("data-canvus-id", node.id);

      // Inject user HTML.
      wrapper.innerHTML = node.rawMarkup;

      // ── Position in Canvas-Space ────────────────────────
      const cx = node.currentRect?.x ?? 0;
      const cy = node.currentRect?.y ?? 0;

      wrapper.style.left = `${cx}px`;
      wrapper.style.top = `${cy}px`;

      // ── Mount to Shadow Tree ────────────────────────────
      this.shadow.appendChild(wrapper);
    }

    // Apply explicit width and height if provided (applies to both pre-mounted and new nodes)
    if (node.currentRect) {
      if (node.currentRect.width > 0) {
        wrapper.style.width = `${node.currentRect.width}px`;
      }
      if (node.currentRect.height > 0) {
        wrapper.style.height = `${node.currentRect.height}px`;
      }
    }

    // ── Position in Canvas-Space ────────────────────────
    const cx = node.currentRect?.x ?? (isPreMounted ? wrapper.offsetLeft : 0);
    const cy = node.currentRect?.y ?? (isPreMounted ? wrapper.offsetTop : 0);

    // ── Sync Grid Styles ────────────────────────────────
    const contentRoot = wrapper.firstElementChild as HTMLElement | null;
    if (contentRoot) {
      const cs = getComputedStyle(contentRoot);
      const gridProps = [
        "grid-column-start",
        "grid-column-end",
        "grid-row-start",
        "grid-row-end",
        "grid-area",
        "grid-column",
        "grid-row",
      ];
      for (const prop of gridProps) {
        const val = cs.getPropertyValue(prop);
        if (val && val !== "auto" && val !== "normal" && val !== "none") {
          wrapper.style.setProperty(prop, val);
        }
      }
    }


    // ── Register Tracking ───────────────────────────────
    const mounted: MountedNode = { wrapper, canvasX: cx, canvasY: cy };
    this.nodes.set(node.id, mounted);
    const targetToObserve = wrapper.firstElementChild as HTMLElement || wrapper;
    this.elementToId.set(targetToObserve, node.id);

    // ── Start Observing Reflow ──────────────────────────
    this.resizeObserver.observe(targetToObserve);

    const dims = this.getBoundingBoxCanvasSpace(targetToObserve);
    const rect: Rect = {
      x: cx,
      y: cy,
      width: dims.width,
      height: dims.height,
    };

    return rect;
  }

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
  addChildNode(
    node: Readonly<WebHTMLNode>,
    parentId: string,
    index?: number,
  ): Rect {
    this.assertNotDisposed();

    if (this.nodes.has(node.id)) {
      throw new Error(
        `[ShadowMount] Node "${node.id}" is already mounted.`,
      );
    }

    const parent = this.nodes.get(parentId);
    if (!parent) {
      throw new Error(
        `[ShadowMount] Parent node "${parentId}" is not mounted.`,
      );
    }

    // ── Locate or create the child element ──────────────────
    // Priority 1: pre-mounted wrapper (legacy path)
    let wrapper = this.shadow.querySelector(
      `.canvus-node-wrapper[data-canvus-id="${node.id}"]`,
    ) as HTMLElement | null;
    let isDirect = false;

    if (!wrapper) {
      // Priority 2: direct element marked by the importer (no wrapper div)
      const directEl = this.shadow.querySelector(
        `[data-canvus-id="${node.id}"]:not(.canvus-node-wrapper)`,
      ) as HTMLElement | null;

      if (directEl) {
        wrapper = directEl;
        isDirect = true;
      }
    }

    if (!wrapper) {
      // Fallback: programmatic addChildNode — insert raw markup directly
      // as a child of the parent's content root, no wrapper div.
      const parentContentRoot = this.getContentRootInternal(parent);
      const insertTarget = parentContentRoot ?? parent.wrapper;

      const temp = document.createElement("div");
      temp.innerHTML = node.rawMarkup;
      const newElement = temp.firstElementChild as HTMLElement;

      if (newElement) {
        newElement.setAttribute("data-canvus-id", node.id);

        // Insert at the specified index if provided.
        const existingChildren = insertTarget.querySelectorAll(
          ":scope > [data-canvus-id]",
        );
        if (index !== undefined && index >= 0 && index < existingChildren.length) {
          insertTarget.insertBefore(newElement, existingChildren[index] ?? null);
        } else {
          insertTarget.appendChild(newElement);
        }

        wrapper = newElement;
        isDirect = true;
      } else {
        // Fallback to wrapper-based approach for text-only nodes
        const wrapperDiv = document.createElement("div");
        wrapperDiv.className = "canvus-node-wrapper canvus-flow-child";
        wrapperDiv.setAttribute("data-canvus-id", node.id);
        wrapperDiv.innerHTML = node.rawMarkup;
        insertTarget.appendChild(wrapperDiv);
        wrapper = wrapperDiv;
      }
    }

    // Apply explicit dimensions if provided.
    if (node.currentRect) {
      if (node.currentRect.width > 0) {
        wrapper.style.width = `${node.currentRect.width}px`;
      }
      if (node.currentRect.height > 0) {
        wrapper.style.height = `${node.currentRect.height}px`;
      }
    }

    // Grid style sync only needed for wrapper-based nodes (the wrapper
    // needs grid placement copied from the content root). Direct elements
    // already participate in the parent grid natively.
    if (!isDirect) {
      const contentRoot = wrapper.firstElementChild as HTMLElement | null;
      if (contentRoot) {
        const cs = getComputedStyle(contentRoot);
        const gridProps = [
          "grid-column-start",
          "grid-column-end",
          "grid-row-start",
          "grid-row-end",
          "grid-area",
          "grid-column",
          "grid-row",
        ];
        for (const prop of gridProps) {
          const val = cs.getPropertyValue(prop);
          if (val && val !== "auto" && val !== "normal" && val !== "none") {
            wrapper.style.setProperty(prop, val);
          }
        }
      }
    }

    // Register tracking.
    const mounted: MountedNode = { wrapper, canvasX: 0, canvasY: 0, isDirect };
    this.nodes.set(node.id, mounted);
    const targetToObserve = isDirect
      ? wrapper
      : (wrapper.firstElementChild as HTMLElement || wrapper);
    this.elementToId.set(targetToObserve, node.id);
    this.resizeObserver.observe(targetToObserve);

    // Measure canvas-space rect (accounts for nesting).
    const rect = this.measureNodeCanvasSpace(node.id) ?? {
      x: 0, y: 0,
      width: this.getBoundingBoxCanvasSpace(targetToObserve).width,
      height: this.getBoundingBoxCanvasSpace(targetToObserve).height,
    };

    // Update tracked position.
    mounted.canvasX = rect.x;
    mounted.canvasY = rect.y;

    return rect;
  }

  /**
   * Unmounts and destroys a node by ID.
   *
   * Stops observing, removes the wrapper from the shadow tree,
   * and cleans up all internal references.
   *
   * @param id - The node ID to remove.
   * @returns `true` if the node existed and was removed.
   */
  removeNode(id: string): boolean {
    const mounted = this.nodes.get(id);
    if (!mounted) return false;

    // Clean up dynamic scripts appended for this node
    const scriptElements = this.shadow.querySelectorAll(`script[data-canvus-script-id^="${id}:"]`);
    for (const el of Array.from(scriptElements)) {
      el.remove();
    }

    const targetToObserve = mounted.isDirect
      ? mounted.wrapper
      : (mounted.wrapper.firstElementChild as HTMLElement || mounted.wrapper);
    this.resizeObserver.unobserve(targetToObserve);
    this.elementToId.delete(targetToObserve);
    mounted.wrapper.remove();
    this.nodes.delete(id);

    return true;
  }

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
  trackExistingElement(id: string, element: HTMLElement): Rect | null {
    this.assertNotDisposed();

    if (this.nodes.has(id)) {
      return this.measureNodeCanvasSpace(id);
    }

    // Tag the element for identity (non-destructive — just a data attribute)
    element.setAttribute("data-canvus-id", id);

    // Register tracking
    const mounted: MountedNode = {
      wrapper: element,
      canvasX: 0,
      canvasY: 0,
      isDirect: true,
    };
    this.nodes.set(id, mounted);
    this.elementToId.set(element, id);
    this.resizeObserver.observe(element);

    // Measure canvas-space rect
    const rect = this.measureNodeCanvasSpace(id) ?? {
      x: 0,
      y: 0,
      width: this.getBoundingBoxCanvasSpace(element).width,
      height: this.getBoundingBoxCanvasSpace(element).height,
    };
    mounted.canvasX = rect.x;
    mounted.canvasY = rect.y;

    return rect;
  }

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
  untrackNode(id: string): boolean {
    const mounted = this.nodes.get(id);
    if (!mounted) return false;

    // Only untrack direct (wrapper-less) nodes.
    // Wrapper-based nodes should use removeNode() instead.
    if (!mounted.isDirect) return false;

    // Stop observing
    this.resizeObserver.unobserve(mounted.wrapper);
    this.elementToId.delete(mounted.wrapper);

    // Clean up the data attribute
    mounted.wrapper.removeAttribute("data-canvus-id");

    // Remove from tracking
    this.nodes.delete(id);

    return true;
  }

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
  reparentNodeDOM(
    id: string,
    newParentId: string | null,
    index?: number,
  ): void {
    const mounted = this.nodes.get(id);
    if (!mounted) return;

    // Suppress observer during reparenting to avoid stale callbacks.
    this.suppressObserver = true;

    // Detach from current location.
    mounted.wrapper.remove();

    if (newParentId === null) {
      // Move to shadow root — become absolutely positioned.
      mounted.wrapper.classList.remove("canvus-flow-child");
      this.shadow.appendChild(mounted.wrapper);
    } else {
      const newParent = this.nodes.get(newParentId);
      if (!newParent) {
        this.suppressObserver = false;
        throw new Error(
          `[ShadowMount] New parent "${newParentId}" is not mounted.`,
        );
      }

      // Become a flow child.
      if (!mounted.isDirect) {
        mounted.wrapper.classList.add("canvus-flow-child");
      }
      mounted.wrapper.style.left = "auto";
      mounted.wrapper.style.top = "auto";

      // Insert into parent's CONTENT ROOT (user's markup root).
      const parentContentRoot = this.getContentRootInternal(newParent);
      const insertTarget = parentContentRoot ?? newParent.wrapper;
      const parentChildren = insertTarget.querySelectorAll(
        ":scope > .canvus-node-wrapper, :scope > [data-canvus-id]",
      );

      if (index !== undefined && index >= 0 && index < parentChildren.length) {
        insertTarget.insertBefore(mounted.wrapper, parentChildren[index] ?? null);
      } else {
        insertTarget.appendChild(mounted.wrapper);
      }
    }

    this.suppressObserver = false;
  }

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
  updateMarkup(id: string, markup: string): Rect | null {
    const mounted = this.nodes.get(id);
    if (!mounted) return null;

    // Suppress observer during our own mutation to avoid
    // a redundant callback before we've finished measuring.
    this.suppressObserver = true;
    mounted.wrapper.innerHTML = markup;

    this.suppressObserver = false;

    // Sync layout read.
    const rect = this.readWrapperRect(mounted);

    // Notify consumer.
    this.onRectChange?.(id, rect);

    return rect;
  }

  /**
   * Returns whether a node with the given ID is currently mounted.
   */
  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /**
   * Returns an array of all currently mounted node IDs.
   */
  getNodeIds(): string[] {
    return Array.from(this.nodes.keys());
  }

  // ── Viewport Synchronization ────────────────────────────

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
  applyViewportTransform(viewport: Readonly<ViewportMatrix>): void {
    this.assertNotDisposed();
    this.currentScale = viewport.scale;
    this.host.style.transform =
      `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`;
  }

  // ── Geometry Extraction ─────────────────────────────────

  /**
   * Returns the wrapper DOM element for a mounted node.
   * Useful for layout introspection (reading getComputedStyle).
   *
   * @param id - The node ID.
   * @returns The wrapper element, or `null` if not mounted.
   */
  getWrapper(id: string): HTMLElement | null {
    return this.nodes.get(id)?.wrapper ?? null;
  }

  /**
   * Returns the content root element for a mounted node by its ID.
   * For wrapper-based nodes, this is `wrapper.firstElementChild`.
   * For direct (wrapper-less) nodes, the wrapper IS the content root.
   *
   * @param id - The node ID.
   * @returns The content root element, or `null` if not mounted.
   */
  getContentRoot(id: string): HTMLElement | null {
    const mounted = this.nodes.get(id);
    if (!mounted) return null;
    return this.getContentRootInternal(mounted);
  }

  /**
   * Temporarily disables or re-enables all CSS transitions and animations
   * inside the shadow DOM (useful to avoid layout lag during drag-and-drop).
   */
  setTransitionsEnabled(enabled: boolean): void {
    if (enabled) {
      this.host.classList.remove("canvus-no-transitions");
    } else {
      this.host.classList.add("canvus-no-transitions");
    }
  }

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
  measureNode(id: string): Rect | null {
    return this.measureNodeCanvasSpace(id);
  }

  /**
   * Batch-measures all mounted nodes in a single pass.
   *
   * Returns a `Map<id, Rect>` of canvas-space bounding rects.
   * Triggers a single synchronous reflow for the entire batch.
   *
   * This is the "Geometry Extraction Loop" from the architecture
   * spec — a fast initialization sweep to populate state caches.
   */
  measureAll(): Map<string, Rect> {
    const results = new Map<string, Rect>();

    for (const id of this.nodes.keys()) {
      const rect = this.measureNodeCanvasSpace(id);
      if (rect) results.set(id, rect);
    }

    return results;
  }

  // ── Style Surgery (Direct Mutation) ─────────────────────

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
  setNodePosition(id: string, x: number, y: number): void {
    const mounted = this.nodes.get(id);
    if (!mounted) return;

    mounted.canvasX = x;
    mounted.canvasY = y;
    mounted.wrapper.style.left = `${x}px`;
    mounted.wrapper.style.top = `${y}px`;
  }

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
  setNodeSize(
    id: string,
    width: number | "auto" | null,
    height: number | "auto" | null,
  ): void {
    const mounted = this.nodes.get(id);
    if (!mounted) return;

    if (width !== null) {
      mounted.wrapper.style.width =
        width === "auto" ? "auto" : `${width}px`;
    }

    if (height !== null) {
      mounted.wrapper.style.height =
        height === "auto" ? "auto" : `${height}px`;
    }
  }

  /**
   * Convenience: sets both position and size in a single call.
   * Useful during resize-from-anchor operations where both
   * origin and dimensions change simultaneously.
   */
  setNodeRect(id: string, rect: Readonly<Rect>): void {
    this.setNodePosition(id, rect.x, rect.y);
    this.setNodeSize(id, rect.width, rect.height);
  }

  /**
   * Sets a single CSS style property directly on the node's content element
   * (the first child element of the wrapper), and synchronizes width/height
   * wrapper bounds if applicable.
   */
  setNodeStyle(id: string, property: string, value: string | null): void {
    const mounted = this.nodes.get(id);
    if (!mounted) return;

    const contentRoot = this.getContentRootInternal(mounted);
    if (!contentRoot) return;

    if (value === null || value === "") {
      contentRoot.style.removeProperty(property);
    } else {
      contentRoot.style.setProperty(property, value);
    }

    // Synchronize geometry styling with SDK wrapper chrome
    // (only needed for wrapper-based nodes)
    if (!mounted.isDirect) {
      if (property === "width") {
        if (value === null || value === "" || value === "auto") {
          this.setNodeSize(id, "auto", null);
        } else if (value.endsWith("px")) {
          const val = parseFloat(value);
          if (!isNaN(val)) this.setNodeSize(id, val, null);
        }
      } else if (property === "height") {
        if (value === null || value === "" || value === "auto") {
          this.setNodeSize(id, null, "auto");
        } else if (value.endsWith("px")) {
          const val = parseFloat(value);
          if (!isNaN(val)) this.setNodeSize(id, null, val);
        }
      }

      // Synchronize grid placement styles with the wrapper
      if (
        property.startsWith("grid-") ||
        property === "grid" ||
        property === "grid-area"
      ) {
        if (value === null || value === "") {
          mounted.wrapper.style.removeProperty(property);
        } else {
          mounted.wrapper.style.setProperty(property, value);
        }
      }
    }
  }

  /**
   * Sets multiple CSS style properties directly on the node's content element
   * (the first child element of the wrapper) in a single batch.
   */
  setNodeStyles(id: string, styles: Record<string, string | null>): void {
    const mounted = this.nodes.get(id);
    if (!mounted) return;

    const contentRoot = this.getContentRootInternal(mounted);
    if (!contentRoot) return;

    for (const [property, value] of Object.entries(styles)) {
      if (value === null || value === "") {
        contentRoot.style.removeProperty(property);
      } else {
        contentRoot.style.setProperty(property, value);
      }

      // Synchronize geometry styling with SDK wrapper chrome
      // (only needed for wrapper-based nodes)
      if (!mounted.isDirect) {
        if (property === "width") {
          if (value === null || value === "" || value === "auto") {
            this.setNodeSize(id, "auto", null);
          } else if (value.endsWith("px")) {
            const val = parseFloat(value);
            if (!isNaN(val)) this.setNodeSize(id, val, null);
          }
        } else if (property === "height") {
          if (value === null || value === "" || value === "auto") {
            this.setNodeSize(id, null, "auto");
          } else if (value.endsWith("px")) {
            const val = parseFloat(value);
            if (!isNaN(val)) this.setNodeSize(id, null, val);
          }
        }

        // Synchronize grid placement styles with the wrapper
        if (
          property.startsWith("grid-") ||
          property === "grid" ||
          property === "grid-area"
        ) {
          if (value === null || value === "") {
            mounted.wrapper.style.removeProperty(property);
          } else {
            mounted.wrapper.style.setProperty(property, value);
          }
        }
      }
    }
  }

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
  measureNodeCanvasSpace(id: string): Rect | null {
    const mounted = this.nodes.get(id);
    if (!mounted) return null;

    const wrapper = mounted.wrapper;
    const target = mounted.isDirect
      ? wrapper
      : ((wrapper.firstElementChild as HTMLElement) || wrapper);

    const rect = this.getBoundingBoxCanvasSpace(target);

    // Update the tracked position.
    mounted.canvasX = rect.x;
    mounted.canvasY = rect.y;

    return rect;
  }

  // ── Flat String Bridge ──────────────────────────────────

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
  extractHTML(id: string): string | null {
    const mounted = this.nodes.get(id);
    if (!mounted) return null;

    // Get the user's content element.
    const contentRoot = this.getContentRootInternal(mounted);
    if (!contentRoot) {
      return mounted.wrapper.innerHTML;
    }

    // Clone the content element to avoid modifying the active DOM.
    const clone = contentRoot.cloneNode(true) as HTMLElement;

    // Remove SDK tracking attribute from the clone.
    if (mounted.isDirect) {
      clone.removeAttribute("data-canvus-id");
    }

    // Clean up forced state classes if present
    clone.classList.remove("canvus-state-hover", "canvus-state-active", "canvus-state-focus");
    const descendantsWithStates = clone.querySelectorAll(".canvus-state-hover, .canvus-state-active, .canvus-state-focus");
    for (const el of descendantsWithStates) {
      el.classList.remove("canvus-state-hover", "canvus-state-active", "canvus-state-focus");
    }

    // Find all child markers (both wrapper-based and direct elements).
    const childMarkers = clone.querySelectorAll(
      ".canvus-node-wrapper[data-canvus-id], [data-canvus-id]",
    );

    for (const marker of childMarkers) {
      // Skip the clone root itself (relevant for direct elements).
      if (marker === clone) continue;

      const childId = marker.getAttribute("data-canvus-id");
      if (childId) {
        // Recursively extract the clean HTML for this child.
        const cleanChildHTML = this.extractHTML(childId);
        if (cleanChildHTML !== null) {
          const temp = document.createElement("div");
          temp.innerHTML = cleanChildHTML;
          const cleanChildNode = temp.firstElementChild;
          if (cleanChildNode) {
            marker.replaceWith(cleanChildNode);
          } else {
            marker.remove();
          }
        } else {
          marker.remove();
        }
      } else {
        marker.remove();
      }
    }

    return clone.outerHTML;
  }

  /**
   * Extracts the outer HTML of the wrapper (includes the wrapper
   * `<div>` itself). Useful for debugging or serialization that
   * needs the positioning context.
   *
   * @param id - The node ID to extract.
   * @returns The outer HTML string, or `null` if not mounted.
   */
  extractOuterHTML(id: string): string | null {
    const mounted = this.nodes.get(id);
    if (!mounted) return null;
    return mounted.wrapper.outerHTML;
  }

  // ── Direct Wrapper Access ───────────────────────────────

  /**
   * Returns the `ShadowRoot` reference.
   * Useful for injecting additional stylesheets (e.g. user theme
   * CSS, Google Fonts `@import`, Tailwind resets).
   */
  getShadowRoot(): ShadowRoot {
    return this.shadow;
  }

  // ── Stylesheet Injection ────────────────────────────────

  /**
   * Injects an additional `<style>` element into the shadow root.
   * Returns the created element so it can be removed later.
   *
   * @param css - Raw CSS text to inject.
   * @returns The created `HTMLStyleElement`.
   */
  injectStylesheet(css: string): HTMLStyleElement {
    this.assertNotDisposed();
    const el = document.createElement("style");
    el.textContent = rewriteForShadowDOM(css);
    this.shadow.appendChild(el);
    return el;
  }

  /**
   * Injects a `<link rel="stylesheet">` into the shadow root
   * for loading external CSS (e.g. Google Fonts, Tailwind CDN).
   *
   * @param href - The stylesheet URL.
   * @returns A promise that resolves when the stylesheet loads,
   *          or rejects on error.
   */
  injectStylesheetLink(href: string): Promise<HTMLLinkElement> {
    this.assertNotDisposed();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;

    const promise = new Promise<HTMLLinkElement>((resolve, reject) => {
      link.onload = () => resolve(link);
      link.onerror = () =>
        reject(new Error(`[ShadowMount] Failed to load stylesheet: ${href}`));
    });

    this.shadow.appendChild(link);
    return promise;
  }



  /**
   * Evaluates a script string inside a scoped closure where 'document' and 'window'
   * are proxied to target the ShadowRoot.
   */
  executeScopedScript(code: string, context?: HTMLElement | ShadowRoot): void {
    this.assertNotDisposed();
    const shadowRoot = this.shadow;
    const callContext = context ?? shadowRoot.firstElementChild ?? shadowRoot;


    const documentProxy = new Proxy(document, {
      get(target, prop, receiver) {
        if (
          prop === "querySelector" ||
          prop === "querySelectorAll" ||
          prop === "getElementById" ||
          prop === "getElementsByClassName" ||
          prop === "getElementsByTagName"
        ) {
          const shadowMethod = shadowRoot[prop as keyof ShadowRoot];
          if (typeof shadowMethod === "function") {
            return (...args: any[]) => {
              return (shadowMethod as Function).apply(shadowRoot, args);
            };
          }
        }
        if (prop === "body") {
          return shadowRoot.firstElementChild || shadowRoot;
        }
        const val = Reflect.get(target, prop, receiver);
        if (typeof val === "function") {
          return val.bind(target);
        }
        return val;
      }
    });

    const windowProxy = new Proxy(window, {
      get(target, prop, receiver) {
        if (prop === "document") {
          return documentProxy;
        }
        const val = Reflect.get(target, prop, receiver);
        if (typeof val === "function") {
          return val.bind(target);
        }
        return val;
      }
    });

    try {
      const fn = new Function("document", "window", code);
      fn.call(callContext, documentProxy, windowProxy);
    } catch (err) {
      console.error(`[ShadowMount] Error executing scoped script:`, err);
    }
  }

  // ── Disposal ────────────────────────────────────────────

  /**
   * Tears down the entire shadow mount.
   *
   * Disconnects the ResizeObserver, removes all wrappers,
   * detaches the host element from the DOM, and clears all
   * internal maps. After calling `dispose()`, the instance
   * is inert — all mutating methods will throw.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.resizeObserver.disconnect();
    this.elementToId.clear();
    this.nodes.clear();
    this.host.remove();
  }

  // ── Private Helpers ─────────────────────────────────────

  /**
   * Reads the canvas-space bounding rect of a mounted wrapper
   * using pre-transform layout dimensions.
   */
  private readWrapperRect(mounted: MountedNode): Rect {
    return this.getBoundingBoxCanvasSpace(mounted.wrapper);
  }

  /**
   * Computes the bounding box of an element in canvas-space relative to the shadow host.
   * Handles scale adjustments correctly and is robust for all elements including SVGs.
   */
  private getBoundingBoxCanvasSpace(el: HTMLElement): Rect {
    const elRect = el.getBoundingClientRect();
    const hostRect = this.host.getBoundingClientRect();
    const scale = this.currentScale || 1;
    return {
      x: (elRect.left - hostRect.left) / scale,
      y: (elRect.top - hostRect.top) / scale,
      width: elRect.width / scale,
      height: elRect.height / scale,
    };
  }

  /**
   * Returns the content root element for a mounted node.
   * For wrapper-based nodes, this is `wrapper.firstElementChild`.
   * For direct (wrapper-less) nodes, the wrapper IS the content root.
   */
  private getContentRootInternal(mounted: MountedNode): HTMLElement | null {
    if (mounted.isDirect) {
      return mounted.wrapper;
    }
    return mounted.wrapper.firstElementChild as HTMLElement | null;
  }

  /**
   * Processes a batch of `ResizeObserverEntry` records, resolving
   * each observed element back to its node ID and firing the
   * external `onRectChange` callback.
   */
  private handleResizeEntries(entries: ResizeObserverEntry[]): void {
    if (!this.onRectChange) return;

    for (const entry of entries) {
      const id = this.elementToId.get(entry.target);
      if (!id) continue;

      const rect = this.measureNodeCanvasSpace(id);
      if (rect) {
        this.onRectChange(id, rect);
      }
    }
  }



  /** Throws if `dispose()` has been called. */
  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error(
        "[ShadowMount] Instance has been disposed. " +
        "Create a new ShadowMount to continue.",
      );
    }
  }
}

// ── Minimal CSS Rewriting for Shadow DOM ───────────────────

/**
 * Performs minimal CSS rewriting for Shadow DOM compatibility.
 * Only rewrites `body`, `html`, and `:root` selectors to `:host`
 * so that page-level styles work correctly inside the shadow tree.
 *
 * This is intentionally minimal — forced-state duplication,
 * @-rule handling, and advanced CSS transforms are the
 * host application's responsibility.
 */
function rewriteForShadowDOM(css: string): string {
  return css
    .replace(/(?<![.\-\w])body(?![.\-\w])/g, ":host")
    .replace(/(?<![.\-\w])html(?![.\-\w])/g, ":host")
    .replace(/(^|[\s,]):root\b/gm, "$1:host");
}


