// ─────────────────────────────────────────────────────────────
// canvus/src/drop-zone.ts
// Flow-Aware Drop Target Detection & Insertion Index Engine.
//
// Calculates candidate parent containers and insertion points
// during drag operations based on container CSS flow layouts.
// ─────────────────────────────────────────────────────────────
import { detectLayout, getFlowAxis } from "./layout.js";
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
//# sourceMappingURL=drop-zone.js.map