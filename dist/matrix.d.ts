import type { Rect, Vec2, ViewportMatrix } from "./types.js";
/**
 * Projects a raw screen-space pointer coordinate (e.g. `MouseEvent.clientX/Y`)
 * into the infinite canvas coordinate space, accounting for:
 *   1. The canvas element's own position within the page (`canvasRect`).
 *   2. The current pan offset (`viewport.offsetX/Y`).
 *   3. The current zoom scale (`viewport.scale`).
 *
 * Derivation:
 *   screenX = canvasX * scale + offsetX + canvasRect.x
 *   ⟹ canvasX = (clientX - canvasRect.x - offsetX) / scale
 *
 * @param clientX - `MouseEvent.clientX` (viewport-relative screen pixel).
 * @param clientY - `MouseEvent.clientY` (viewport-relative screen pixel).
 * @param viewport - Current affine viewport transform state.
 * @param canvasRect - Bounding rect of the `<canvas>` element on screen.
 * @returns The corresponding point in canvas (world) space.
 */
export declare function screenToCanvas(clientX: number, clientY: number, viewport: Readonly<ViewportMatrix>, canvasRect: Readonly<Rect>): Vec2;
/**
 * Projects a canvas-space coordinate back to absolute screen pixels,
 * the algebraic inverse of `screenToCanvas`.
 *
 * Derivation:
 *   screenX = canvasX * scale + offsetX + canvasRect.x
 *
 * @param canvasX - X position in canvas (world) space.
 * @param canvasY - Y position in canvas (world) space.
 * @param viewport - Current affine viewport transform state.
 * @param canvasRect - Bounding rect of the `<canvas>` element on screen.
 * @returns The corresponding point in screen (client) space.
 */
export declare function canvasToScreen(canvasX: number, canvasY: number, viewport: Readonly<ViewportMatrix>, canvasRect: Readonly<Rect>): Vec2;
/**
 * Computes a new `ViewportMatrix` after applying a zoom delta
 * anchored precisely at the cursor's current screen position.
 *
 * The key invariant: the canvas-space point directly beneath the
 * cursor must map to the *exact same screen pixel* before and
 * after the zoom. This prevents the jarring "zoom drift" that
 * occurs with naïve center-point scaling.
 *
 * ### Mathematical derivation
 *
 * Let `(cx, cy)` be the cursor in screen-space relative to the
 * canvas element origin:
 *   cx = clientX - canvasRect.x
 *   cy = clientY - canvasRect.y
 *
 * Before zoom, the canvas-space point under the cursor is:
 *   worldX = (cx - offsetX) / oldScale
 *   worldY = (cy - offsetY) / oldScale
 *
 * After zoom with `newScale`, we require the same world point to
 * project back to `(cx, cy)`:
 *   cx = worldX * newScale + newOffsetX
 *   cy = worldY * newScale + newOffsetY
 *
 * Solving for the new offsets:
 *   newOffsetX = cx - worldX * newScale
 *              = cx - ((cx - offsetX) / oldScale) * newScale
 *              = cx * (1 - newScale / oldScale) + offsetX * (newScale / oldScale)
 *
 * Equivalently (and more numerically stable):
 *   newOffsetX = cx - (cx - offsetX) * (newScale / oldScale)
 *
 * @param clientX     - `MouseEvent.clientX` at the zoom gesture origin.
 * @param clientY     - `MouseEvent.clientY` at the zoom gesture origin.
 * @param scaleDelta  - Multiplicative scale factor to apply (e.g. 1.1 for zoom-in).
 * @param viewport    - The current viewport transform state before zooming.
 * @param canvasRect  - Bounding rect of the `<canvas>` element on screen.
 * @returns A new `ViewportMatrix` with the anchored zoom applied.
 */
