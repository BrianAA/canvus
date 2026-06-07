// ─────────────────────────────────────────────────────────────
// canvus/src/handlers/pan.handler.ts
// Handles pan (space+drag, middle-mouse) and zoom (wheel) gestures.
//
// Claim conditions:
// - Space key is held down + pointerdown (any button)
// - Middle mouse button (button === 1)
// ─────────────────────────────────────────────────────────────

import type { Rect, Vec2 } from "../types.js";
import type { InteractionHandler, WorkspaceContext } from "./types.js";
import { applyPan } from "../matrix.js";

/**
 * Manages canvas panning via space+drag or middle-mouse-button drag.
 *
 * The PanHandler does NOT handle wheel-based zoom/pan — that
 * remains in the Workspace's `handleWheel` since it's not a
 * pointer gesture (wheel events have their own lifecycle).
 */
export class PanHandler implements InteractionHandler {
  readonly id = "pan";

  private ctx: WorkspaceContext;
  private isPanning = false;

  constructor(ctx: WorkspaceContext) {
    this.ctx = ctx;
  }

  // ── Space Key State ─────────────────────────────

  /** Whether the space key is currently held down. */
  spaceDown = false;

  /**
   * Called by Workspace on keydown Space to enter pan-ready state.
   * Sets the panning cursor immediately.
   */
  onSpaceDown(): void {
    this.spaceDown = true;
    this.ctx.container.classList.add("canvus-panning");
  }

  /**
   * Called by Workspace on keyup Space to exit pan-ready state.
   * Only removes cursor if not actively in a pan gesture.
   */
  onSpaceUp(): void {
    this.spaceDown = false;
    if (!this.isPanning) {
      this.ctx.container.classList.remove("canvus-panning");
    }
  }

  // ── InteractionHandler Interface ────────────────

  claim(
    e: PointerEvent,
    _canvasPos: Vec2,
    _hitNodeId: string | null,
    _containerRect: Rect,
  ): boolean {
    if (this.spaceDown || e.button === 1) {
      if (e.button === 1) {
        e.preventDefault();
      }
      this.isPanning = true;
      this.ctx.container.classList.add("canvus-panning");
      this.ctx.safeSetPointerCapture(e.pointerId);
      this.ctx.emitInteraction("pan", { handler: this.id });
      return true;
    }
    return false;
  }

  onPointerMove(e: PointerEvent, _canvasPos: Vec2, _containerRect: Rect): void {
    if (!this.isPanning) return;

    this.ctx.viewport = applyPan(
      e.movementX, e.movementY, this.ctx.viewport,
    );
    this.ctx.mount.applyViewportTransform(this.ctx.viewport);
    this.ctx.callbacks.onViewportChange?.(this.ctx.viewport);
    this.ctx.render();
  }

  onPointerUp(e: PointerEvent, _canvasPos: Vec2, _containerRect: Rect): void {
    if (!this.isPanning) return;

    this.isPanning = false;
    this.ctx.container.classList.remove("canvus-panning");
    this.ctx.canvas.style.pointerEvents = "none";
    this.ctx.emitInteraction(null);

    try {
      this.ctx.container.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was already released
    }

    this.ctx.render();
  }

  onCancel(): void {
    if (this.isPanning) {
      this.isPanning = false;
      this.ctx.container.classList.remove("canvus-panning");
      this.ctx.emitInteraction(null);
    }
  }

  // ── Query State ─────────────────────────────────

  /** Returns whether the handler is currently in an active pan gesture. */
  get isActive(): boolean {
    return this.isPanning;
  }
}
