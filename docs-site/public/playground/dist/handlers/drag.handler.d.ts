import type { Rect, Vec2 } from "../types.js";
import type { InteractionHandler, WorkspaceContext } from "./types.js";
/**
 * Manages node dragging, multi-selection drags, drop zones, cloning, and alignment guides.
 */
export declare class DragHandler implements InteractionHandler {
    readonly id = "drag";
    private ctx;
    private _isDragging;
    private _isDragCopy;
    private _pointerDownReadyToDrag;
    private _pointerDownInsideSelection;
    private _dragStartCanvas;
    private readonly _dragStartNodes;
    constructor(ctx: WorkspaceContext);
    get isDragging(): boolean;
    claim(e: PointerEvent, canvasPos: Vec2, hitNodeId: string | null, _containerRect: Rect): boolean;
    onPointerMove(e: PointerEvent, canvasPos: Vec2, _containerRect: Rect): void;
    onPointerUp(e: PointerEvent, canvasPos: Vec2, _containerRect: Rect): void;
    onCancel(): void;
}
//# sourceMappingURL=drag.handler.d.ts.map