export declare function calculateZoomAnchor(clientX: number, clientY: number, scaleDelta: number, viewport: Readonly<ViewportMatrix>, canvasRect: Readonly<Rect>): ViewportMatrix;
/**
 * Convenience wrapper that converts a `WheelEvent.deltaY` value
 * into a multiplicative scale factor and delegates to
 * `calculateZoomAnchor`.
 *
 * Scroll-up (negative deltaY) zooms in, scroll-down zooms out.
 * The sensitivity constant (0.001) yields a smooth, non-jarring
 * zoom curve across trackpad and discrete-notch scroll wheels.
 *
 * @param clientX    - `MouseEvent.clientX` at the wheel event.
 * @param clientY    - `MouseEvent.clientY` at the wheel event.
 * @param deltaY     - `WheelEvent.deltaY` (positive = scroll down = zoom out).
 * @param viewport   - Current viewport state.
 * @param canvasRect - Canvas element bounding rect.
 * @returns A new `ViewportMatrix` with the wheel-zoom applied.
 */
export declare function applyWheelZoom(clientX: number, clientY: number, deltaY: number, viewport: Readonly<ViewportMatrix>, canvasRect: Readonly<Rect>, isPinch?: boolean): ViewportMatrix;
/**
 * Applies a screen-space pan delta to the viewport offset.
 * Typically driven by pointer-move events while spacebar is held
 * or middle-mouse is pressed.
 *
 * @param dx - Horizontal screen-pixel delta (`e.movementX`).
 * @param dy - Vertical screen-pixel delta (`e.movementY`).
 * @param viewport - Current viewport state.
 * @returns A new `ViewportMatrix` with the pan offset applied.
 */
export declare function applyPan(dx: number, dy: number, viewport: Readonly<ViewportMatrix>): ViewportMatrix;
/**
 * Axis-Aligned Bounding Box (AABB) point-inclusion test.
 *
 * Returns `true` if the point `(x, y)` lies within (or exactly on
 * the boundary of) the rectangle described by `bounds`.
 *
 * Both coordinates and bounds should be in the same space
 * (typically canvas-space after `screenToCanvas` conversion).
 *
 * @param x - Point X coordinate.
 * @param y - Point Y coordinate.
 * @param bounds - The axis-aligned bounding rectangle to test against.
 * @returns Whether the point is inside or on the edge of `bounds`.
 */
export declare function isPointInElement(x: number, y: number, bounds: Readonly<Rect>): boolean;
/**
 * Determines which `WebHTMLNode` (if any) is hit by a canvas-space
 * point, respecting z-order (last in the array = topmost).
 *
 * @param x - Canvas-space X coordinate.
 * @param y - Canvas-space Y coordinate.
 * @param elements - Array of elements with `id` and bounding `Rect`.
 * @returns The `id` of the topmost hit element, or `null` if none.
 */
export declare function hitTestElements(x: number, y: number, elements: ReadonlyArray<Readonly<{
    id: string;
    currentRect: Rect | null;
}>>): string | null;
/**
 * Computes the screen-space positions of all 8 resize anchor
 * handles for a given element bounding box.
 *
 * Returns an object keyed by anchor direction with the
 * corresponding screen-space `Vec2` position of each handle center.
 *
 * @param bounds    - The element's bounding rect in canvas-space.
 * @param viewport  - Current viewport transform.
 * @param canvasRect - Canvas element bounding rect on screen.
 * @returns Record mapping each anchor to its screen-space center point.
 */
export declare function getAnchorPositions(bounds: Readonly<Rect>, viewport: Readonly<ViewportMatrix>, canvasRect: Readonly<Rect>): Record<"nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w", Vec2>;
/** Clamps a scale value to the allowed zoom range. */
export declare function clampScale(s: number): number;
/**
 * Linearly interpolates between two values.
 * Useful for animated viewport transitions.
 *
 * @param a - Start value.
 * @param b - End value.
 * @param t - Interpolation factor in [0, 1].
 */
export declare function lerp(a: number, b: number, t: number): number;
/**
 * Linearly interpolates between two `ViewportMatrix` states.
 * Useful for smooth animated zoom/pan transitions.
 *
 * @param from - Starting viewport.
 * @param to   - Target viewport.
 * @param t    - Interpolation factor in [0, 1].
 */
export declare function lerpViewport(from: Readonly<ViewportMatrix>, to: Readonly<ViewportMatrix>, t: number): ViewportMatrix;
/**
 * Checks if two axis-aligned bounding rectangles intersect.
 */
export declare function rectsIntersect(r1: Readonly<Rect>, r2: Readonly<Rect>): boolean;
//# sourceMappingURL=matrix.d.ts.map