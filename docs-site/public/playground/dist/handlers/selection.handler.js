// ─────────────────────────────────────────────────────────────
// canvus/src/handlers/selection.handler.ts
// Handles marquee selection (rubber band), single click, multi-select, and double-click scope drill-down.
// ─────────────────────────────────────────────────────────────
import { rectsIntersect, isPointInElement } from "../matrix.js";
/**
 * Fallback interaction handler managing marquee selection, click selections, and container drill-down scoping.
 */
export class SelectionHandler {
    id = "selection";
    ctx;
    _isMarqueeSelecting = false;
    _marqueeStartCanvas = null;
    _marqueeCurrentCanvas = null;
    _preMarqueeSelectedIds = new Set();
    _marqueeEnteredContainerId = null;
    constructor(ctx) {
        this.ctx = ctx;
    }
    get isMarqueeSelecting() {
        return this._isMarqueeSelecting;
    }
    getMarqueeRect() {
        if (!this._isMarqueeSelecting || !this._marqueeStartCanvas || !this._marqueeCurrentCanvas) {
            return null;
        }
        return {
            x: Math.min(this._marqueeStartCanvas.x, this._marqueeCurrentCanvas.x),
            y: Math.min(this._marqueeStartCanvas.y, this._marqueeCurrentCanvas.y),
            width: Math.abs(this._marqueeStartCanvas.x - this._marqueeCurrentCanvas.x),
            height: Math.abs(this._marqueeStartCanvas.y - this._marqueeCurrentCanvas.y),
        };
    }
    // ── InteractionHandler Interface ────────────────
    claim(e, canvasPos, hitNodeId, _containerRect) {
        if (e.button !== 0 || this.ctx.previewMode)
            return false;
        const targetEl = e.composedPath()[0];
        const now = Date.now();
        const isSameTarget = targetEl !== null && this.ctx.lastPointerDownTarget !== null &&
            (targetEl === this.ctx.lastPointerDownTarget || this.ctx.lastPointerDownTarget.contains(targetEl) || targetEl.contains(this.ctx.lastPointerDownTarget));
        const isDoubleClick = (now - this.ctx.lastPointerDownTime < 350) && (hitNodeId !== null &&
            this.ctx.lastPointerDownId !== null &&
            (hitNodeId === this.ctx.lastPointerDownId || isSameTarget || this.ctx.tree.isAncestor(this.ctx.lastPointerDownId, hitNodeId)));
        this.ctx.lastPointerDownTime = now;
        this.ctx.lastPointerDownId = hitNodeId;
        this.ctx.lastPointerDownTarget = targetEl;
        // ── Node hit-test (select) ────────────────────
        let targetSelectId = null;
        let clickInsideSelection = false;
        const hasModifier = e.shiftKey || e.metaKey || e.ctrlKey;
        if (this.ctx.selectedIds.size > 0 && !hasModifier && !isDoubleClick) {
            for (const selId of this.ctx.selectedIds) {
                const selNode = this.ctx.tree.get(selId);
                if (selNode?.currentRect && isPointInElement(canvasPos.x, canvasPos.y, selNode.currentRect)) {
                    clickInsideSelection = true;
                    targetSelectId = selId;
                    break;
                }
            }
        }
        if (!clickInsideSelection) {
            if (hitNodeId) {
                // ── Layer lock guard ──────────────────────
                if (this.ctx.isNodeLocked(hitNodeId)) {
                    this.ctx.callbacks.onLockedNodeInteraction?.(hitNodeId);
                    // Treat as click on empty space — fall through to deselect / marquee
                }
                else {
                    const isCmdClick = e.metaKey || e.ctrlKey;
                    if (isCmdClick) {
                        // Cmd+Click: deep select the hit element directly
                        targetSelectId = hitNodeId;
                        this.ctx.enteredContainerId = this.ctx.tree.get(hitNodeId)?.parentId ?? null;
                    }
                    else if (isDoubleClick) {
                        // Double click: Figma-like drill down
                        const path = this.ctx.tree.getPath(hitNodeId);
                        let foundSelectedIdx = -1;
                        for (let i = 0; i < path.length; i++) {
                            if (this.ctx.selectedIds.has(path[i].id)) {
                                foundSelectedIdx = i;
                                break;
                            }
                        }
                        if (foundSelectedIdx !== -1 && foundSelectedIdx < path.length - 1) {
                            // Drill down one level
                            const nextParent = path[foundSelectedIdx];
                            const nextSelect = path[foundSelectedIdx + 1];
                            this.ctx.enteredContainerId = nextParent.id;
                            targetSelectId = nextSelect.id;
                        }
                        else if (foundSelectedIdx === path.length - 1) {
                            // Leaf is already selected: keep selection on leaf to trigger text editing
                            targetSelectId = path[path.length - 1].id;
                            this.ctx.enteredContainerId = path[path.length - 2]?.id ?? null;
                        }
                        else {
                            // Nothing in the path is selected
                            if (path.length > 0) {
                                targetSelectId = path[0].id;
                                this.ctx.enteredContainerId = null;
                            }
                            else {
                                targetSelectId = hitNodeId;
                            }
                        }
                    }
                    else {
                        // Single Click: resolve based on current entered scope
                        const resolvedId = this.ctx.findSelectableNode(hitNodeId, this.ctx.enteredContainerId);
                        if (resolvedId) {
                            targetSelectId = resolvedId;
                            const node = this.ctx.tree.get(resolvedId);
                            this.ctx.enteredContainerId = node?.parentId ?? null;
                        }
                        else {
                            // Clicked outside currently entered container: exit scope, select root ancestor
                            this.ctx.enteredContainerId = null;
                            targetSelectId = this.ctx.findSelectableNode(hitNodeId, null);
                        }
                    }
                } // end of lock guard else-block
            }
            if (isDoubleClick && targetSelectId && this.ctx.selectedIds.has(targetSelectId)) {
                this.ctx.editAllowedOnDblClick = true;
            }
            else {
                this.ctx.editAllowedOnDblClick = false;
            }
        }
        if (targetSelectId) {
            if (!clickInsideSelection) {
                const prevSelection = new Set(this.ctx.selectedIds);
                const isShift = e.shiftKey;
                if (isShift) {
                    if (this.ctx.selectedIds.has(targetSelectId)) {
                        this.ctx.selectedIds.delete(targetSelectId);
                    }
                    else {
                        this.ctx.selectedIds.add(targetSelectId);
                    }
                }
                else {
                    this.ctx.selectedIds.clear();
                    this.ctx.selectedIds.add(targetSelectId);
                }
                this.ctx.syncLazyChildren(prevSelection, this.ctx.selectedIds);
                this.ctx.callbacks.onSelectionChange?.(this.ctx.selectedIds);
                this.ctx.updateBreadcrumb();
            }
        }
        else {
            // Click on empty space — start marquee selection
            const isShift = e.shiftKey;
            if (!isShift) {
                const prevSelection = new Set(this.ctx.selectedIds);
                this.ctx.selectedIds.clear();
                this.ctx.enteredContainerId = null;
                this.ctx.guides = [];
                this.ctx.syncLazyChildren(prevSelection, this.ctx.selectedIds);
                this.ctx.callbacks.onSelectionChange?.(this.ctx.selectedIds);
                this.ctx.updateBreadcrumb();
            }
            this._marqueeEnteredContainerId = this.ctx.enteredContainerId;
            this._preMarqueeSelectedIds.clear();
            for (const id of this.ctx.selectedIds) {
                this._preMarqueeSelectedIds.add(id);
            }
            this._isMarqueeSelecting = true;
            this._marqueeStartCanvas = canvasPos;
            this._marqueeCurrentCanvas = canvasPos;
            this.ctx.safeSetPointerCapture(e.pointerId);
            this.ctx.emitInteraction("select-marquee");
        }
        this.ctx.render();
        return true; // Fallback handler always claims the event
    }
    onPointerMove(e, canvasPos, _containerRect) {
        if (this._isMarqueeSelecting && this._marqueeStartCanvas) {
            this._marqueeCurrentCanvas = canvasPos;
            const mRect = this.getMarqueeRect();
            if (!mRect)
                return;
            // Find all selectable nodes inside or intersecting the marquee rect
            const selectableNodes = this.ctx.getOrderedNodeList();
            const currentMarqueeSelection = new Set();
            const scopeId = this._marqueeEnteredContainerId;
            for (const node of selectableNodes) {
                if (!node.currentRect)
                    continue;
                const treeNode = this.ctx.tree.get(node.id);
                if (!treeNode)
                    continue;
                // Skip locked nodes in marquee selection
                if (this.ctx.isNodeLocked(node.id))
                    continue;
                // Scoping constraint
                if (scopeId !== null) {
                    if (treeNode.parentId !== scopeId)
                        continue;
                }
                else {
                    if (treeNode.parentId !== null)
                        continue;
                }
                if (rectsIntersect(node.currentRect, mRect)) {
                    currentMarqueeSelection.add(node.id);
                }
            }
            // Compute new selection based on Shift modifier.
            const isShift = e.shiftKey;
            const prevSelection = new Set(this.ctx.selectedIds);
            const selectedIds = this.ctx.selectedIds;
            selectedIds.clear();
            if (isShift) {
                for (const id of this._preMarqueeSelectedIds) {
                    selectedIds.add(id);
                }
            }
            for (const id of currentMarqueeSelection) {
                selectedIds.add(id);
            }
            this.ctx.syncLazyChildren(prevSelection, this.ctx.selectedIds);
            this.ctx.callbacks.onSelectionChange?.(this.ctx.selectedIds);
            this.ctx.updateBreadcrumb();
            this.ctx.render();
        }
    }
    onPointerUp(e, _canvasPos, _containerRect) {
        if (this._isMarqueeSelecting) {
            this._isMarqueeSelecting = false;
            this._marqueeStartCanvas = null;
            this._marqueeCurrentCanvas = null;
            this._preMarqueeSelectedIds.clear();
            // Restore entered container scope
            this.ctx.enteredContainerId = this._marqueeEnteredContainerId;
            this.ctx.updateBreadcrumb();
        }
        this.ctx.guides = [];
        // Release pointer capture.
        try {
            this.ctx.container.releasePointerCapture(e.pointerId);
        }
        catch {
            // Ignore if capture was already released or lost
        }
        this.ctx.emitInteraction(null);
        this.ctx.render();
    }
    onCancel() {
        this._isMarqueeSelecting = false;
        this._marqueeStartCanvas = null;
        this._marqueeCurrentCanvas = null;
        this._preMarqueeSelectedIds.clear();
        this._marqueeEnteredContainerId = null;
    }
}
//# sourceMappingURL=selection.handler.js.map