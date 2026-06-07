// ─────────────────────────────────────────────────────────────
// canvus/src/handlers/spacing.handler.ts
// Handles hit-testing and dragging for spacing adjusters and corner radius handles.
// ─────────────────────────────────────────────────────────────

import type { Rect, Vec2 } from "../types.js";
import type { SpacingAdjusterType } from "../renderer.js";
import { isContainerNode } from "../renderer.js";
import type { InteractionHandler, WorkspaceContext } from "./types.js";

/**
 * Manages margin, padding, and corner radius adjustment gestures.
 */
export class SpacingHandler implements InteractionHandler {
  readonly id = "spacing";

  private ctx: WorkspaceContext;

  // ── Hover State ──────────────────────────────────

  hoveredAdjusterType: SpacingAdjusterType | null = null;
  hoveredRadiusCorner: string | null = null;

  // ── Active Drag State ────────────────────────────

  private _activeAdjusterType: SpacingAdjusterType | null = null;
  private _adjusterStartValue = 0;
  private _adjusterStartValueStr: string | null = null;

  private _isAdjustingRadius = false;
  private _activeRadiusCorner: string | null = null;
  private _radiusTargetNodeId: string | null = null;
  private _radiusStartValues = new Map<string, string>();

  private _dragStartCanvas: Vec2 | null = null;

  constructor(ctx: WorkspaceContext) {
    this.ctx = ctx;
  }

  // ── Getters for Workspace Integration ────────────

  get activeAdjusterType(): SpacingAdjusterType | null {
    return this._activeAdjusterType;
  }

  get isAdjustingRadius(): boolean {
    return this._isAdjustingRadius;
  }

  get activeRadiusCorner(): string | null {
    return this._activeRadiusCorner;
  }

  // ── InteractionHandler Interface ────────────────

  claim(
    e: PointerEvent,
    canvasPos: Vec2,
    hitNodeId: string | null,
    containerRect: Rect,
  ): boolean {
    if (e.button !== 0 || this.ctx.previewMode) return false;

    // Calculate isDoubleClick early to prevent handles/adjusters from intercepting double-clicks on small/nested nodes
    const now = Date.now();
    const targetEl = e.composedPath()[0] as HTMLElement | null;
    const isSameTarget = targetEl !== null && this.ctx.lastPointerDownTarget !== null &&
      (targetEl === this.ctx.lastPointerDownTarget || (this.ctx.lastPointerDownTarget as Node).contains(targetEl) || targetEl.contains(this.ctx.lastPointerDownTarget as Node));
    const isDoubleClick = (now - this.ctx.lastPointerDownTime < 350) && (
      hitNodeId !== null &&
      this.ctx.lastPointerDownId === hitNodeId &&
      isSameTarget
    );

    if (isDoubleClick) return false;

    // ── Corner Radius handles hit-test ────────────
    if (this.ctx.selectedIds.size > 0) {
      const localX = e.clientX - containerRect.x;
      const localY = e.clientY - containerRect.y;
      let hitRadiusCorner: string | null = null;
      let targetNodeId: string | null = null;

      for (const selId of this.ctx.selectedIds) {
        const selNode = this.ctx.tree.get(selId);
        if (selNode && isContainerNode(selNode) && selNode.currentRect) {
          const hit = this.ctx.hitTestRadiusHandle(
            localX, localY, selNode.currentRect, this.ctx.viewport,
          );
          if (hit) {
            hitRadiusCorner = hit;
            targetNodeId = selId;
            break;
          }
        }
      }

      if (hitRadiusCorner && targetNodeId) {
        // Property lock check for corner-radius (multi-node)
        let radiusBlocked = false;
        for (const selId of this.ctx.selectedIds) {
          const selNode = this.ctx.tree.get(selId);
          if (selNode && isContainerNode(selNode)) {
            if (this.ctx.isNodeLocked(selId) || this.ctx.isPropertyLocked(selId, "border-radius")) {
              this.ctx.notifyPropertyLockInteraction(selId, "border-radius");
              radiusBlocked = true;
            }
          }
        }
        if (radiusBlocked) {
          return true; // Claim and block
        }

        this._isAdjustingRadius = true;
        this._activeRadiusCorner = hitRadiusCorner;
        this._radiusTargetNodeId = targetNodeId;

        this._radiusStartValues.clear();
        for (const selId of this.ctx.selectedIds) {
          const selNode = this.ctx.tree.get(selId);
          if (selNode && isContainerNode(selNode)) {
            const contentRoot = this.ctx.mount.getContentRoot(selId);
            let initialRadiusStr = "0px";
            if (contentRoot) {
              initialRadiusStr = contentRoot.style.borderRadius || window.getComputedStyle(contentRoot).borderRadius || "0px";
            }
            this._radiusStartValues.set(selId, initialRadiusStr);
          }
        }

        this._dragStartCanvas = canvasPos;
        this.ctx.safeSetPointerCapture(e.pointerId);
        this.ctx.emitInteraction("resize-radius", { handler: this.id });
        this.ctx.render();
        return true;
      }
    }

    // ── Spacing Adjusters hit-test ────────────────
    if (this.ctx.selectedIds.size === 1) {
      const selId = this.ctx.selectedIds.values().next().value as string;
      const adjusters = this.ctx.computeSpacingAdjusters(selId);
      const hitAdjuster = adjusters.find(adj =>
        canvasPos.x >= adj.rect.x &&
        canvasPos.x <= adj.rect.x + adj.rect.width &&
        canvasPos.y >= adj.rect.y &&
        canvasPos.y <= adj.rect.y + adj.rect.height
      );

      if (hitAdjuster) {
        // Property lock check for spacing adjuster
        if (this.ctx.isNodeLocked(selId) || this.ctx.isPropertyLocked(selId, hitAdjuster.type)) {
          this.ctx.notifyPropertyLockInteraction(selId, hitAdjuster.type);
          return true; // Claim and block
        }

        this._activeAdjusterType = hitAdjuster.type;
        this._adjusterStartValue = hitAdjuster.value;
        const contentRoot = this.ctx.mount.getContentRoot(selId);
        this._adjusterStartValueStr = contentRoot ? (contentRoot.style.getPropertyValue(hitAdjuster.type) || null) : null;
        this._dragStartCanvas = canvasPos;
        this.ctx.safeSetPointerCapture(e.pointerId);
        this.ctx.emitInteraction("adjust-spacing", { handler: this.id });
        this.ctx.render();
        return true;
      }
    }

    return false;
  }

