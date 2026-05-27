# API Reference Guide

This document lists all public configuration objects, callbacks, methods, and data models exported by the Canvus SDK.

---

## 1. Workspace Configuration

### `WorkspaceConfig`
Options passed to the `Workspace` constructor to customize interaction tolerances and colors.

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `overlayStyle` | `Partial<OverlayStyle>` | See below | Overrides default canvas layout overlay colors, border widths, and fonts. |
| `snapThreshold` | `number` | `5` | Alignment guidelines snapping distance in canvas-space pixels. |
| `minResizeSize` | `number` | `40` | The minimum width or height allowed when resizing a node wrapper. |
| `enableSnapGuides` | `boolean` | `true` | Enables drawing snapping alignment lines during drag gestures. |

### `WorkspaceCallbacks`
Hook callbacks triggered on workspace events.

| Callback | Signature | Description |
| :--- | :--- | :--- |
| `onHTMLCommit` | `(id: string, html: string) => void` | **Flat String Bridge**. Emits clean HTML string fragments (with wrappers stripped) after visual adjustments. |
| `onNodeRectChange`| `(id: string, rect: Rect) => void` | Fired when a node's bounding rect changes due to reflow or drag. |
| `onViewportChange`| `(vp: Readonly<ViewportMatrix>) => void`| Fired when the workspace zoom level or pan offset shifts. |
| `onSelectionChange`| `(selectedIds: ReadonlySet<string>) => void`| Fired when the active selection is updated. |
| `onBreadcrumbChange`| `(path: string[]) => void` | Fired when selection depth breadcrumbs are updated. |
| `onInteractionChange`| `(mode: string \| null) => void` | Fired when the active drag state switches. |
| `onOperationsGenerated`| `(operations: Operation[]) => void` | Fired when a visual modification generates undoable history steps. |
| `onTextEditRequest`| `(nodeId: string, element: HTMLElement, commit: (newHTML: string) => void) => void` | Double-click escape hatch callback to mount custom rich text editor overlays. |

---

## 2. Main Workspace Classes

### `Workspace`
The core engine orchestrating events, DOM mounting, and overlay drawing.
- **`addNode(node: Readonly<WebHTMLNode>, parentId?: string | null, index?: number): Rect`**  
  Mounts a node into the Shadow DOM, updates the tree hierarchy model, measures bounds, and triggers a layout repaint. Returns measured canvas-space bounds.
- **`removeNode(id: string): boolean`**  
  Removes a node and all of its descendants from the DOM mount and the internal tree tracker.
- **`updateMarkup(id: string, markup: string): Rect | null`**  
  Updates a node's inner HTML, recalculates layout, and triggers a repaint.
- **`setNodeStyle(id: string, property: string, value: string | null): void`**  
  Mutates a CSS property on the node content element inside the Shadow DOM, triggers layout measurements, and commits changes.
- **`setNodeStyles(id: string, styles: Record<string, string | null>): void`**  
  Batches style changes to limit reflow costs.
- **`addClass(id: string, className: string): void`**  
  Appends a CSS class name, triggers reflow checks, and generates an `update-classes` operation.
- **`removeClass(id: string, className: string): void`**  
  Removes a class name, triggers reflow, and emits an `update-classes` operation.
- **`toggleClass(id: string, className: string): void`**  
  Toggles a CSS class name.
- **`reparentNode(nodeId: string, newParentId: string | null, index?: number): void`**  
  Moves a node wrapper to a new parent in both the Shadow DOM tree and the tree model.
- **`reorderChild(nodeId: string, newIndex: number): void`**  
  Reorders a node inside its parent, updating sibling arrangements.
- **`getNodeTree(): NodeTree`**  
  Returns the active structural tree database container.
- **`applyOperation(op: Operation): void`**  
  Replays a serialized action payload (e.g. style shifts, class edits, text modifications, reparents) back onto the workspace. Used to trigger Undo/Redo state actions.
- **`selectNode(id: string): void`**  
  Sets selection to a single node.
- **`deselectAll(): void`**  
  Clears active selection sets.
- **`getSelectedIds(): ReadonlySet<string>`**  
  Returns active node selections.
- **`getViewport(): Readonly<ViewportMatrix>`**  
  Gets the current zoom scale and translation panning offsets.
