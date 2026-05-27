// ─────────────────────────────────────────────────────────────
// canvus/src/drop-zone.ts
// Flow-Aware Drop Target Detection & Insertion Index Engine.
//
// Calculates candidate parent containers and insertion points
// during drag operations based on container CSS flow layouts.
// ─────────────────────────────────────────────────────────────
import { detectLayout, getFlowAxis, parseGridTracks, getGridCellAt, getGridAreaRect } from "./layout.js";
import { isPointInElement } from "./matrix.js";
/**
 * Traverses the node tree reverse depth-first to find the deepest
 * container under the cursor, computes the insertion point within
 * its CSS flow layout, and returns visual indicator line coordinates.
 *
 * @param draggedId  - The ID of the node currently being dragged.
 * @param canvasPos  - The current canvas-space cursor position.
 * @param tree       - The NodeTree model instance.
 * @param getWrapper - Callback to fetch a mounted wrapper DOM element.
 * @returns The resolved `DropTarget` details, or `null` if empty space.
 */
export function findDropTarget(draggedId, canvasPos, tree, getWrapper) {
    const reversedNodes = tree.flattenReverse();
    let targetContainer = null;
    // 1. Find the deepest container under the cursor.
    //    Exclude the dragged node and all its descendants to prevent cycles.
    for (const node of reversedNodes) {
        if (node.id === draggedId || tree.isAncestor(draggedId, node.id)) {
            continue;
        }
        if (!tree.isContainer(node.id)) {
            continue;
        }
        if (node.currentRect && isPointInElement(canvasPos.x, canvasPos.y, node.currentRect)) {
            targetContainer = node;
            break;
        }
    }
    if (!targetContainer)
        return null;
    const parentId = targetContainer.id;
    const parentWrapper = getWrapper(parentId);
    if (!parentWrapper)
        return null;
    const contentRoot = parentWrapper.firstElementChild;
    const layoutElement = contentRoot ?? parentWrapper;
    // Detect parent layout properties.
    const layoutInfo = detectLayout(layoutElement);
    const flowAxis = getFlowAxis(layoutInfo); // "x" (horizontal) or "y" (vertical)
    const parentRect = targetContainer.currentRect;
    // Read styling for padding/border.
    const cs = getComputedStyle(layoutElement);
    const padLeft = parseFloat(cs.paddingLeft) || 0;
    const padRight = parseFloat(cs.paddingRight) || 0;
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    // Grid container handling
    if (layoutInfo.mode === "grid" || layoutInfo.mode === "inline-grid") {
        const colTracks = parseGridTracks(layoutInfo.gridTemplateColumns || "", layoutInfo.gap.column);
        const rowTracks = parseGridTracks(layoutInfo.gridTemplateRows || "", layoutInfo.gap.row);
        const cx = canvasPos.x - parentRect.x - padLeft;
        const cy = canvasPos.y - parentRect.y - padTop;
        const { col, row } = getGridCellAt(cx, cy, colTracks, rowTracks, layoutInfo.gap.column, layoutInfo.gap.row);
        let colSpan = 1;
        let rowSpan = 1;
        const draggedWrapper = getWrapper(draggedId);
        if (draggedWrapper) {
            const draggedRoot = draggedWrapper.firstElementChild;
            if (draggedRoot) {
                colSpan = getGridSpan(draggedRoot, "column");
                rowSpan = getGridSpan(draggedRoot, "row");
            }
        }
        const cellRect = getGridAreaRect(parentRect, padLeft, padTop, col, row, colSpan, rowSpan, colTracks, rowTracks);
        return {
            parentId,
            insertionIndex: 0,
            indicator: {
                x1: cellRect.x,
                y1: cellRect.y,
                x2: cellRect.x + cellRect.width,
                y2: cellRect.y + cellRect.height,
                side: "before",
            },
            gridPlacement: {
                colStart: col,
                rowStart: row,
                colSpan,
                rowSpan,
                rect: cellRect,
            },
        };
    }
    const gap = flowAxis === "y" ? layoutInfo.gap.row : layoutInfo.gap.column;
    // Filter out the dragged node from children to get the target layout state.
    const children = tree.getChildren(parentId).filter(c => c.id !== draggedId);
    if (children.length === 0) {
        // Empty container: draw insertion line at the padding boundary.
        const indicator = flowAxis === "y"
            ? {
                x1: parentRect.x + padLeft,
                y1: parentRect.y + padTop,
                x2: parentRect.x + parentRect.width - padRight,
                y2: parentRect.y + padTop,
                side: "before",
            }
            : {
                x1: parentRect.x + padLeft,
                y1: parentRect.y + padTop,
                x2: parentRect.x + padLeft,
                y2: parentRect.y + parentRect.height - padBottom,
                side: "before",
            };
        return {
            parentId,
            insertionIndex: 0,
            indicator,
        };
    }
    if (flowAxis === "y") {
        // Vertical flow (column, block).
        // Map children to their vertical center points.
        const centers = children.map(c => {
            const r = c.currentRect;
            return { id: c.id, rect: r, centerY: r.y + r.height / 2 };
        });
        for (let i = 0; i < centers.length; i++) {
            const center = centers[i];
            if (!center)
                continue;
            if (canvasPos.y < center.centerY) {
                const refRect = center.rect;
                const y = refRect.y - gap / 2;
                return {
                    parentId,
                    insertionIndex: i,
                    indicator: {
                        x1: parentRect.x + padLeft,
                        y1: y,
                        x2: parentRect.x + parentRect.width - padRight,
                        y2: y,
                        side: "before",
                    },
                };
            }
        }
        // Drop after the last child.
        const lastChild = children[children.length - 1];
        const lastRect = lastChild && lastChild.currentRect ? lastChild.currentRect : parentRect;
        const y = lastRect.y + lastRect.height + gap / 2;
        return {
            parentId,
            insertionIndex: children.length,
            indicator: {
                x1: parentRect.x + padLeft,
                y1: y,
                x2: parentRect.x + parentRect.width - padRight,
                y2: y,
                side: "after",
            },
        };
    }
    else {
        // Horizontal flow (row, inline).
        // Map children to their horizontal center points.
        const centers = children.map(c => {
            const r = c.currentRect;
            return { id: c.id, rect: r, centerX: r.x + r.width / 2 };
        });
        for (let i = 0; i < centers.length; i++) {
            const center = centers[i];
            if (!center)
                continue;
            if (canvasPos.x < center.centerX) {
                const refRect = center.rect;
                const x = refRect.x - gap / 2;
                return {
                    parentId,
                    insertionIndex: i,
                    indicator: {
                        x1: x,
                        y1: parentRect.y + padTop,
                        x2: x,
                        y2: parentRect.y + parentRect.height - padBottom,
                        side: "before",
                    },
                };
            }
        }
        // Drop after the last child.
        const lastChild = children[children.length - 1];
        const lastRect = lastChild && lastChild.currentRect ? lastChild.currentRect : parentRect;
        const x = lastRect.x + lastRect.width + gap / 2;
        return {
            parentId,
            insertionIndex: children.length,
            indicator: {
                x1: x,
                y1: parentRect.y + padTop,
                x2: x,
                y2: parentRect.y + parentRect.height - padBottom,
                side: "after",
            },
        };
    }
}
/** Helper to extract grid span (e.g. 'span 2') from content styles. */
function getGridSpan(element, dimension) {
    const cs = getComputedStyle(element);
    const startVal = cs.getPropertyValue(`grid-${dimension}-start`);
    const endVal = cs.getPropertyValue(`grid-${dimension}-end`);
    const val = cs.getPropertyValue(`grid-${dimension}`);
    // Check for "span N" in any of these styles
    const spanMatch = (startVal + " " + endVal + " " + val).match(/span\s+(\d+)/i);
    if (spanMatch && spanMatch[1]) {
        return parseInt(spanMatch[1], 10);
    }
    // Check if start and end are numeric indices
    const startNum = parseInt(startVal, 10);
    const endNum = parseInt(endVal, 10);
    if (!isNaN(startNum) && !isNaN(endNum) && endNum > startNum) {
        return endNum - startNum;
    }
    return 1;
}
//# sourceMappingURL=drop-zone.js.map