  onPointerMove(e: PointerEvent, canvasPos: Vec2, containerRect: Rect): void {
    // ── Corner Radius Adjusting ───────────────────
    if (this._isAdjustingRadius && this._dragStartCanvas && this._radiusTargetNodeId) {
      const targetNode = this.ctx.tree.get(this._radiusTargetNodeId);
      if (targetNode && targetNode.currentRect) {
        this.ctx.safeSetPointerCapture(e.pointerId);
        this.ctx.container.style.cursor = "pointer";
        this.ctx.canvas.style.pointerEvents = "auto";
        this.ctx.emitInteraction("resize-radius", { handler: this.id });

        const bounds = targetNode.currentRect;
        const s = this.ctx.viewport.scale;
        const ox = this.ctx.viewport.offsetX;
        const oy = this.ctx.viewport.offsetY;

        const left = bounds.x * s + ox;
        const top = bounds.y * s + oy;
        const right = (bounds.x + bounds.width) * s + ox;
        const bottom = (bounds.y + bounds.height) * s + oy;

        let dragX = 0;
        let dragY = 0;
        if (this._activeRadiusCorner === "tl") {
          dragX = e.clientX - containerRect.x - left;
          dragY = e.clientY - containerRect.y - top;
        } else if (this._activeRadiusCorner === "tr") {
          dragX = right - (e.clientX - containerRect.x);
          dragY = e.clientY - containerRect.y - top;
        } else if (this._activeRadiusCorner === "bl") {
          dragX = e.clientX - containerRect.x - left;
          dragY = bottom - (e.clientY - containerRect.y);
        } else if (this._activeRadiusCorner === "br") {
          dragX = right - (e.clientX - containerRect.x);
          dragY = bottom - (e.clientY - containerRect.y);
        }

        const dragDistScreen = (dragX + dragY) / 2;
        const dragDistCanvas = dragDistScreen / s;

        // Apply to all selected containers
        for (const selId of this.ctx.selectedIds) {
          const selNode = this.ctx.tree.get(selId);
          if (selNode && isContainerNode(selNode) && selNode.currentRect) {
            const maxRadius = Math.min(selNode.currentRect.width, selNode.currentRect.height) / 2;
            const newRadius = Math.max(0, Math.min(maxRadius, Math.round(dragDistCanvas)));
            this.ctx.mount.setNodeStyle(selId, "border-radius", `${newRadius}px`);
            this.ctx.remeasureSubtree(selId);
          }
        }
        this.ctx.render();
      }
      return;
    }

    // ── Spacing Adjusters Dragging ────────────────
    if (this._activeAdjusterType && this._dragStartCanvas) {
      const selId = this.ctx.selectedIds.values().next().value as string;
      const node = this.ctx.tree.get(selId);
      if (!node) return;

      this.ctx.safeSetPointerCapture(e.pointerId);
      this.ctx.canvas.style.pointerEvents = "auto";
      this.ctx.emitInteraction("adjust-spacing", { handler: this.id });

      const isVertical = this._activeAdjusterType.includes("top") || this._activeAdjusterType.includes("bottom");
      this.ctx.container.style.cursor = isVertical ? "ns-resize" : "ew-resize";

      const dx = canvasPos.x - this._dragStartCanvas.x;
      const dy = canvasPos.y - this._dragStartCanvas.y;

      let delta = 0;
      switch (this._activeAdjusterType) {
        case "padding-top":
          delta = dy;
          break;
        case "padding-bottom":
          delta = -dy;
          break;
        case "padding-left":
          delta = dx;
          break;
        case "padding-right":
          delta = -dx;
          break;
        case "margin-top":
          delta = -dy;
          break;
        case "margin-bottom":
          delta = -dy;
          break;
        case "margin-left":
          delta = -dx;
          break;
        case "margin-right":
          delta = -dx;
          break;
      }

      const contentRoot = this.ctx.mount.getContentRoot(selId);
      const internalScale = contentRoot ? this.ctx.mount.getElementScale(contentRoot) : 1;
      const safeScale = internalScale && !isNaN(internalScale) ? internalScale : 1;

      const newValue = Math.max(0, Math.round(this._adjusterStartValue + delta / safeScale));

      // Style surgery - direct DOM mutation
      this.ctx.mount.setNodeStyle(selId, this._activeAdjusterType, `${newValue}px`);

      // Synchronous reflow + measurement
      this.ctx.remeasureSubtree(selId);
      if (node.parentId) {
        this.ctx.remeasureSubtree(node.parentId);
      }

      this.ctx.render();
    }
  }

