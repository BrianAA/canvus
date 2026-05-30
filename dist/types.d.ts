/** An immutable 2-component vector used for positions and deltas. */
export interface Vec2 {
    readonly x: number;
    readonly y: number;
}
/** Axis-aligned bounding box — the universal rectangle primitive. */
export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
/**
 * Affine viewport transform expressed as a uniform scale factor
 * and a 2D translation offset (pan vector).
 *
 * Screen coordinates relate to canvas coordinates by:
 *   screenX = canvasX * scale + offsetX
 *   screenY = canvasY * scale + offsetY
 *
 * Inverse (canvas from screen):
 *   canvasX = (screenX - offsetX) / scale
 *   canvasY = (screenY - offsetY) / scale
 */
export interface ViewportMatrix {
    /** Uniform zoom multiplier. Clamped within [ZOOM_MIN, ZOOM_MAX]. */
    scale: number;
    /** Horizontal pan offset in screen pixels. */
    offsetX: number;
    /** Vertical pan offset in screen pixels. */
    offsetY: number;
}
/** Hard zoom boundaries to prevent degenerate transforms. */
export declare const ZOOM_MIN = 0.1;
export declare const ZOOM_MAX = 4;
/**
 * Detected CSS `display` layout mode for a container node.
 * Used to determine flow direction, drop zone behavior, and
 * visual overlay badges.
 */
export type LayoutMode = "block" | "flex" | "grid" | "inline" | "inline-flex" | "inline-grid" | "none";
/**
 * Canonical descriptor for a single managed HTML element
 * projected inside the Shadow DOM mount layer.
 *
 * In v1.0, all nodes are flat siblings at the shadow root.
 * In v1.1+, nodes form a tree via `parentId` / `childIds`.
 * Root-level nodes (parentId === null) remain absolutely
 * positioned; children participate in their parent's CSS
 * layout flow (flex, grid, block, etc.).
 */
export interface WebHTMLNode {
    /** Unique selector key used to address the element in the shadow tree. */
    id: string;
    /** The clean, unpolluted semantic HTML fragment source string. */
    rawMarkup: string;
    /**
     * Live bounding-box cache populated from layout measurement.
     * Coordinates are always in **canvas-space** (world coordinates),
     * regardless of nesting depth.
     * `null` when the node has not yet been measured after mount.
     */
    currentRect: Rect | null;
    /**
     * ID of the parent node, or `null` for root-level nodes
     * (direct children of the shadow root).
     * @default null
     */
    parentId?: string | null;
    /**
     * Ordered list of child node IDs. Empty array means leaf node
     * or container with no managed children.
     * @default []
     */
    childIds?: readonly string[];
    /**
     * Detected CSS layout mode of this node's content box.
     * Only meaningful for container nodes. Populated by the
     * layout introspection engine.
     * @default null
     */
    layoutMode?: LayoutMode | null;
    /**
     * Nesting depth in the tree. 0 = root-level, 1 = first child, etc.
     * @default 0
     */
    depth?: number;
}
/**
 * Fully resolved internal node representation with all tree
 * fields guaranteed present (not optional). Used inside the
 * workspace engine after normalization.
 */
export interface ResolvedNode {
    readonly id: string;
    rawMarkup: string;
    currentRect: Rect | null;
    parentId: string | null;
    childIds: string[];
    layoutMode: LayoutMode | null;
    depth: number;
}
/**
 * Normalizes a user-provided `WebHTMLNode` into a fully resolved
 * internal representation with all tree fields populated.
 */
export declare function resolveNode(node: Readonly<WebHTMLNode>): ResolvedNode;
/** Cardinal + intercardinal anchor positions on a selection frame. */
export type ResizeAnchor = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
/** Discriminated active interaction modes. */
export type InteractionMode = "pan" | "drag-node" | "resize-node" | "reparent" | "reorder" | "select-marquee" | "adjust-spacing" | "draw-node" | "resize-radius" | null;
/**
 * Transient drag/resize interaction descriptor.
 * Captures the pointer-down origin and the specific handle or node
 * being manipulated so delta calculations stay frame-coherent.
 */
export interface DragHandleState {
    /** Which interaction gesture is currently active, or `null` at rest. */
    activeMode: InteractionMode;
    /** The `WebHTMLNode.id` of the node being dragged or resized. */
    targetNodeId: string | null;
    /**
     * Which of the 8 resize anchors is being pulled.
     * Only meaningful when `activeMode === "resize-node"`.
     */
    selectedAnchor: ResizeAnchor | null;
    /**
     * The pointer position (in canvas-space) at the moment the
     * gesture began. Used for computing frame-relative deltas.
     */
    initialPointerPos: Vec2;
}
/** Returns a clean, idle `DragHandleState` with no active gesture. */
export declare function createIdleDragState(): DragHandleState;
/** Returns a default viewport at 1:1 scale with zero pan offset. */
export declare function createDefaultViewport(): ViewportMatrix;
/** Supported tool types for drawing. */
export type CanvusTool = "box" | "text" | null;
/** Supported operation types for visual editor changes. */
export type OperationType = "update-style" | "update-classes" | "reparent" | "reorder" | "update-text" | "create-node" | "delete-node";
/** Serialized atomic modification block for undo/redo & collaborative synchronization. */
export interface Operation {
    /** The action type class name. */
    type: OperationType;
    /** Selector ID of the target content node. */
    nodeId: string;
    /** Specific delta payload for applying this change. */
    payload: any;
    /** Reciprocal delta payload to undo this change. */
    undoPayload: any;
}
//# sourceMappingURL=types.d.ts.map