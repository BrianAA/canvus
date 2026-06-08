import type { Rect, Vec2, ResizeAnchor } from "../types.js";
import type { InteractionHandler, WorkspaceContext } from "./types.js";
/**
 * Maps a resize anchor to the CSS properties it affects.
 */
export declare function getLockedPropertiesForAnchor(anchor: ResizeAnchor): string[];
/**
 * Manages the element resizing gesture.
 */
export declare class ResizeHandler implements InteractionHandler {
    readonly id = "resize";
    private ctx;
    private _isResizing;
    private _activeAnchor;
    private _resizeStartRect;
    private _dragStartCanvas;
    private _dragStartStyles;
    constructor(ctx: WorkspaceContext);
    get isResizing(): boolean;
    get activeAnchor(): ResizeAnchor | null;
    claim(e: PointerEvent, canvasPos: Vec2, hitNodeId: string | null, containerRect: Rect): boolean;
    onPointerMove(e: PointerEvent, canvasPos: Vec2, _containerRect: Rect): void;
    onPointerUp(e: PointerEvent, _canvasPos: Vec2, _containerRect: Rect): void;
    onCancel(): void;
}
//# sourceMappingURL=resize.handler.d.ts.map