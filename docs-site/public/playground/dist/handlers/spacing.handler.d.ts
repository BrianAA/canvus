import type { Rect, Vec2 } from "../types.js";
import type { SpacingAdjusterType } from "../renderer.js";
import type { InteractionHandler, WorkspaceContext } from "./types.js";
/**
 * Manages margin, padding, and corner radius adjustment gestures.
 */
export declare class SpacingHandler implements InteractionHandler {
    readonly id = "spacing";
    private ctx;
    hoveredAdjusterType: SpacingAdjusterType | null;
    hoveredRadiusCorner: string | null;
    private _activeAdjusterType;
    private _adjusterStartValue;
    private _adjusterStartValueStr;
    private _isAdjustingRadius;
    private _activeRadiusCorner;
    private _radiusTargetNodeId;
    private _radiusStartValues;
    private _dragStartCanvas;
    constructor(ctx: WorkspaceContext);
    get activeAdjusterType(): SpacingAdjusterType | null;
    get isAdjustingRadius(): boolean;
    get activeRadiusCorner(): string | null;
    claim(e: PointerEvent, canvasPos: Vec2, hitNodeId: string | null, containerRect: Rect): boolean;
    onPointerMove(e: PointerEvent, canvasPos: Vec2, containerRect: Rect): void;
    onPointerUp(_e: PointerEvent, _canvasPos: Vec2, _containerRect: Rect): void;
    onCancel(): void;
}
//# sourceMappingURL=spacing.handler.d.ts.map