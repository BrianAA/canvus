// ─────────────────────────────────────────────────────────────
// canvus/src/tree.ts
// Node Tree Model — Parent-child traversal, manipulation, and
// structural query utilities for the nested DOM hierarchy.
//
// All functions are pure (no side effects, no DOM access).
// They operate on the `ResolvedNode` type from types.ts.
// ─────────────────────────────────────────────────────────────
// ── Node Tree ───────────────────────────────────────────────
/**
 * In-memory tree structure backed by a flat `Map` with
 * parent/child adjacency encoded in each `ResolvedNode`.
 *
 * Designed for O(1) lookup by ID and O(children) traversal.
 * The tree invariant is maintained by the mutation functions
 * in this module — never modify `parentId` / `childIds`
 * directly on the nodes.
 */
export class NodeTree {
    nodes = new Map();
    // ── Accessors ─────────────────────────────────
    /** Returns a node by ID, or `undefined` if not found. */
    get(id) {
        return this.nodes.get(id);
    }
    /** Returns whether a node with the given ID exists. */
    has(id) {
        return this.nodes.has(id);
    }
    /** Returns the total number of nodes in the tree. */
    get size() {
        return this.nodes.size;
    }
    /** Iterates all nodes (unordered). */
    values() {
        return this.nodes.values();
    }
    /** Iterates all [id, node] entries. */
    entries() {
        return this.nodes.entries();
    }
    // ── Root Nodes ────────────────────────────────
    /** Returns all root-level nodes (parentId === null), in insertion order. */
    getRoots() {
        const roots = [];
        for (const node of this.nodes.values()) {
            if (node.parentId === null)
                roots.push(node);
        }
        return roots;
    }
    /** Returns the IDs of all root-level nodes. */
    getRootIds() {
        return this.getRoots().map(n => n.id);
    }
    // ── Insertion ─────────────────────────────────
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
    addNode(node, index) {
        if (this.nodes.has(node.id)) {
            throw new Error(`[NodeTree] Node "${node.id}" already exists.`);
        }
        // Validate parent.
        if (node.parentId !== null) {
            const parent = this.nodes.get(node.parentId);
            if (!parent) {
                throw new Error(`[NodeTree] Parent "${node.parentId}" does not exist.`);
            }
            // Set depth relative to parent.
            node.depth = parent.depth + 1;
            // Insert into parent's child list.
            if (index !== undefined && index >= 0 && index < parent.childIds.length) {
                parent.childIds.splice(index, 0, node.id);
            }
            else {
                parent.childIds.push(node.id);
            }
        }
        else {
            node.depth = 0;
        }
        this.nodes.set(node.id, node);
    }
    /**
     * Removes a node and all its descendants from the tree.
     *
     * Also removes the node from its parent's `childIds`.
     *
     * @returns Array of all removed node IDs (including descendants).
     */
    removeNode(id) {
        const node = this.nodes.get(id);
        if (!node)
            return [];
        // Collect all descendants (depth-first).
        const removed = getDescendantIds(id, this.nodes);
        removed.push(id);
        // Remove from parent's child list.
        if (node.parentId !== null) {
            const parent = this.nodes.get(node.parentId);
            if (parent) {
                const idx = parent.childIds.indexOf(id);
                if (idx !== -1)
                    parent.childIds.splice(idx, 1);
            }
        }
        // Delete all removed nodes from the map.
        for (const rid of removed) {
            this.nodes.delete(rid);
        }
        return removed;
    }
    // ── Reparenting ───────────────────────────────
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
    reparentNode(nodeId, newParentId, index) {
        const node = this.nodes.get(nodeId);
        if (!node)
            throw new Error(`[NodeTree] Node "${nodeId}" not found.`);
        // ── Cycle prevention ──────────────────────────
        if (newParentId !== null) {
            if (nodeId === newParentId) {
                throw new Error(`[NodeTree] Cannot parent "${nodeId}" to itself.`);
            }
            if (isAncestor(nodeId, newParentId, this.nodes)) {
                throw new Error(`[NodeTree] Cannot move "${nodeId}" into its own descendant "${newParentId}".`);
            }
        }
        // ── Remove from old parent ────────────────────
        if (node.parentId !== null) {
            const oldParent = this.nodes.get(node.parentId);
            if (oldParent) {
                const idx = oldParent.childIds.indexOf(nodeId);
                if (idx !== -1)
                    oldParent.childIds.splice(idx, 1);
            }
        }
        // ── Insert into new parent ────────────────────
        node.parentId = newParentId;
        if (newParentId !== null) {
            const newParent = this.nodes.get(newParentId);
            if (!newParent) {
                throw new Error(`[NodeTree] New parent "${newParentId}" not found.`);
            }
            if (index !== undefined && index >= 0 && index <= newParent.childIds.length) {
                newParent.childIds.splice(index, 0, nodeId);
            }
            else {
                newParent.childIds.push(nodeId);
            }
            // Update depth for moved subtree.
            updateDepthRecursive(nodeId, newParent.depth + 1, this.nodes);
        }
        else {
            // Moving to root level.
            updateDepthRecursive(nodeId, 0, this.nodes);
        }
    }
    /**
     * Reorders a child within its current parent.
     *
     * @param nodeId   - The child node to move.
     * @param newIndex - The new index within the parent's children.
     */
    reorderChild(nodeId, newIndex) {
        const node = this.nodes.get(nodeId);
        if (!node || node.parentId === null)
            return;
        const parent = this.nodes.get(node.parentId);
        if (!parent)
            return;
        const oldIndex = parent.childIds.indexOf(nodeId);
        if (oldIndex === -1)
            return;
        // Remove and re-insert.
        parent.childIds.splice(oldIndex, 1);
        const clampedIndex = Math.min(newIndex, parent.childIds.length);
        parent.childIds.splice(clampedIndex, 0, nodeId);
    }
    // ── Query ─────────────────────────────────────
    /** Returns the parent node, or `undefined` for root nodes. */
    getParent(id) {
        const node = this.nodes.get(id);
        if (!node?.parentId)
            return undefined;
        return this.nodes.get(node.parentId);
    }
    /** Returns all children of a node, in order. */
    getChildren(id) {
        const node = this.nodes.get(id);
        if (!node)
            return [];
        return node.childIds
            .map(cid => this.nodes.get(cid))
            .filter((n) => n !== undefined);
    }
    /** Returns sibling nodes (same parent, excluding self). */
    getSiblings(id) {
        const node = this.nodes.get(id);
        if (!node)
            return [];
        if (node.parentId === null) {
            // Root-level siblings.
            return this.getRoots().filter(n => n.id !== id);
        }
        const parent = this.nodes.get(node.parentId);
        if (!parent)
            return [];
        return parent.childIds
            .filter(cid => cid !== id)
            .map(cid => this.nodes.get(cid))
            .filter((n) => n !== undefined);
    }
    /**
     * Returns the ancestor chain from the node up to the root.
     * First element is the immediate parent, last is the root.
     */
    getAncestors(id) {
        const chain = [];
        let current = this.nodes.get(id);
        while (current?.parentId) {
            const parent = this.nodes.get(current.parentId);
            if (!parent)
                break;
            chain.push(parent);
            current = parent;
        }
        return chain;
    }
    /**
     * Returns the full path from root to node.
     * First element is the root ancestor, last is the node itself.
     */
    getPath(id) {
        const ancestors = this.getAncestors(id);
        ancestors.reverse();
        const node = this.nodes.get(id);
        if (node)
            ancestors.push(node);
        return ancestors;
    }
    /** Returns all descendant node IDs (recursive children). */
    getDescendantIds(id) {
        return getDescendantIds(id, this.nodes);
    }
    /** Returns all descendant nodes (recursive children), depth-first. */
    getDescendants(id) {
        return this.getDescendantIds(id)
            .map(did => this.nodes.get(did))
            .filter((n) => n !== undefined);
    }
    /**
     * Returns whether `ancestorId` is an ancestor of `descendantId`.
     */
    isAncestor(ancestorId, descendantId) {
        return isAncestor(ancestorId, descendantId, this.nodes);
    }
    /**
     * Returns the child index of a node within its parent's children.
     * Returns `-1` for root nodes or if the node is not found.
     */
    getChildIndex(id) {
        const node = this.nodes.get(id);
        if (!node?.parentId)
            return -1;
        const parent = this.nodes.get(node.parentId);
        if (!parent)
            return -1;
        return parent.childIds.indexOf(id);
    }
    // ── Flattening ────────────────────────────────
    /**
     * Returns all nodes in depth-first order.
     * This is the standard rendering order: parents before children.
     */
    flatten() {
        const result = [];
        const roots = this.getRoots();
        const walk = (node) => {
            result.push(node);
            for (const childId of node.childIds) {
                const child = this.nodes.get(childId);
                if (child)
                    walk(child);
            }
        };
        for (const root of roots) {
            walk(root);
        }
        return result;
    }
    /**
     * Returns all nodes in reverse depth-first order.
     * This is the hit-testing order: deepest children first.
     */
    flattenReverse() {
        return this.flatten().reverse();
    }
    // ── Container Queries ─────────────────────────
    /** Returns whether a node has any children, or is styled as a layout container. */
    isContainer(id) {
        const node = this.nodes.get(id);
        if (!node)
            return false;
        if (node.childIds.length > 0 ||
            node.layoutMode === "flex" ||
            node.layoutMode === "grid" ||
            node.layoutMode === "inline-flex" ||
            node.layoutMode === "inline-grid") {
            return true;
        }
        if (node.rawMarkup) {
            const match = node.rawMarkup.trim().match(/^<([a-zA-Z0-9-]+)/);
            if (match && match[1]) {
                const tag = match[1].toLowerCase();
                const nonContainerTags = new Set([
                    "p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "img", "br", "hr",
                    "input", "button", "textarea", "select", "a", "strong", "em", "code", "pre"
                ]);
                return !nonContainerTags.has(tag);
            }
        }
        return false;
    }
    /** Returns whether a node is a leaf (no children). */
    isLeaf(id) {
        return !this.isContainer(id);
    }
    /** Returns whether a node is at the root level. */
    isRoot(id) {
        const node = this.nodes.get(id);
        return node ? node.parentId === null : false;
    }
    // ── Bulk Operations ───────────────────────────
    /** Clears all nodes from the tree. */
    clear() {
        this.nodes.clear();
    }
    /**
     * Returns a debug snapshot of the tree structure as a
     * human-readable indented string.
     */
    toDebugString() {
        const lines = [];
        const walk = (node, indent) => {
            const pad = "  ".repeat(indent);
            const mode = node.layoutMode ? ` [${node.layoutMode}]` : "";
            const rect = node.currentRect
                ? ` (${node.currentRect.x},${node.currentRect.y} ${node.currentRect.width}×${node.currentRect.height})`
                : " (unmeasured)";
            lines.push(`${pad}${node.id}${mode}${rect}`);
            for (const childId of node.childIds) {
                const child = this.nodes.get(childId);
                if (child)
                    walk(child, indent + 1);
            }
        };
        for (const root of this.getRoots()) {
            walk(root, 0);
        }
        return lines.join("\n");
    }
}
// ── Pure Helper Functions ───────────────────────────────────
/**
 * Recursively collects all descendant IDs of a node.
 * Does NOT include the node itself.
 */
