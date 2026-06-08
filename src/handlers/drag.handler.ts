// ─────────────────────────────────────────────────────────────
// canvus/src/handlers/drag.handler.ts
// Handles hit-testing, selection adjustments, and dragging (movement/reparenting/cloning) of nodes.
// ─────────────────────────────────────────────────────────────

import type { Rect, Vec2 } from "../types.js";
import { computeAlignmentGuides, computeSnappedPosition } from "../renderer.js";
import { findDropTarget } from "../drop-zone.js";
import type { InteractionHandler, WorkspaceContext } from "./types.js";
import { isPointInElement } from "../matrix.js";

/**
 * Manages node dragging, multi-selection drags, drop zones, cloning, and alignment guides.
 */
export class DragHandler implements InteractionHandler {
  readonly id = "drag";

  private ctx: WorkspaceContext;

  private _isDragging = false;
  private _isDragCopy = false;
  private _pointerDownReadyToDrag = false;
  private _pointerDownInsideSelection: string | null = null;
  private _dragStartCanvas: Vec2 | null = null;

  private readonly _dragStartNodes = new Map<string, {
    startPos: Vec2;
    startParentId: string | null;
    startIndex: number;
    startStyles: Record<string, string | null> | null;
  }>();

  constructor(ctx: WorkspaceContext) {
    this.ctx = ctx;
  }

  get isDragging(): boolean {
    return this._isDragging;
  }

  // ── InteractionHandler Interface ────────────────

  claim(
    e: PointerEvent,
    canvasPos: Vec2,
    hitNodeId: string | null,
    _containerRect: Rect,
  ): boolean {
    if (e.button !== 0 || this.ctx.previewMode) return false;

    // Calculate isDoubleClick early to prevent handles/adjusters from intercepting double-clicks on small/nested nodes
    const now = Date.now();
    const targetEl = e.composedPath()[0] as HTMLElement | null;
    const isSameTarget = targetEl !== null && this.ctx.lastPointerDownTarget !== null &&
      (targetEl === this.ctx.lastPointerDownTarget || (this.ctx.lastPointerDownTarget as Node).contains(targetEl) || targetEl.contains(this.ctx.lastPointerDownTarget as Node));
    const isDoubleClick = (now - this.ctx.lastPointerDownTime < 350) && (
      hitNodeId !== null &&
      this.ctx.lastPointerDownId !== null &&
      (hitNodeId === this.ctx.lastPointerDownId || isSameTarget || this.ctx.tree.isAncestor(this.ctx.lastPointerDownId, hitNodeId))
    );

    if (isDoubleClick) return false;

    if (hitNodeId) {
      // Scoping/selection drill-down lock check
      if (this.ctx.isNodeLocked(hitNodeId)) {
        this.ctx.callbacks.onLockedNodeInteraction?.(hitNodeId);
        return false; // Let lock callback handle it or fall through to deselect/marquee
      }

      // Check if we clicked inside the existing selection
      const hasModifier = e.shiftKey || e.metaKey || e.ctrlKey;
      let clickInsideSelection = false;
      let targetSelectId: string | null = null;

      if (this.ctx.selectedIds.size > 0 && !hasModifier) {
        for (const selId of this.ctx.selectedIds) {
          const selNode = this.ctx.tree.get(selId);
          if (selNode?.currentRect && isPointInElement(canvasPos.x, canvasPos.y, selNode.currentRect)) {
            clickInsideSelection = true;
            targetSelectId = selId;
            this._pointerDownInsideSelection = selId;
            break;
          }
        }
      }

      if (!clickInsideSelection) {
        this._pointerDownInsideSelection = null;
        // Resolve target node based on current entered scope
        const isCmdClick = e.metaKey || e.ctrlKey;
        if (isCmdClick) {
          targetSelectId = hitNodeId;
          this.ctx.enteredContainerId = this.ctx.tree.get(hitNodeId)?.parentId ?? null;
        } else {
          const resolvedId = this.ctx.findSelectableNode(hitNodeId, this.ctx.enteredContainerId);
          if (resolvedId) {
            targetSelectId = resolvedId;
            const node = this.ctx.tree.get(resolvedId);
            this.ctx.enteredContainerId = node?.parentId ?? null;
          } else {
            this.ctx.enteredContainerId = null;
            targetSelectId = this.ctx.findSelectableNode(hitNodeId, null);
          }
        }
      }

      if (targetSelectId) {
        // Update selection if click was not inside the existing selection
        if (!clickInsideSelection) {
          const prevSelection = new Set(this.ctx.selectedIds);
          const isShift = e.shiftKey;
          if (isShift) {
            if (this.ctx.selectedIds.has(targetSelectId)) {
              this.ctx.selectedIds.delete(targetSelectId);
            } else {
              this.ctx.selectedIds.add(targetSelectId);
            }
          } else {
            this.ctx.selectedIds.clear();
            this.ctx.selectedIds.add(targetSelectId);
          }
          this.ctx.syncLazyChildren(prevSelection, this.ctx.selectedIds);
          this.ctx.callbacks.onSelectionChange?.(this.ctx.selectedIds);
          this.ctx.updateBreadcrumb();
        }

        // Initialize drag state variables
        this._isDragging = false;
        this._pointerDownReadyToDrag = true;
        this._dragStartCanvas = canvasPos;
        this._dragStartNodes.clear();

        // Capture initial styles/rects of selected nodes
        const topLevelIds = this.ctx.getTopLevelSelectedIds();
        for (const selId of topLevelIds) {
          const selNode = this.ctx.tree.get(selId);
          if (selNode && selNode.currentRect) {
            const contentRoot = this.ctx.mount.getContentRoot(selId);
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
            this._dragStartNodes.set(selId, {
              startPos: { x: selNode.currentRect.x, y: selNode.currentRect.y },
              startParentId: selNode.parentId,
              startIndex: selNode.parentId !== null ? this.ctx.tree.getChildIndex(selId) : -1,
              startStyles,
            });
          }
        }

        this.ctx.render();
        return true;
      }
    }

    return false;
  }

