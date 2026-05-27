# CSS Layout & Selection System

Canvus manages node hierarchies and layouts by combining an in-memory tree model with CSS display introspection and canvas drop target estimation.

---

## 1. Hierarchical Tree Model (`NodeTree`)

The workspace doesn't query the DOM repeatedly to determine parent-child relationships. Instead, [`NodeTree`](file:///Users/balfaro01/Documents/GitHub/canvus/src/tree.ts) keeps an in-memory representation of the document structure.

*   **Node Hierarchy**: Nodes contain `parentId` and `childIds` references. Root-level elements have `parentId = null`.
*   **Topological Depth**: The tree calculates a `depth` index (0 for root, 1 for direct children, etc.) for each node. This determines visual rendering order and breadcrumb paths.
*   **Reparenting Safety**: When moving nodes, the tree runs cycle-detection algorithms. It walks ancestor branches of the target parent to ensure a node is never reparented to one of its own descendants.

To keep invariants synchronized, developers must always mutate structures using the Workspace APIs:
```typescript
ws.addNode(node, parentId, index);  // Mounts inside Shadow DOM and registers in NodeTree
ws.removeNode(nodeId);              // Detaches wrappers and cleans tree indices
ws.reparentNode(nodeId, parentId);  // Swaps DOM parents and updates tree slots
ws.reorderChild(nodeId, index);     // Moves DOM sibling indexes and updates child arrays
```

---

## 2. Layout Introspection & Spacing Adjusters

The layout introspection engine ([`src/layout.ts`](file:///Users/balfaro01/Documents/GitHub/canvus/src/layout.ts)) reads computed CSS variables from elements to determine visual overlay behavior.

### Display Detection
When a container is measured, the engine calls `getComputedStyle(element)` to detect:
*   `display` display mode: `flex`, `grid`, `block`, or `inline`.
*   Flex axes: Reads `flex-direction` (row vs. column) and `flex-wrap` values.
*   Grid configurations: Evaluates columns/rows and parses `gap` definitions.

### Spacing Adjusters (Margins & Paddings)
When a single node is selected, Canvus renders hoverable margin/padding drag boxes on the canvas overlay.
1.  **Reading Bounds**: Reads computed margins (`margin-top`, `margin-left`, etc.) and paddings.
2.  **Visual overlays**: Paints drag bars representing padding (inside content boundaries) or margins (outside content boundaries) with values displayed in tooltips.
3.  **Style Surgery**: Dragging an adjuster translates pointer coordinates into inline style changes. The browser reflows elements, the `ResizeObserver` detects changed rectangles, and the canvas overlay updates.

---

## 3. Drop Zone & Drag-and-Drop Insertion

When a node is dragged, Canvus calculates potential placement zones in real-time to facilitate flow reordering and reparenting.

### Drop Target Estimation ([`src/drop-zone.ts`](file:///Users/balfaro01/Documents/GitHub/canvus/src/drop-zone.ts)):
1.  **Container Hit Testing**: Identifies which container node bounds cover the current pointer position.
2.  **Layout-Aware Slot Calculations**:
    *   **Flex Containers**: Projects the pointer onto the active flex axis (row or column). Slices boundaries between existing children to identify index slots.
    *   **Grid Containers**: Projects coordinates onto grid tracks (columns/rows) to resolve slot cells.
    *   **Block Flow**: Measures vertical centerlines of siblings to find preceding or succeeding insertion slots.
3.  **Insertion Indicators**: Draws horizontal or vertical coordinates lines on the canvas overlay to show the user exactly where the node will land if dropped.

---

## 4. Figma-Style Selection Semantics

To allow users to select items inside deeply nested hierarchies without getting trapped in leaf elements, Canvus uses drill-down selection rules:

*   **Single-Click**: Selects the topmost selectable element in the active scope. If no node is selected, clicking selects a root-level node. Clicking outside clears selection.
*   **Double-Click**: Enters ("drills down" into) the double-clicked node's subtree scope. Subsequent single-clicks will only target immediate children of that parent container.
*   **Cmd / Ctrl + Click**: Deep selection escape hatch. Bypasses the drill-down depth state and directly selects the exact leaf node under the cursor.
*   **Shift + Click**: Multi-selection. Adds or removes nodes from the active selection set.
