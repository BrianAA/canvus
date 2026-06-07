// ─────────────────────────────────────────────────────────────
// canvus/src/handlers/draw.handler.ts
// Handles the box/text drawing tool lifecycle.
//
// Claim conditions:
// - activeTool is not null AND pointerdown with left button (button === 0)
//
// Lifecycle:
// - claim: sets isDrawing, captures start position
// - onPointerMove: updates current position, resolves drop targets
// - onPointerUp: commits the new node, generates operations, clears tool
// ─────────────────────────────────────────────────────────────

import type { Rect, Vec2, CanvusTool } from "../types.js";
import type { InteractionHandler, WorkspaceContext } from "./types.js";
import { findDropTarget } from "../drop-zone.js";

/**
 * Manages the box/text drawing tool gesture.
 *
 * When a drawing tool is active (box or text), this handler claims
 * the pointer gesture and manages the full draw lifecycle:
 * pointerdown → drag rect → pointerup → commit new node.
 */
export class DrawHandler implements InteractionHandler {
  readonly id = "draw";

  private ctx: WorkspaceContext;

  // ── Drawing State ───────────────────────────────

  private _activeTool: CanvusTool = null;
  private _drawingTag = "div";
  private _drawingTextTag = "p";
  private _isDrawing = false;
  private _drawStartCanvas: Vec2 | null = null;
  private _drawCurrentCanvas: Vec2 | null = null;

  constructor(ctx: WorkspaceContext) {
    this.ctx = ctx;
  }

  // ── Public API (delegated from Workspace) ───────

  /** Sets the active drawing tool (box, text, or null for idle). */
  setActiveTool(tool: CanvusTool): void {
    this._activeTool = tool;
    this.ctx.container.style.cursor = tool ? "crosshair" : "default";

    if (tool !== null) {
      this.ctx.deselectAll();
    }

    this.ctx.emitInteraction(tool ? `draw-${tool}` : null, { handler: this.id });
    this.ctx.render();
  }

  /** Returns the currently active drawing tool. */
  getActiveTool(): CanvusTool {
    return this._activeTool;
  }