  onPointerMove(e: PointerEvent, canvasPos: Vec2, _containerRect: Rect): void {
    if (this._isDragging) {
      console.log('DEBUG WORKSPACE MOVE: viewport scale:', this.ctx.viewport.scale, 'canvasPos:', canvasPos, 'dragStartCanvas:', this._dragStartCanvas, 'clientX:', e.clientX, 'clientY:', e.clientY);
    }

    // ── Drag initiation ───────────────────────────
    if (this._pointerDownReadyToDrag && this._dragStartCanvas) {
      const dx = canvasPos.x - this._dragStartCanvas.x;
      const dy = canvasPos.y - this._dragStartCanvas.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= 3) {
        if (e.altKey && this.ctx.selectedIds.size > 0) {
          const topLevelIds = this.ctx.getTopLevelSelectedIds();

          this.ctx.mount.setTransitionsEnabled(false);

          const newSelectedIds: string[] = [];
          this._dragStartNodes.clear();

          for (const originalId of topLevelIds) {
            const originalNode = this.ctx.tree.get(originalId);
            if (originalNode && originalNode.currentRect) {
              const rawMarkup = this.ctx.mount.extractHTML(originalId);
              if (rawMarkup) {
                const newIdVal = this.ctx.nextElementId();
                const duplicateId = `cloned-${newIdVal}-${Date.now().toString(36)}`;
                const parentId = originalNode.parentId;
                const index = parentId !== null ? this.ctx.tree.getChildIndex(originalId) + 1 : undefined;

                this.ctx.addNode({
                  id: duplicateId,
                  rawMarkup,
                  currentRect: { ...originalNode.currentRect }
                }, parentId, index);

                if (this.ctx.jsMarkedNodes.has(originalId)) {
                  this.ctx.markNodeHasJS(duplicateId);
                }

                this.ctx.callbacks.onNodeCloned?.(originalId, duplicateId);

                newSelectedIds.push(duplicateId);

                const duplicateContentRoot = this.ctx.mount.getContentRoot(duplicateId);
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

                this._dragStartNodes.set(duplicateId, {
                  startPos: { x: originalNode.currentRect.x, y: originalNode.currentRect.y },
                  startParentId: parentId,
                  startIndex: parentId !== null ? this.ctx.tree.getChildIndex(duplicateId) : -1,
                  startStyles,
                });
              }
            }
          }

          if (newSelectedIds.length > 0) {
            const prevSelection = new Set(this.ctx.selectedIds);
            this.ctx.selectedIds.clear();
            for (const id of newSelectedIds) {
              this.ctx.selectedIds.add(id);
            }
            this.ctx.syncLazyChildren(prevSelection, this.ctx.selectedIds);
            this.ctx.callbacks.onSelectionChange?.(this.ctx.selectedIds);
            this.ctx.updateBreadcrumb();

            this._isDragCopy = true;
          }
        }

        // ── Multi-node property lock check for drag ──
        const dragTopLevelIds = this.ctx.getTopLevelSelectedIds();
        let dragBlocked = false;
        for (const nodeId of dragTopLevelIds) {
          const posProps = ["left", "top"];
          for (const prop of posProps) {
            if (this.ctx.isPropertyLocked(nodeId, prop)) {
              this.ctx.notifyPropertyLockInteraction(nodeId, prop);
              dragBlocked = true;
            }
          }
        }
        if (dragBlocked) {
          this._pointerDownReadyToDrag = false;
          this.onCancel();
          return;
        }

        this._isDragging = true;
        this._pointerDownReadyToDrag = false;
        this.ctx.callbacks.onInteractionChange?.("drag-node");
        this.ctx.safeSetPointerCapture(e.pointerId);
      }
    }

