// ─────────────────────────────────────────────────────────────
// canvus/src/layout.ts
// Layout Introspection Engine — Detects CSS layout modes and
// extracts structural metadata from live Shadow DOM elements.
//
// All functions read from `getComputedStyle()` and do not
// mutate the DOM. Results are used by the overlay renderer to
// draw layout-aware visual badges, direction arrows, and grid
// track lines.
// ─────────────────────────────────────────────────────────────
// ── Detection Functions ─────────────────────────────────────
/**
 * Detects the CSS layout mode and properties of an element.
 *
 * Reads `getComputedStyle()` to extract the resolved display
 * mode, flex direction, gap, alignment, and grid template values.
 *
 * @param element - The DOM element to inspect.
 * @returns Complete `LayoutInfo` descriptor.
 */
export function detectLayout(element) {
    const cs = getComputedStyle(element);
    const display = cs.display;
    // Resolve display to our LayoutMode enum.
    const mode = resolveLayoutMode(display);
    // Flex properties.
    const isFlex = mode === "flex" || mode === "inline-flex";
    const direction = isFlex
        ? cs.flexDirection
        : null;
    const wrap = isFlex
        ? cs.flexWrap
        : null;
    // Gap (works for flex and grid).
    const rowGap = parseFloat(cs.rowGap) || 0;
    const columnGap = parseFloat(cs.columnGap) || 0;
    // Alignment.
    const alignItems = cs.alignItems;
    const justifyContent = cs.justifyContent;
    // Grid properties.
    const isGrid = mode === "grid" || mode === "inline-grid";
    const gridTemplateColumns = isGrid ? cs.gridTemplateColumns : null;
    const gridTemplateRows = isGrid ? cs.gridTemplateRows : null;
    const gridAutoFlow = isGrid ? cs.gridAutoFlow : null;
    return {
        mode,
        direction,
        wrap,
        gap: { row: rowGap, column: columnGap },
        alignItems,
        justifyContent,
        gridTemplateColumns,
        gridTemplateRows,
        gridAutoFlow,
    };
}
/**
 * Returns the primary flow axis for a layout container.
 *
 * - Flex row → "x" (horizontal)
 * - Flex column → "y" (vertical)
 * - Grid row (default auto-flow) → "x"
 * - Block → "y" (vertical stacking)
 *
 * @param info - The layout info to inspect.
 * @returns "x" for horizontal flow, "y" for vertical flow.
 */
export function getFlowAxis(info) {
    if (info.mode === "flex" || info.mode === "inline-flex") {
        return info.direction === "column" || info.direction === "column-reverse"
            ? "y"
            : "x";
    }
    if (info.mode === "grid" || info.mode === "inline-grid") {
        return info.gridAutoFlow?.includes("column") ? "x" : "y";
    }
    // Block, inline: vertical stacking.
    return "y";
}
/**
 * Returns the flow direction sign for a layout container.
 *
 * `1` for normal direction, `-1` for reverse.
 * Useful for computing insertion positions.
 */
export function getFlowSign(info) {
    if (info.direction === "row-reverse" || info.direction === "column-reverse") {
        return -1;
    }
    return 1;
}
/**
 * Detects the position and size of each child element's slot
 * within a container, measured relative to the container's
 * padding box.
 *
 * This uses `getBoundingClientRect()` for accuracy, then
 * converts to container-relative coordinates.
 *
 * @param container - The parent DOM element.
 * @returns Array of `ChildSlot` objects, one per child element.
 */
export function detectChildSlots(container) {
    const slots = [];
    const containerRect = container.getBoundingClientRect();
    const cs = getComputedStyle(container);
    const padLeft = parseFloat(cs.paddingLeft) || 0;
    const padTop = parseFloat(cs.paddingTop) || 0;
    const children = container.children;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const childRect = child.getBoundingClientRect();
        slots.push({
            index: i,
            rect: {
                x: childRect.left - containerRect.left - padLeft,
                y: childRect.top - containerRect.top - padTop,
                width: childRect.width,
                height: childRect.height,
            },
        });
    }
    return slots;
}
/**
 * Parses grid track values from a resolved `grid-template-columns`
 * or `grid-template-rows` string into an array of `GridTrack` objects.
 *
 * The browser resolves templates like `1fr 2fr 100px` into
 * computed pixel values like `200px 400px 100px`. This function
 * parses those resolved values.
 *
 * @param templateValue - The resolved CSS grid template string
 *                         (e.g. "200px 400px 100px").
 * @returns Array of grid tracks with start offsets and sizes.
 */
export function parseGridTracks(templateValue) {
    const tracks = [];
    // The resolved value is space-separated pixel values like "200px 400px 100px".
    // Filter out named grid lines (e.g. "[start]") which appear in brackets.
    const parts = templateValue
        .replace(/\[.*?\]/g, "") // Remove grid line names.
        .trim()
        .split(/\s+/)
        .filter(p => p.length > 0);
    let offset = 0;
    for (const part of parts) {
        const size = parseFloat(part) || 0;
        tracks.push({ start: offset, size });
        offset += size;
    }
    return tracks;
}
/**
 * Returns a short, human-readable label for a layout mode.
 * Used for layout badge overlays.
 *
 * @param info - The layout info to label.
 * @returns A concise string like "FLEX →", "FLEX ↓", "GRID", "BLOCK".
 */
export function getLayoutLabel(info) {
    switch (info.mode) {
        case "flex":
        case "inline-flex": {
            const arrow = info.direction === "column"
                ? "↓"
                : info.direction === "column-reverse"
                    ? "↑"
                    : info.direction === "row-reverse"
                        ? "←"
                        : "→";
            return `FLEX ${arrow}`;
        }
        case "grid":
        case "inline-grid":
            return "GRID";
        case "inline":
            return "INLINE";
        case "block":
            return "BLOCK";
        default:
            return "NONE";
    }
}
// ── Private Helpers ─────────────────────────────────────────
/**
 * Maps a CSS `display` value to our `LayoutMode` enum.
 * Handles compound values like "inline-flex", "inline-grid".
 */
function resolveLayoutMode(display) {
    // Normalize: CSS can return compound values like "inline flex".
    const d = display.toLowerCase().trim();
    if (d === "flex")
        return "flex";
    if (d === "inline-flex" || d === "inline flex")
        return "inline-flex";
    if (d === "grid")
        return "grid";
    if (d === "inline-grid" || d === "inline grid")
        return "inline-grid";
    if (d === "inline" || d === "inline-block")
        return "inline";
    if (d === "none")
        return "none";
    // Everything else (block, table, list-item, etc.) → block.
    return "block";
}
//# sourceMappingURL=layout.js.map