- **`setViewport(vp: ViewportMatrix): void`**  
  Forces a viewport update.
- **`resetViewport(): void`**  
  Resets the workspace scale to 1:1 and offsets to 0,0.
- **`getNodes(): ReadonlyArray<Readonly<ResolvedNode>>`**  
  Returns a flat array of all registered nodes in topological order.
- **`getShadowMount(): ShadowMount`**  
  Exposes the inner open Shadow Root mounting subsystem.
- **`getOverlayRenderer(): OverlayRenderer`**  
  Exposes the inner 2D canvas overlay painter.
- **`getWrapper(id: string): HTMLElement | null`**  
  Returns the wrapper element of the specified node.
- **`extractHTML(id: string): string | null`**  
  **Flat String Bridge**. Exports clean, unpolluted HTML strings of target subtrees (stripping wrapper elements).
- **`measureAll(): Map<string, Rect>`**  
  Forces a synchronous layout read of all elements.
- **`dispose(): void`**  
  Cleans up window resize, wheel, and mouse gesture event listeners.

### `ShadowMount`
Controls the isolated browser `ShadowRoot` and executes layout reflow measurement logic.
- Constructor takes the host container element and a `RectChangeCallback` handler.

### `OverlayRenderer`
Directly paints vectors onto the 2D canvas overlay.
- Uses `OverlayStyle` for colors and fonts.

### `NodeTree`
Maintains the logical parent-child relationships and checks structure validity.
- Handles reparenting, reordering, and flat list sorting.

---

## 3. Primitives and Constants

### Spacing Boundaries
*   `ZOOM_MIN` = `0.1`: Minimum zoom multiplier limit.
*   `ZOOM_MAX` = `4.0`: Maximum zoom multiplier limit.

### Core Interface Definitions
```typescript
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ViewportMatrix {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface WebHTMLNode {
  id: string;
  rawMarkup: string;
  currentRect: Rect | null;
  parentId?: string | null;
  childIds?: readonly string[];
  layoutMode?: LayoutMode | null;
  depth?: number;
}

export interface ResolvedNode {
  readonly id: string;
  rawMarkup: string;
  currentRect: Rect | null;
  parentId: string | null;
  childIds: string[];
  layoutMode: LayoutMode | null;
  depth: number;
}

export interface DragHandleState {
  activeMode: InteractionMode;
  targetNodeId: string | null;
  selectedAnchor: ResizeAnchor | null;
  initialPointerPos: Vec2;
}

export interface Operation {
  type: OperationType;
  nodeId: string;
  payload: any;
  undoPayload: any;
}
```

### Enumeration Types
*   `LayoutMode` = `"block" | "flex" | "grid" | "inline" | "inline-flex" | "inline-grid" | "none"`
*   `ResizeAnchor` = `"nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"`
*   `InteractionMode` = `"pan" | "drag-node" | "resize-node" | "reparent" | "reorder" | "select-marquee" | "adjust-spacing" | null`

---

## 4. Helper Functions and Subsystems

### Viewport Math (`src/matrix.ts`)
*   **`screenToCanvas(pt: Vec2, vp: ViewportMatrix): Vec2`**: Converts viewport screen offset pixels to canvas coordinates.
*   **`canvasToScreen(pt: Vec2, vp: ViewportMatrix): Vec2`**: Converts canvas coordinates to screen offset pixels.
*   **`calculateZoomAnchor(pivot: Vec2, oldScale: number, newScale: number, vp: ViewportMatrix): ViewportMatrix`**: Computes translation parameters to scale around a cursor point.
*   **`applyWheelZoom(e: WheelEvent, vp: ViewportMatrix, bounds: DOMRect): ViewportMatrix`**: Applies zoom modifications.
*   **`applyPan(e: PointerEvent, vp: ViewportMatrix, prev: Vec2): ViewportMatrix`**: Accumulates pan offsets.
*   **`isPointInElement(pt: Vec2, rect: Rect): boolean`**: Collision test function.
*   **`hitTestElements(pt: Vec2, nodes: ReadonlyArray<ResolvedNode>): string | null`**: Returns the topmost element covering the pointer.
*   **`getAnchorPositions(rect: Rect): Record<ResizeAnchor, Vec2>`**: Gets anchor coordinate boxes.
*   **`clampScale(scale: number): number`**: Restricts zoom factor to bounds.
*   **`lerp(start: number, end: number, amt: number): number`**: Standard linear interpolation helper.
*   **`lerpViewport(start: ViewportMatrix, end: ViewportMatrix, amt: number): ViewportMatrix`**: Smooth pans/zooms transition interpolator.

