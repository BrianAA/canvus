import type { Rect, Vec2, CanvusTool } from "../types.js";
import type { InteractionHandler, WorkspaceContext } from "./types.js";
/**
 * Manages the box/text drawing tool gesture.
 *
 * When a drawing tool is active (box or text), this handler claims
 * the pointer gesture and manages the full draw lifecycle:
 * pointerdown → drag rect → pointerup → commit new node.
 */
export declare class DrawHandler implements InteractionHandler {
    readonly id = "draw";
    private ctx;
    private _activeTool;
    private _drawingTag;
    private _drawingTextTag;
    private _isDrawing;
    private _drawStartCanvas;
    private _drawCurrentCanvas;
    constructor(ctx: WorkspaceContext);
    /** Sets the active drawing tool (box, text, or null for idle). */
    setActiveTool(tool: CanvusTool): void;
    /** Returns the currently active drawing tool. */
    getActiveTool(): CanvusTool;
    /** Customizes the HTML tag type for box or text drawing. */
    setDrawingTag(tag: string): void;
    /** Returns the active drawing tag based on the selected tool. */
    getDrawingTag(): string;
    /** Whether a draw gesture is currently in progress. */
    get isDrawing(): boolean;
    /** Returns the drawing preview rect in canvas-space, or null. */
    getDrawingRect(): Rect | null;
    claim(e: PointerEvent, canvasPos: Vec2, _hitNodeId: string | null, _containerRect: Rect): boolean;
    onPointerMove(_e: PointerEvent, canvasPos: Vec2, _containerRect: Rect): void;
    onPointerUp(e: PointerEvent, _canvasPos: Vec2, _containerRect: Rect): void;
    onCancel(): void;
}
//# sourceMappingURL=draw.handler.d.ts.map