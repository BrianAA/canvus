import type { Rect, Vec2 } from "../types.js";
import type { InteractionHandler, WorkspaceContext } from "./types.js";
/**
 * Manages canvas panning via space+drag or middle-mouse-button drag.
 *
 * The PanHandler does NOT handle wheel-based zoom/pan — that
 * remains in the Workspace's `handleWheel` since it's not a
 * pointer gesture (wheel events have their own lifecycle).
 */
export declare class PanHandler implements InteractionHandler {
    readonly id = "pan";
    private ctx;
    private isPanning;
    constructor(ctx: WorkspaceContext);
    /** Whether the space key is currently held down. */
    spaceDown: boolean;
    /**
     * Called by Workspace on keydown Space to enter pan-ready state.
     * Sets the panning cursor immediately.
     */
    onSpaceDown(): void;
    /**
     * Called by Workspace on keyup Space to exit pan-ready state.
     * Only removes cursor if not actively in a pan gesture.
     */
    onSpaceUp(): void;
    claim(e: PointerEvent, _canvasPos: Vec2, _hitNodeId: string | null, _containerRect: Rect): boolean;
    onPointerMove(e: PointerEvent, _canvasPos: Vec2, _containerRect: Rect): void;
    onPointerUp(e: PointerEvent, _canvasPos: Vec2, _containerRect: Rect): void;
    onCancel(): void;
    /** Returns whether the handler is currently in an active pan gesture. */
    get isActive(): boolean;
}
//# sourceMappingURL=pan.handler.d.ts.map