### Tree Management
*   **`resolveNode(node: Readonly<WebHTMLNode>): ResolvedNode`**: Normalizes tree fields.
*   **`createIdleDragState(): DragHandleState`**: Returns clean, non-active drag settings.
*   **`createDefaultViewport(): ViewportMatrix`**: Returns default scales.
*   **`computeAggregateBounds(nodes: ReadonlyArray<ResolvedNode>): Rect`**: Aggregates selections size box.

### Layout Introspection (`src/layout.ts`)
*   **`detectLayout(el: HTMLElement): LayoutInfo`**: Inspects container details.
*   **`getFlowAxis(mode: LayoutMode, dir: string | null): "x" | "y"`**: Layout orientation check.
*   **`getFlowSign(dir: string | null): 1 | -1`**: Layout order alignment flow orientation indicator.
*   **`getLayoutLabel(mode: LayoutMode, direction?: string | null): string`**: Formats labels.
*   **`detectChildSlots(container: HTMLElement): ChildSlot[]`**: Measures target placement indices.
*   **`parseGridTracks(el: HTMLElement): { columns: GridTrack[], rows: GridTrack[] }`**: Evaluates columns.

### Overlay Renderer Elements
*   **`anchorCursor(anchor: ResizeAnchor): string`**: Returns CSS cursor indicators for dragging resize boxes.
*   **`computeAlignmentGuides(draggedId: string, currentRect: Rect, nodes: ReadonlyArray<ResolvedNode>, snapThreshold: number): { guides: Guide[], snapped: Vec2 }`**: Generates alignment guides.
*   **`computeSnappedPosition(currentRect: Rect, guides: Guide[]): Vec2`**: Snaps element positions.

### Drag and Drop Placement (`src/drop-zone.ts`)
*   **`findDropTarget(pt: Vec2, draggedId: string, nodes: ReadonlyArray<ResolvedNode>, ws: Workspace): DropTarget | null`**: Calculates target drop indices and placement guides.

### HTML/CSS Document Importer (`src/importer.ts`)
*   **`importHTMLDocument(workspace: Workspace, htmlString: string, options?: ImportHTMLOptions): void`**: Parses a complete HTML document or fragment, resolves relative URLs, wraps workspace nodes in-place, extracts and mounts styles, and populates them into the workspace shadow root.

---

## 5. Type and Callback Definitions

*   `RectChangeCallback` = `(id: string, rect: Rect) => void`
*   `FlexDirection` = `"row" | "row-reverse" | "column" | "column-reverse"`
*   `FlexWrap` = `"nowrap" | "wrap" | "wrap-reverse"`
*   `LayoutInfo` = `{ display: LayoutMode; flexDirection: string; gap: string; gridTemplateColumns: string; gridTemplateRows: string; }`
*   `ChildSlot` = `{ index: number; rect: Rect; }`
*   `GridTrack` = `{ start: number; end: number; size: number; }`
*   `OverlayStyle` = `{ selectionColor: string; hoverColor: string; guideColor: string; handleColor: string; handleSize: number; badgeBg: string; badgeColor: string; tooltipBg: string; tooltipColor: string; font: string; }`
*   `OverlayFrame` = `{ selection: Set<string>; hover: string \| null; guides: Guide[]; marginAdjusters: Record<string, Rect>; paddingAdjusters: Record<string, Rect>; }`
*   `LayoutBadgeInfo` = `{ label: string; rect: Rect; isJS?: boolean; }`
*   `GridOverlayInfo` = `{ columns: GridTrack[]; rows: GridTrack[]; rect: Rect; }`
*   `Guide` = `{ type: "h" \| "v"; coord: number; start: number; end: number; }`
*   `DropTarget` = `{ parentId: string \| null; index: number; indicator: InsertionIndicator; }`
*   `InsertionIndicator` = `{ type: "h" \| "v"; coord: number; start: number; end: number; }`
*   `ImportHTMLOptions` = `{ baseUrl?: string; nodeSelector?: string; clearWorkspace?: boolean; defaultPageWidth?: number; }`
