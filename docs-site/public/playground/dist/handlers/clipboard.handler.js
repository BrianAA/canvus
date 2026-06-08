// ─────────────────────────────────────────────────────────────
// canvus/src/handlers/clipboard.handler.ts
// Handles clipboard keyboard shortcuts and operations: copy, cut, paste, duplicate, delete.
// ─────────────────────────────────────────────────────────────
/**
 * Manages copy, cut, paste, duplicate, and delete operations.
 */
export class ClipboardHandler {
    id = "clipboard";
    ctx;
    clipboardItems = [];
    constructor(ctx) {
        this.ctx = ctx;
    }
    // ── KeyboardHandler Interface ───────────────────────
    onKeyDown(e) {
        if (e.key === "Delete" || e.key === "Backspace") {
            if (!e.metaKey && !e.ctrlKey) {
                this.deleteSelectedNode();
                return true;
            }
        }
        else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
            e.preventDefault();
            this.duplicateSelectedNode();
            return true;
        }
        else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
            this.copySelectedNode();
            return true;
        }
        else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "x") {
            this.cutSelectedNode();
            return true;
        }
        else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
            this.pasteNode();
            return true;
        }
        return false;
    }
    // ── Public API Methods ──────────────────────────────
    /** Deletes the currently selected node from the workspace. */
    deleteSelectedNode() {
        const topLevelIds = this.ctx.getTopLevelSelectedIds();
        if (topLevelIds.length === 0)
            return;
        this.ctx.mount.setTransitionsEnabled(false);
        const ops = [];
        const parentsToRemeasure = new Set();
        for (const id of topLevelIds) {
            const node = this.ctx.tree.get(id);
            if (!node)
                continue;
            const parentId = node.parentId;
            const rawMarkup = node.rawMarkup;
            const rect = node.currentRect;
            const removed = this.ctx.removeNode(id);
            if (removed) {
                ops.push({
                    type: "delete-node",
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
            this.ctx.callbacks.onOperationsGenerated?.(ops);
            // Commit HTML for affected parent containers or root
            for (const parentId of parentsToRemeasure) {
                this.ctx.remeasureSubtree(parentId);
                const html = this.ctx.mount.extractHTML(parentId);
                if (html) {
                    this.ctx.callbacks.onHTMLCommit?.(parentId, html);
                }
            }
            // If any deleted node was a root node, commit HTML for it
            for (const op of ops) {
                if (!op.payload.parentId) {
                    this.ctx.callbacks.onHTMLCommit?.(op.nodeId, "");
                }
            }
            this.ctx.deselectAll();
        }
        this.ctx.mount.setTransitionsEnabled(true);
        this.ctx.render();
    }
    /** Duplicates the selected node right next to it as a sibling. */
    duplicateSelectedNode() {
        const topLevelIds = this.ctx.getTopLevelSelectedIds();
        if (topLevelIds.length === 0)
            return;
        this.ctx.mount.setTransitionsEnabled(false);
        const newSelectedIds = [];
        const ops = [];
        const parentsToCommit = new Set();
        const rootsToCommit = [];
        for (const originalId of topLevelIds) {
            const originalNode = this.ctx.tree.get(originalId);
            if (!originalNode)
                continue;
            const rawMarkup = this.ctx.mount.extractHTML(originalId);
            if (!rawMarkup)
                continue;
            const duplicateId = `cloned-${this.ctx.nextElementId()}-${Date.now().toString(36)}`;
            const parentId = originalNode.parentId;
            let rect = originalNode.currentRect ? { ...originalNode.currentRect } : null;
            let index;
            if (parentId !== null) {
                index = this.ctx.tree.getChildIndex(originalId) + 1;
            }
            else if (rect) {
                rect.x += 20;
                rect.y += 20;
            }
            this.ctx.addNode({
                id: duplicateId,
                rawMarkup,
                currentRect: rect
            }, parentId, index);
            if (this.ctx.jsMarkedNodes.has(originalId)) {
                this.ctx.markNodeHasJS(duplicateId);
            }
            this.ctx.callbacks.onNodeCloned?.(originalId, duplicateId);
            newSelectedIds.push(duplicateId);
            const finalIndex = parentId !== null ? this.ctx.tree.getChildIndex(duplicateId) : -1;
            ops.push({
                type: "create-node",
                nodeId: duplicateId,
                payload: { parentId, index: finalIndex, rawMarkup, rect },
                undoPayload: { parentId }
            });
            if (parentId) {
                parentsToCommit.add(parentId);
            }
            else {
                rootsToCommit.push(duplicateId);
            }
        }
        if (ops.length > 0) {
            const prevSelection = new Set(this.ctx.selectedIds);
            this.ctx.selectedIds.clear();
            for (const id of newSelectedIds) {
                this.ctx.selectedIds.add(id);
            }
            this.ctx.syncLazyChildren(prevSelection, this.ctx.selectedIds);
            this.ctx.callbacks.onSelectionChange?.(this.ctx.selectedIds);
            this.ctx.updateBreadcrumb();
            this.ctx.callbacks.onOperationsGenerated?.(ops);
            for (const parentId of parentsToCommit) {
                const html = this.ctx.mount.extractHTML(parentId);
                if (html) {
                    this.ctx.callbacks.onHTMLCommit?.(parentId, html);
                }
            }
            for (const rootId of rootsToCommit) {
                const html = this.ctx.mount.extractHTML(rootId);
                if (html) {
                    this.ctx.callbacks.onHTMLCommit?.(rootId, html);
                }
            }
        }
        this.ctx.mount.setTransitionsEnabled(true);
        this.ctx.render();
    }
    /** Copies the selected node to the internal clipboard. */
    copySelectedNode() {
        const topLevelIds = this.ctx.getTopLevelSelectedIds();
        if (topLevelIds.length === 0)
            return;
        this.clipboardItems = [];
        for (const id of topLevelIds) {
            const node = this.ctx.tree.get(id);
            const markup = this.ctx.mount.extractHTML(id);
            if (node && markup) {
                this.clipboardItems.push({
                    rawMarkup: markup,
                    rect: node.currentRect ? { ...node.currentRect } : null,
                    hasJS: this.ctx.jsMarkedNodes.has(id),
                    originalId: id,
                });
            }
        }
    }
    /** Cuts the selected node to the clipboard, removing it from the canvas. */
    cutSelectedNode() {
        this.copySelectedNode();
        this.deleteSelectedNode();
    }
    /** Pastes the node currently in the clipboard into the canvas. */
    pasteNode() {
        if (this.clipboardItems.length === 0)
            return;
        this.ctx.mount.setTransitionsEnabled(false);
        const newSelectedIds = [];
        const ops = [];
        const parentsToCommit = new Set();
        const rootsToCommit = [];
        const targets = this.ctx.selectedIds.size > 0 ? this.ctx.getTopLevelSelectedIds() : [];
        if (targets.length === 0) {
            // Paste all items at root level
            for (const item of this.clipboardItems) {
                const id = `pasted-${this.ctx.nextElementId()}-${Date.now().toString(36)}`;
                let rect;
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
                }
                else {
                    rect = { x: 100, y: 100, width: 120, height: 120 };
                }
                this.ctx.addNode({
                    id,
                    rawMarkup: item.rawMarkup,
                    currentRect: rect,
                }, null);
                if (item.hasJS) {
                    this.ctx.markNodeHasJS(id);
                }
                if (item.originalId) {
                    this.ctx.callbacks.onNodeCloned?.(item.originalId, id);
                }
                newSelectedIds.push(id);
                ops.push({
                    type: "create-node",
                    nodeId: id,
                    payload: { parentId: null, index: undefined, rawMarkup: item.rawMarkup, rect },
                    undoPayload: { parentId: null }
                });
                rootsToCommit.push(id);
            }
        }
        else {
            // Paste next to or inside each target
            for (const targetId of targets) {
                const targetNode = this.ctx.tree.get(targetId);
                if (!targetNode)
                    continue;
                const isContainer = this.ctx.tree.isContainer(targetId);
                const parentId = isContainer ? targetId : targetNode.parentId;
                let startIndex = isContainer ? 0 : this.ctx.tree.getChildIndex(targetId) + 1;
                for (const item of this.clipboardItems) {
                    const id = `pasted-${this.ctx.nextElementId()}-${Date.now().toString(36)}`;
                    let rect;
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
                        }
                        else {
                            rect = { x: 100, y: 100, width: 120, height: 120 };
                        }
                    }
                    else {
                        if (item.rect) {
                            rect = {
                                x: 0,
                                y: 0,
                                width: item.rect.width,
                                height: item.rect.height,
                            };
                        }
                        else {
                            rect = { x: 0, y: 0, width: 120, height: 120 };
                        }
                    }
                    this.ctx.addNode({
                        id,
                        rawMarkup: item.rawMarkup,
                        currentRect: rect,
                    }, parentId, startIndex);
                    if (parentId !== null) {
                        startIndex++;
                    }
                    if (item.hasJS) {
                        this.ctx.markNodeHasJS(id);
                    }
                    if (item.originalId) {
                        this.ctx.callbacks.onNodeCloned?.(item.originalId, id);
                    }
                    newSelectedIds.push(id);
                    const finalIndex = parentId !== null ? this.ctx.tree.getChildIndex(id) : -1;
                    ops.push({
                        type: "create-node",
                        nodeId: id,
                        payload: { parentId, index: finalIndex, rawMarkup: item.rawMarkup, rect },
                        undoPayload: { parentId }
                    });
                    if (parentId) {
                        parentsToCommit.add(parentId);
                    }
                    else {
                        rootsToCommit.push(id);
                    }
                }
            }
        }
        if (ops.length > 0) {
            const prevSelection = new Set(this.ctx.selectedIds);
            this.ctx.selectedIds.clear();
            for (const id of newSelectedIds) {
                this.ctx.selectedIds.add(id);
            }
            this.ctx.syncLazyChildren(prevSelection, this.ctx.selectedIds);
            this.ctx.callbacks.onSelectionChange?.(this.ctx.selectedIds);
            this.ctx.updateBreadcrumb();
            this.ctx.callbacks.onOperationsGenerated?.(ops);
            for (const parentId of parentsToCommit) {
                const html = this.ctx.mount.extractHTML(parentId);
                if (html) {
                    this.ctx.callbacks.onHTMLCommit?.(parentId, html);
                }
            }
            for (const rootId of rootsToCommit) {
                const html = this.ctx.mount.extractHTML(rootId);
                if (html) {
                    this.ctx.callbacks.onHTMLCommit?.(rootId, html);
                }
            }
        }
        this.ctx.mount.setTransitionsEnabled(true);
        this.ctx.render();
    }
}
//# sourceMappingURL=clipboard.handler.js.map