  /** Customizes the HTML tag type for box or text drawing. */
  setDrawingTag(tag: string): void {
    const lower = tag.toLowerCase().trim();
    const textTags = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "a", "strong", "em", "li", "ul", "ol"];
    if (textTags.includes(lower)) {
      this._drawingTextTag = lower;
    } else {
      this._drawingTag = lower;
    }
  }

  /** Returns the active drawing tag based on the selected tool. */
  getDrawingTag(): string {
    return this._activeTool === "text" ? this._drawingTextTag : this._drawingTag;
  }

  // ── Render State Queries (for renderSync) ───────

  /** Whether a draw gesture is currently in progress. */
  get isDrawing(): boolean {
    return this._isDrawing;
  }

  /** Returns the drawing preview rect in canvas-space, or null. */
  getDrawingRect(): Rect | null {
    if (!this._isDrawing || !this._drawStartCanvas || !this._drawCurrentCanvas) {
      return null;
    }
    return {
      x: Math.min(this._drawStartCanvas.x, this._drawCurrentCanvas.x),
      y: Math.min(this._drawStartCanvas.y, this._drawCurrentCanvas.y),
      width: Math.abs(this._drawStartCanvas.x - this._drawCurrentCanvas.x),
      height: Math.abs(this._drawStartCanvas.y - this._drawCurrentCanvas.y),
    };
  }

  // ── InteractionHandler Interface ────────────────

  claim(
    e: PointerEvent,
    canvasPos: Vec2,
    _hitNodeId: string | null,
    _containerRect: Rect,
  ): boolean {
    if (this._activeTool !== null && e.button === 0) {
      this._isDrawing = true;
      this._drawStartCanvas = canvasPos;
      this._drawCurrentCanvas = canvasPos;
      this.ctx.activeDropTarget = null;
      this.ctx.guides = [];
      this.ctx.safeSetPointerCapture(e.pointerId);
      this.ctx.emitInteraction("draw-node", { handler: this.id });
      this.ctx.render();
      return true;
    }
    return false;
  }

  onPointerMove(_e: PointerEvent, canvasPos: Vec2, _containerRect: Rect): void {
    if (!this._isDrawing || !this._drawStartCanvas) return;

    this._drawCurrentCanvas = canvasPos;

    // Dynamically resolve target container for drop preview
    this.ctx.activeDropTarget = findDropTarget(
      "__new_node__",
      canvasPos,
      this.ctx.tree,
      (id) => this.ctx.mount.getWrapper(id),
      (id) => this.ctx.mount.getContentRoot(id),
    );

    this.ctx.render();
  }

  onPointerUp(e: PointerEvent, _canvasPos: Vec2, _containerRect: Rect): void {
    if (!this._isDrawing || !this._drawStartCanvas || !this._drawCurrentCanvas) return;

    this._isDrawing = false;
    const start = this._drawStartCanvas;
    const end = this._drawCurrentCanvas;
    this._drawStartCanvas = null;
    this._drawCurrentCanvas = null;

    try {
      this.ctx.container.releasePointerCapture(e.pointerId);
    } catch {}

    // Calculate drawn dimensions
    let x = Math.min(start.x, end.x);
    let y = Math.min(start.y, end.y);
    let width = Math.abs(start.x - end.x);
    let height = Math.abs(start.y - end.y);

    // Apply defaults if users did a simple click-to-draw
    if (width < 8 && height < 8) {
      if (this._activeTool === "box") {
        width = 120;
        height = 120;
      } else {
        width = 180;
        height = 40;
      }
    }

    const parentTarget = this.ctx.activeDropTarget;
    this.ctx.activeDropTarget = null;

    // Determine final placement
    let parentId = parentTarget?.parentId ?? null;
    let index = parentTarget?.insertionIndex;

    const counter = this.ctx.nextElementId();
    const id = `${this._activeTool || "node"}-${counter}-${Date.now().toString(36)}`;

    let rawMarkup = "";
    if (this._activeTool === "box") {
      const tag = this._drawingTag;
      rawMarkup = `<${tag} style="background:rgba(99, 102, 241, 0.05);border:1.5px dashed #6366f1;border-radius:8px;box-sizing:border-box;width:100%;height:100%;min-width:40px;min-height:40px;"></${tag}>`;
    } else {
      const tag = this._drawingTextTag;
      let fontSize = "16px";
      let fontWeight = "400";
      if (tag.match(/^h[1-6]$/)) {
        fontWeight = "700";
        if (tag === "h1") fontSize = "28px";
        else if (tag === "h2") fontSize = "24px";
        else if (tag === "h3") fontSize = "20px";
        else fontSize = "18px";
      }
      rawMarkup = `<${tag} style="margin:0;font-family:sans-serif;font-size:${fontSize};font-weight:${fontWeight};color:#e8e8f0;line-height:1.5;outline:none;min-width:100px;">Double-click to edit text</${tag}>`;
    }

    let rect: Rect = { x, y, width, height };

    // Temporary disable transitions during mount
    this.ctx.mount.setTransitionsEnabled(false);

    // Perform addition
    if (parentId !== null && parentTarget?.gridPlacement) {
      const gp = parentTarget.gridPlacement;
      const gridStyles = {
        "grid-column-start": `${gp.colStart}`,
        "grid-column-end": `span ${gp.colSpan}`,
        "grid-row-start": `${gp.rowStart}`,
        "grid-row-end": `span ${gp.rowSpan}`,
      };

      this.ctx.addNode({ id, rawMarkup, currentRect: gp.rect }, parentId, 0);
      this.ctx.setNodeStyles(id, gridStyles);
      rect = gp.rect;
    } else {
      this.ctx.addNode({ id, rawMarkup, currentRect: rect }, parentId, index);
    }

    this.ctx.selectNode(id);

    // Operations
    this.ctx.callbacks.onOperationsGenerated?.([{
      type: "create-node" as any,
      nodeId: id,
      payload: { parentId, index, rawMarkup, rect },
      undoPayload: { parentId }
    }]);

    // HTML commit
    const commitTarget = parentId ?? id;
    const html = this.ctx.mount.extractHTML(commitTarget);
    if (html) {
      this.ctx.callbacks.onHTMLCommit?.(commitTarget, html);
    }

    // Clear active tool
    this.setActiveTool(null);
    this.ctx.mount.setTransitionsEnabled(true);

    this.ctx.render();
  }

  onCancel(): void {
    if (this._isDrawing) {
      this._isDrawing = false;
      this._drawStartCanvas = null;
      this._drawCurrentCanvas = null;
      this.ctx.activeDropTarget = null;
      this.ctx.emitInteraction(null);
      this.ctx.render();
    }
  }
}