  onPointerUp(_e: PointerEvent, _canvasPos: Vec2, _containerRect: Rect): void {
    const operations: any[] = [];

    if (this._activeAdjusterType) {
      if (this.ctx.selectedIds.size === 1) {
        const selId = this.ctx.selectedIds.values().next().value as string;
        const contentRoot = this.ctx.mount.getContentRoot(selId);
        if (contentRoot && this._activeAdjusterType) {
          const finalValueStr = contentRoot.style.getPropertyValue(this._activeAdjusterType) || null;
          if (finalValueStr !== this._adjusterStartValueStr) {
            operations.push({
              type: "update-style",
              nodeId: selId,
              payload: { [this._activeAdjusterType]: finalValueStr },
              undoPayload: { [this._activeAdjusterType]: this._adjusterStartValueStr }
            });
          }
        }
        const node = this.ctx.tree.get(selId);
        const commitId = (node && node.parentId !== null) ? node.parentId : selId;

        if (operations.length > 0) {
          this.ctx.callbacks.onOperationsGenerated?.(operations);
          const html = this.ctx.mount.extractHTML(commitId);
          if (html) {
            this.ctx.callbacks.onHTMLCommit?.(commitId, html);
          }
        }
      }
      this._activeAdjusterType = null;
      this._dragStartCanvas = null;
      this.ctx.container.style.cursor = "default";
      this._adjusterStartValueStr = null;
    }

    if (this._isAdjustingRadius) {
      const parentsToCommit = new Set<string>();
      for (const selId of this.ctx.selectedIds) {
        const selNode = this.ctx.tree.get(selId);
        if (selNode && isContainerNode(selNode)) {
          const contentRoot = this.ctx.mount.getContentRoot(selId);
          if (contentRoot) {
            const finalRadiusStr = contentRoot.style.borderRadius || "";
            const initialRadiusStr = this._radiusStartValues.get(selId) || "0px";
            if (finalRadiusStr !== initialRadiusStr) {
              operations.push({
                type: "update-style",
                nodeId: selId,
                payload: { "border-radius": finalRadiusStr },
                undoPayload: { "border-radius": initialRadiusStr }
              });
              if (selNode.parentId) {
                parentsToCommit.add(selNode.parentId);
              } else {
                parentsToCommit.add(selId);
              }
            }
          }
        }
      }

      for (const commitId of parentsToCommit) {
        const html = this.ctx.mount.extractHTML(commitId);
        if (html) {
          this.ctx.callbacks.onHTMLCommit?.(commitId, html);
        }
      }

      if (operations.length > 0) {
        this.ctx.callbacks.onOperationsGenerated?.(operations);
      }

      this._isAdjustingRadius = false;
      this._activeRadiusCorner = null;
      this._radiusTargetNodeId = null;
      this._radiusStartValues.clear();
      this._dragStartCanvas = null;
      this.ctx.container.style.cursor = "default";
    }

    this.ctx.emitInteraction(null);
    this.ctx.render();
  }

  onCancel(): void {
    this._activeAdjusterType = null;
    this._isAdjustingRadius = false;
    this._activeRadiusCorner = null;
    this._radiusTargetNodeId = null;
    this._radiusStartValues.clear();
    this._dragStartCanvas = null;
    this.ctx.container.style.cursor = "default";
    this.ctx.emitInteraction(null);
    this.ctx.render();
  }
}
