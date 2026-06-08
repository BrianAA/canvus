// ─────────────────────────────────────────────────────────────
// canvus/src/matrix.ts
// Pure mathematical viewport transform utilities.
// Every function is stateless, side-effect free, and operates
// exclusively on the primitive types defined in types.ts.
// ─────────────────────────────────────────────────────────────
import { ZOOM_MAX, ZOOM_MIN } from "./types.js";
// ── Coordinate Space Conversions ────────────────────────────
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
export function screenToCanvas(clientX, clientY, viewport, canvasRect) {
    return {
        x: (clientX - canvasRect.x - viewport.offsetX) / viewport.scale,
        y: (clientY - canvasRect.y - viewport.offsetY) / viewport.scale,
    };
}
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
export function canvasToScreen(canvasX, canvasY, viewport, canvasRect) {
    return {
        x: canvasX * viewport.scale + viewport.offsetX + canvasRect.x,
        y: canvasY * viewport.scale + viewport.offsetY + canvasRect.y,
    };
}
// ── Zoom Anchoring ──────────────────────────────────────────
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
export function calculateZoomAnchor(clientX, clientY, scaleDelta, viewport, canvasRect) {
    const newScale = clampScale(viewport.scale * scaleDelta);
    // Actual ratio may differ from `scaleDelta` due to clamping.
    const effectiveRatio = newScale / viewport.scale;
    // Cursor position relative to the canvas element's top-left corner.
    const cx = clientX - canvasRect.x;
    const cy = clientY - canvasRect.y;
    // Re-derive offsets so the world-point under (cx, cy) is invariant.
    const newOffsetX = cx - (cx - viewport.offsetX) * effectiveRatio;
    const newOffsetY = cy - (cy - viewport.offsetY) * effectiveRatio;
    return {
        scale: newScale,
        offsetX: newOffsetX,
        offsetY: newOffsetY,
    };
}
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
export function applyWheelZoom(clientX, clientY, deltaY, viewport, canvasRect, isPinch = false) {
    // Trackpad pinch events have small deltas. We use a higher sensitivity (0.01)
    // for pinch to make it feel fluid, and a standard sensitivity (0.001) for regular scroll.
    const sensitivity = isPinch ? 0.01 : 0.001;
    let scaleDelta = Math.exp(-deltaY * sensitivity);
    // Clamp the scaleDelta to a safe range per event [0.85, 1.15] (15% max change)
    // to prevent standard mouse wheel zooms (e.g. Ctrl + Mouse Wheel) from zooming too fast.
    scaleDelta = Math.min(1.15, Math.max(0.85, scaleDelta));
    return calculateZoomAnchor(clientX, clientY, scaleDelta, viewport, canvasRect);
}
// ── Pan (Translate) ─────────────────────────────────────────
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
export function applyPan(dx, dy, viewport) {
    return {
        scale: viewport.scale,
        offsetX: viewport.offsetX + dx,
        offsetY: viewport.offsetY + dy,
    };
}
// ── Hit Testing ─────────────────────────────────────────────
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
export function isPointInElement(x, y, bounds) {
    return (x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height);
}
/**
 * Determines which `WebHTMLNode` (if any) is hit by a canvas-space
 * point, respecting z-order (last in the array = topmost).
 *
 * @param x - Canvas-space X coordinate.
 * @param y - Canvas-space Y coordinate.
 * @param elements - Array of elements with `id` and bounding `Rect`.
 * @returns The `id` of the topmost hit element, or `null` if none.
 */
export function hitTestElements(x, y, elements) {
    // Walk backwards for top-most-first z-order.
    for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (el.currentRect && isPointInElement(x, y, el.currentRect)) {
            return el.id;
        }
    }
    return null;
}
// ── Resize Anchor Positions ─────────────────────────────────
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
export function getAnchorPositions(bounds, viewport, canvasRect) {
    const { x, y, width, height } = bounds;
    // Canvas-space anchor centers (mid-edge and corners).
    const midX = x + width / 2;
    const midY = y + height / 2;
    const right = x + width;
    const bottom = y + height;
    const toScreen = (cx, cy) => canvasToScreen(cx, cy, viewport, canvasRect);
    return {
        nw: toScreen(x, y),
        n: toScreen(midX, y),
        ne: toScreen(right, y),
        e: toScreen(right, midY),
        se: toScreen(right, bottom),
        s: toScreen(midX, bottom),
        sw: toScreen(x, bottom),
        w: toScreen(x, midY),
    };
}
// ── Utilities ───────────────────────────────────────────────
/** Clamps a scale value to the allowed zoom range. */
export function clampScale(s) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s));
}
/**
 * Linearly interpolates between two values.
 * Useful for animated viewport transitions.
 *
 * @param a - Start value.
 * @param b - End value.
 * @param t - Interpolation factor in [0, 1].
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}
/**
 * Linearly interpolates between two `ViewportMatrix` states.
 * Useful for smooth animated zoom/pan transitions.
 *
 * @param from - Starting viewport.
 * @param to   - Target viewport.
 * @param t    - Interpolation factor in [0, 1].
 */
export function lerpViewport(from, to, t) {
    return {
        scale: lerp(from.scale, to.scale, t),
        offsetX: lerp(from.offsetX, to.offsetX, t),
        offsetY: lerp(from.offsetY, to.offsetY, t),
    };
}
/**
 * Checks if two axis-aligned bounding rectangles intersect.
 */
export function rectsIntersect(r1, r2) {
    return !(r2.x > r1.x + r1.width ||
        r2.x + r2.width < r1.x ||
        r2.y > r1.y + r1.height ||
        r2.y + r2.height < r1.y);
}
//# sourceMappingURL=matrix.js.map