function getDescendantIds(id, nodes) {
    const result = [];
    const node = nodes.get(id);
    if (!node)
        return result;
    for (const childId of node.childIds) {
        result.push(childId);
        result.push(...getDescendantIds(childId, nodes));
    }
    return result;
}
/**
 * Checks whether `candidateAncestorId` is an ancestor of `descendantId`.
 */
function isAncestor(candidateAncestorId, descendantId, nodes) {
    let current = nodes.get(descendantId);
    while (current?.parentId) {
        if (current.parentId === candidateAncestorId)
            return true;
        current = nodes.get(current.parentId);
    }
    return false;
}
/**
 * Recursively updates the `depth` field for a node and all its descendants.
 */
function updateDepthRecursive(nodeId, newDepth, nodes) {
    const node = nodes.get(nodeId);
    if (!node)
        return;
    node.depth = newDepth;
    for (const childId of node.childIds) {
        updateDepthRecursive(childId, newDepth + 1, nodes);
    }
}
// ── Aggregate Bounds ────────────────────────────────────────
/**
 * Computes the aggregate bounding box of a set of nodes.
 * Returns `null` if no nodes have measured rects.
 */
export function computeAggregateBounds(nodes) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
        if (!node.currentRect)
            continue;
        const r = node.currentRect;
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
    }
    if (!isFinite(minX))
        return null;
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}
//# sourceMappingURL=tree.js.map