    if (this._isDragging && this._dragStartCanvas && this._dragStartNodes.size > 0) {
      const topLevelIds = this.ctx.getTopLevelSelectedIds();
      const primaryId = this._dragStartNodes.keys().next().value as string;
      const primaryStart = this._dragStartNodes.get(primaryId)!;

      const dx = canvasPos.x - this._dragStartCanvas.x;
      const dy = canvasPos.y - this._dragStartCanvas.y;

      let snapDx = dx;
      let snapDy = dy;

      if (primaryStart.startParentId === null) {
        // Absolute Root dragging
        const newX = primaryStart.startPos.x + dx;
        const newY = primaryStart.startPos.y + dy;

        // Snap-to-align
        if (this.ctx.enableSnapGuides) {
          const primaryNode = this.ctx.tree.get(primaryId);
          if (primaryNode && primaryNode.currentRect) {
            const candidateRect: Rect = {
              x: newX, y: newY,
              width: primaryNode.currentRect.width,
              height: primaryNode.currentRect.height,
            };
            const otherRects = this.ctx.getOtherRectsMultiple(topLevelIds);
            const snapped = computeSnappedPosition(
              candidateRect, otherRects, this.ctx.snapThreshold,
            );
            snapDx = snapped.x - primaryStart.startPos.x;
            snapDy = snapped.y - primaryStart.startPos.y;

            const snappedRect: Rect = {
              x: snapped.x, y: snapped.y,
              width: primaryNode.currentRect.width,
              height: primaryNode.currentRect.height,
            };
            this.ctx.guides = computeAlignmentGuides(
              snappedRect, otherRects, this.ctx.snapThreshold,
            );
          }
        }

        // Apply translations on all dragged nodes
        for (const [id, start] of this._dragStartNodes.entries()) {
          if (start.startParentId === null) {
            this.ctx.mount.setNodePosition(id, start.startPos.x + snapDx, start.startPos.y + snapDy);
            this.ctx.remeasureSubtree(id);
          } else {
            const wrapper = this.ctx.mount.getWrapper(id);
            if (wrapper) {
              wrapper.style.transform = `translate3d(${snapDx}px, ${snapDy}px, 0)`;
            }
            const node = this.ctx.tree.get(id);
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
        for (const [id, start] of this._dragStartNodes.entries()) {
          const wrapper = this.ctx.mount.getWrapper(id);
          if (wrapper) {
            wrapper.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
          }
          const node = this.ctx.tree.get(id);
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
      this.ctx.activeDropTarget = findDropTarget(
        primaryId,
        canvasPos,
        this.ctx.tree,
        (id) => this.ctx.mount.getWrapper(id),
        (id) => this.ctx.mount.getContentRoot(id)
      );

      // Notify node rect changes
      for (const id of this.ctx.selectedIds) {
        const node = this.ctx.tree.get(id);
        if (node?.currentRect) {
          this.ctx.callbacks.onNodeRectChange?.(id, node.currentRect);
        }
      }

      this.ctx.render();
    }
  }

  onPointerUp(e: PointerEvent, canvasPos: Vec2, _containerRect: Rect): void {
    if (this._isDragging) {
      console.log('DEBUG WORKSPACE UP: viewport scale:', this.ctx.viewport.scale, 'dragStartNodes:', Array.from(this._dragStartNodes.entries()).map(([id, s]) => ({ id, startPos: s.startPos, startParentId: s.startParentId })), 'clientX:', e.clientX, 'clientY:', e.clientY);
    }

    let commitId: string | null = null;
    const operations: any[] = [];

    if (this._isDragging) {
      if (this.ctx.selectedIds.size === 1) {
        commitId = this.ctx.selectedIds.values().next().value as string;
      }
    }

    if (this._isDragging) {
      this._isDragging = false;
      this._dragStartCanvas = null;

      this.ctx.mount.setTransitionsEnabled(false);

      if (this._dragStartNodes.size > 0) {
        if (this._isDragCopy) {
          this._isDragCopy = false;
          const parentsToCommit = new Set<string>();
          const rootsToCommit: string[] = [];

          for (const clonedId of this._dragStartNodes.keys()) {
            const node = this.ctx.tree.get(clonedId);
            if (!node || !node.currentRect) continue;

            const wrapper = this.ctx.mount.getWrapper(clonedId);
            if (wrapper) {
              wrapper.style.transform = "";
            }

            const rawMarkup = this.ctx.mount.extractHTML(clonedId) || "";
            let rect = { ...node.currentRect };

            if (this.ctx.activeDropTarget) {
              const { parentId, gridPlacement } = this.ctx.activeDropTarget;
              if (gridPlacement) {
                const gridStyles = {
                  "grid-column-start": `${gridPlacement.colStart}`,
                  "grid-column-end": `span ${gridPlacement.colSpan}`,
                  "grid-row-start": `${gridPlacement.rowStart}`,
                  "grid-row-end": `span ${gridPlacement.rowSpan}`,
                };
                this.ctx.setNodeStyles(clonedId, gridStyles);
                rect = gridPlacement.rect;
              }

              const insertionIndex = this.ctx.activeDropTarget.insertionIndex;
              if (node.parentId !== parentId) {
                this.ctx.reparentNode(clonedId, parentId, insertionIndex !== undefined ? insertionIndex : 0);
              }

              operations.push({
                type: "create-node" as any,
                nodeId: clonedId,
                payload: { parentId, index: this.ctx.tree.getChildIndex(clonedId), rawMarkup, rect },
                undoPayload: { parentId }
              });

              if (parentId) {
                parentsToCommit.add(parentId);
              }
            } else {
              if (node.parentId !== null) {
                this.ctx.reparentNode(clonedId, null);
                this.ctx.mount.setNodePosition(clonedId, rect.x, rect.y);
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

          this.ctx.activeDropTarget = null;
          this._dragStartNodes.clear();
          this.ctx.mount.setTransitionsEnabled(true);

          if (operations.length > 0) {
            this.ctx.callbacks.onOperationsGenerated?.(operations);
          }

          for (const id of this.ctx.selectedIds) {
            this.ctx.remeasureSubtree(id);
            const node = this.ctx.tree.get(id);
            if (node?.currentRect) {
              this.ctx.callbacks.onNodeRectChange?.(id, node.currentRect);
            }
          }

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

          this.ctx.canvas.style.pointerEvents = "none";
          this.ctx.emitInteraction(null);
          this.ctx.render();
          return;
        }

        if (this.ctx.activeDropTarget) {
          const { parentId, insertionIndex, gridPlacement } = this.ctx.activeDropTarget;
          let currentInsertion = insertionIndex !== undefined ? insertionIndex : 0;

          for (const [id, start] of this._dragStartNodes.entries()) {
            const node = this.ctx.tree.get(id);
            if (!node) continue;

            const oldParentId = start.startParentId;
            const oldIndex = start.startIndex;

            const wrapper = this.ctx.mount.getWrapper(id);
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
              this.ctx.mount.setNodeStyles(id, payloadStyles);

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
                this.ctx.reparentNode(id, parentId, 0);
                operations.push({
                  type: "reparent",
                  nodeId: id,
                  payload: { newParentId: parentId, index: 0 },
                  undoPayload: { newParentId: oldParentId, index: oldIndex }
                });
              } else {
                this.ctx.remeasureSubtree(parentId);
                const html = this.ctx.mount.extractHTML(parentId);
                if (html) {
                  this.ctx.callbacks.onHTMLCommit?.(parentId, html);
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
                this.ctx.mount.setNodeStyles(id, payloadStyles);
                operations.push({
                  type: "update-style",
                  nodeId: id,
                  payload: payloadStyles,
                  undoPayload: undoPayloadStyles
                });
              }

              if (parentId === node.parentId) {
                this.ctx.reorderChild(id, currentInsertion);
                const newIndex = this.ctx.tree.getChildIndex(id);
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
                this.ctx.reparentNode(id, parentId, currentInsertion);
                const newIndex = this.ctx.tree.getChildIndex(id);
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
          for (const [id, start] of this._dragStartNodes.entries()) {
            const node = this.ctx.tree.get(id);
            if (!node) continue;

            const oldParentId = start.startParentId;
            const oldIndex = start.startIndex;
            const oldPos = start.startPos;

            const wrapper = this.ctx.mount.getWrapper(id);
            if (wrapper) {
              wrapper.style.transform = "";
            }

            if (node.parentId !== null) {
              this.ctx.reparentNode(id, null);
              if (node.currentRect) {
                this.ctx.mount.setNodePosition(id, node.currentRect.x, node.currentRect.y);
                this.ctx.remeasureSubtree(id);
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
                this.ctx.mount.setNodeStyles(id, payloadStyles);
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

      this.ctx.activeDropTarget = null;
      this._dragStartNodes.clear();

      for (const id of this.ctx.selectedIds) {
        this.ctx.remeasureSubtree(id);
        const node = this.ctx.tree.get(id);
        if (node?.currentRect) {
          this.ctx.callbacks.onNodeRectChange?.(id, node.currentRect);
        }
      }

      this.ctx.mount.setTransitionsEnabled(true);
    } else {
      // Simple click without dragging: cycle overlapping elements
      if (this._pointerDownInsideSelection) {
        const nodeList = this.ctx.getOrderedNodeList();
        const hitNodes = nodeList.filter(n => {
          if (!n.currentRect || !isPointInElement(canvasPos.x, canvasPos.y, n.currentRect)) {
            return false;
          }
          const treeNode = this.ctx.tree.get(n.id);
          return treeNode && treeNode.parentId === this.ctx.enteredContainerId;
        });

        if (hitNodes.length > 1) {
          const idx = hitNodes.findIndex(n => n.id === this._pointerDownInsideSelection);
          if (idx !== -1) {
            const nextIdx = (idx - 1 + hitNodes.length) % hitNodes.length;
            const nextNode = hitNodes[nextIdx];
            if (nextNode) {
              const nextId = nextNode.id;

              this.ctx.selectedIds.clear();
              this.ctx.selectedIds.add(nextId);
              this.ctx.callbacks.onSelectionChange?.(this.ctx.selectedIds);
              this.ctx.updateBreadcrumb();
              this.ctx.render();
            }
          }
        }
      }
    }

    this._pointerDownReadyToDrag = false;
    this._pointerDownInsideSelection = null;

    // Clear guides.
    this.ctx.guides = [];

    // Release pointer capture.
    try {
      this.ctx.container.releasePointerCapture(e.pointerId);
    } catch {}

    if (operations.length > 0) {
      this.ctx.callbacks.onOperationsGenerated?.(operations);
    }

    this.ctx.canvas.style.pointerEvents = "none";
    this.ctx.emitInteraction(null);
    this.ctx.render();

    // ── Flat String Bridge ────────────────────────
    if (commitId) {
      const node = this.ctx.tree.get(commitId);
      const commitTarget = (node && node.parentId !== null) ? node.parentId : commitId;
      const html = this.ctx.mount.extractHTML(commitTarget);
      if (html) {
        this.ctx.callbacks.onHTMLCommit?.(commitTarget, html);
      }
    }
  }

  onCancel(): void {
    this._isDragging = false;
    this._pointerDownReadyToDrag = false;
    this._pointerDownInsideSelection = null;
    this._dragStartCanvas = null;

    // Reset styles
    for (const [id, start] of this._dragStartNodes.entries()) {
      const wrapper = this.ctx.mount.getWrapper(id);
      if (wrapper) {
        wrapper.style.transform = "";
      }
      const node = this.ctx.tree.get(id);
      if (node && start.startPos) {
        if (start.startParentId === null) {
          this.ctx.mount.setNodePosition(id, start.startPos.x, start.startPos.y);
          this.ctx.remeasureSubtree(id);
        }
      }
    }

    this._dragStartNodes.clear();
    this.ctx.activeDropTarget = null;
    this.ctx.guides = [];
    this.ctx.container.style.cursor = "default";
    this.ctx.emitInteraction(null);
    this.ctx.render();
  }
}
