import type { Rect, Vec2 } from "../types.js";
import type { InteractionHandler, WorkspaceContext } from "./types.js";
/**
 * Fallback interaction handler managing marquee selection, click selections, and container drill-down scoping.
 */
export declare class SelectionHandler implements InteractionHandler {
    readonly id = "selection";
    private ctx;
    private _isMarqueeSelecting;
    private _marqueeStartCanvas;
    private _marqueeCurrentCanvas;
    private readonly _preMarqueeSelectedIds;
    private _marqueeEnteredContainerId;
    constructor(ctx: WorkspaceContext);
    get isMarqueeSelecting(): boolean;
    getMarqueeRect(): Rect | null;
    claim(e: PointerEvent, canvasPos: Vec2, hitNodeId: string | null, _containerRect: Rect): boolean;
    onPointerMove(e: PointerEvent, canvasPos: Vec2, _containerRect: Rect): void;
    onPointerUp(e: PointerEvent, _canvasPos: Vec2, _containerRect: Rect): void;
    onCancel(): void;
}
//# sourceMappingURL=selection.handler.d.ts.map