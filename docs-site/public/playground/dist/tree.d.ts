import type { Rect, ResolvedNode } from "./types.js";
/**
 * In-memory tree structure backed by a flat `Map` with
 * parent/child adjacency encoded in each `ResolvedNode`.
 *
 * Designed for O(1) lookup by ID and O(children) traversal.
 * The tree invariant is maintained by the mutation functions
 * in this module — never modify `parentId` / `childIds`
 * directly on the nodes.
 */
export declare class NodeTree {
    private readonly nodes;
    /** Returns a node by ID, or `undefined` if not found. */
    get(id: string): ResolvedNode | undefined;
    /** Returns whether a node with the given ID exists. */
    has(id: string): boolean;
    /** Returns the total number of nodes in the tree. */
    get size(): number;
    /** Iterates all nodes (unordered). */
    values(): IterableIterator<ResolvedNode>;
    /** Iterates all [id, node] entries. */
    entries(): IterableIterator<[string, ResolvedNode]>;
    /** Returns all root-level nodes (parentId === null), in insertion order. */
    getRoots(): ResolvedNode[];
    /** Returns the IDs of all root-level nodes. */
    getRootIds(): string[];
    /**
     * Adds a node to the tree.
     *
     * If `parentId` is set and the parent exists, the node is
     * appended to the parent's `childIds` (or inserted at `index`).
     * The node's `depth` is automatically computed.
     *
     * @param node  - The resolved node to add.
     * @param index - Optional insertion index within the parent's
     *                children. Defaults to appending at the end.
     * @throws If a node with the same ID already exists.
     * @throws If the specified parent does not exist.
     */
    addNode(node: ResolvedNode, index?: number): void;
    /**
     * Removes a node and all its descendants from the tree.
     *
     * Also removes the node from its parent's `childIds`.
     *
     * @returns Array of all removed node IDs (including descendants).
     */
    removeNode(id: string): string[];
    /**
     * Moves a node from its current parent to a new parent
     * at the specified index.
     *
     * Handles:
     * - Removing from old parent's `childIds`
     * - Adding to new parent's `childIds` at `index`
     * - Recursively updating `depth` for the moved subtree
     * - Preventing circular references (cannot move a node
     *   into its own descendant)
     *
     * @param nodeId      - The node to move.
     * @param newParentId - The new parent ID, or `null` for root.
     * @param index       - Insertion index in the new parent's
     *                       children. Defaults to appending.
     * @throws If the move would create a cycle.
     */
    reparentNode(nodeId: string, newParentId: string | null, index?: number): void;
    /**
     * Reorders a child within its current parent.
     *
     * @param nodeId   - The child node to move.
     * @param newIndex - The new index within the parent's children.
     */
    reorderChild(nodeId: string, newIndex: number): void;
    /** Returns the parent node, or `undefined` for root nodes. */
    getParent(id: string): ResolvedNode | undefined;
    /** Returns all children of a node, in order. */
    getChildren(id: string): ResolvedNode[];
    /** Returns sibling nodes (same parent, excluding self). */
    getSiblings(id: string): ResolvedNode[];
    /**
     * Returns the ancestor chain from the node up to the root.
     * First element is the immediate parent, last is the root.
     */
    getAncestors(id: string): ResolvedNode[];
    /**
     * Returns the full path from root to node.
     * First element is the root ancestor, last is the node itself.
     */
    getPath(id: string): ResolvedNode[];
    /** Returns all descendant node IDs (recursive children). */
    getDescendantIds(id: string): string[];
    /** Returns all descendant nodes (recursive children), depth-first. */
    getDescendants(id: string): ResolvedNode[];
    /**
     * Returns whether `ancestorId` is an ancestor of `descendantId`.
     */
    isAncestor(ancestorId: string, descendantId: string): boolean;
    /**
     * Returns the child index of a node within its parent's children.
     * Returns `-1` for root nodes or if the node is not found.
     */
    getChildIndex(id: string): number;
    /**
     * Returns all nodes in depth-first order.
     * This is the standard rendering order: parents before children.
     */
    flatten(): ResolvedNode[];
    /**
     * Returns all nodes in reverse depth-first order.
     * This is the hit-testing order: deepest children first.
     */
    flattenReverse(): ResolvedNode[];
    /** Returns whether a node has any children, or is styled as a layout container. */
    isContainer(id: string): boolean;
    /** Returns whether a node is a leaf (no children). */
    isLeaf(id: string): boolean;
    /** Returns whether a node is at the root level. */
    isRoot(id: string): boolean;
    /** Clears all nodes from the tree. */
    clear(): void;
    /**
     * Returns a debug snapshot of the tree structure as a
     * human-readable indented string.
     */
    toDebugString(): string;
}
/**
 * Computes the aggregate bounding box of a set of nodes.
 * Returns `null` if no nodes have measured rects.
 */
export declare function computeAggregateBounds(nodes: ReadonlyArray<Readonly<{
    currentRect: Rect | null;
}>>): Rect | null;
//# sourceMappingURL=tree.d.ts.map