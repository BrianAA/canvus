# Documentation Coverage Manifest

> **Last Updated**: 2026-05-27
> **Source of Truth**: `src/index.ts`

This manifest tracks documentation coverage for every public export in the Canvus SDK. Compare this against `src/index.ts` after any code change.

**Legend**: ✅ Documented | ⚠️ Needs Review | ❌ Missing

---

## Types & Constants (`src/types.ts`)

| Export | Kind | Docs Page | Status |
|--------|------|-----------|--------|
| `Vec2` | type | `sdk/types.mdx` | ✅ |
| `Rect` | type | `sdk/types.mdx` | ✅ |
| `ViewportMatrix` | type | `sdk/types.mdx` | ✅ |
| `WebHTMLNode` | type | `sdk/types.mdx` | ✅ |
| `ResolvedNode` | type | `sdk/types.mdx` | ✅ |
| `LayoutMode` | type | `sdk/types.mdx` | ✅ |
| `ResizeAnchor` | type | `sdk/types.mdx` | ✅ |
| `InteractionMode` | type | `sdk/types.mdx` | ✅ |
| `DragHandleState` | type | `sdk/types.mdx` | ✅ |
| `ZOOM_MIN` | const | `sdk/types.mdx` | ✅ |
| `ZOOM_MAX` | const | `sdk/types.mdx` | ✅ |
| `createIdleDragState` | function | `sdk/types.mdx` | ✅ |
| `createDefaultViewport` | function | `sdk/types.mdx` | ✅ |
| `resolveNode` | function | `sdk/types.mdx` | ✅ |

---

## Viewport Math (`src/matrix.ts`)

| Export | Kind | Docs Page | Status |
|--------|------|-----------|--------|
| `screenToCanvas` | function | `sdk/matrix.mdx` | ✅ |
| `canvasToScreen` | function | `sdk/matrix.mdx` | ✅ |
| `calculateZoomAnchor` | function | `sdk/matrix.mdx` | ✅ |
| `applyWheelZoom` | function | `sdk/matrix.mdx` | ✅ |
| `applyPan` | function | `sdk/matrix.mdx` | ✅ |
| `isPointInElement` | function | `sdk/matrix.mdx` | ✅ |
| `hitTestElements` | function | `sdk/matrix.mdx` | ✅ |
| `getAnchorPositions` | function | `sdk/matrix.mdx` | ✅ |
| `clampScale` | function | `sdk/matrix.mdx` | ✅ |
| `lerp` | function | `sdk/matrix.mdx` | ✅ |
| `lerpViewport` | function | `sdk/matrix.mdx` | ✅ |

---

## Shadow DOM Mount (`src/shadow-mount.ts`)

| Export | Kind | Docs Page | Status |
|--------|------|-----------|--------|
| `RectChangeCallback` | type | `sdk/workspace-api.mdx` | ✅ |
| `ShadowMount` | class | `concepts/shadow-dom.mdx` | ✅ |

---

## Node Tree Model (`src/tree.ts`)

| Export | Kind | Docs Page | Status |
|--------|------|-----------|--------|
| `NodeTree` | class | `concepts/workspace.mdx` | ✅ |
| `computeAggregateBounds` | function | — | ❌ |

---

## Layout Introspection (`src/layout.ts`)

| Export | Kind | Docs Page | Status |
|--------|------|-----------|--------|
| `FlexDirection` | type | `sdk/layout.mdx` | ✅ |
| `FlexWrap` | type | `sdk/layout.mdx` | ✅ |
| `LayoutInfo` | type | `sdk/layout.mdx` | ✅ |
| `ChildSlot` | type | `sdk/layout.mdx` | ✅ |
| `GridTrack` | type | `sdk/layout.mdx` | ✅ |
| `detectLayout` | function | `sdk/layout.mdx` | ✅ |
| `getFlowAxis` | function | `sdk/layout.mdx` | ✅ |
| `getFlowSign` | function | `sdk/layout.mdx` | ✅ |
| `getLayoutLabel` | function | `sdk/layout.mdx` | ✅ |
| `detectChildSlots` | function | `sdk/layout.mdx` | ✅ |
| `parseGridTracks` | function | `sdk/layout.mdx` | ✅ |

---

## Canvas Overlay Renderer (`src/renderer.ts`)

| Export | Kind | Docs Page | Status |
|--------|------|-----------|--------|
| `OverlayStyle` | type | `sdk/renderer.mdx` | ✅ |
| `OverlayFrame` | type | `sdk/renderer.mdx` | ✅ |
| `LayoutBadgeInfo` | type | `sdk/renderer.mdx` | ✅ |
| `GridOverlayInfo` | type | `sdk/renderer.mdx` | ✅ |
| `Guide` | type | `sdk/renderer.mdx` | ✅ |
| `OverlayRenderer` | class | `sdk/renderer.mdx` | ✅ |
| `anchorCursor` | function | `sdk/renderer.mdx` | ✅ |
| `computeAlignmentGuides` | function | `sdk/renderer.mdx` | ✅ |
| `computeSnappedPosition` | function | `sdk/renderer.mdx` | ✅ |

---

## Workspace Controller (`src/workspace.ts`)

| Export | Kind | Docs Page | Status |
|--------|------|-----------|--------|
| `WorkspaceConfig` | type | `sdk/configuration.mdx` | ✅ |
| `WorkspaceCallbacks` | type | `sdk/configuration.mdx` | ✅ |
| `Workspace` | class | `sdk/workspace-api.mdx` | ✅ |

---

## HTML/CSS Document Importer (`src/importer.ts`)

| Export | Kind | Docs Page | Status |
|--------|------|-----------|--------|
| `ImportHTMLOptions` | type | `guides/importing.mdx` | ✅ |
| `importHTMLDocument` | function | `guides/importing.mdx` | ✅ |

---

## Drop Zone & DnD (`src/drop-zone.ts`)

| Export | Kind | Docs Page | Status |
|--------|------|-----------|--------|
| `DropTarget` | type | `sdk/drop-zone.mdx` | ✅ |
| `InsertionIndicator` | type | `sdk/drop-zone.mdx` | ✅ |
| `findDropTarget` | function | `sdk/drop-zone.mdx` | ✅ |

---

## Coverage Summary

| Module | Total Exports | ✅ Documented | ⚠️ Needs Review | ❌ Missing |
|--------|--------------|---------------|-----------------|-----------|
| `types.ts` | 14 | 14 | 0 | 0 |
| `matrix.ts` | 11 | 11 | 0 | 0 |
| `shadow-mount.ts` | 2 | 2 | 0 | 0 |
| `tree.ts` | 2 | 1 | 0 | **1** |
| `layout.ts` | 11 | 11 | 0 | 0 |
| `renderer.ts` | 9 | 9 | 0 | 0 |
| `workspace.ts` | 3 | 3 | 0 | 0 |
| `importer.ts` | 2 | 2 | 0 | 0 |
| `drop-zone.ts` | 3 | 3 | 0 | 0 |
| **TOTAL** | **57** | **56** | **0** | **1** |

### Missing Coverage

1. **`computeAggregateBounds`** (from `tree.ts`) — Utility function for computing the bounding box of multiple nodes. Needs to be added to `sdk/types.mdx` or a new `sdk/tree.mdx` page.

---

## Docs Site Page Inventory

| Page Path | Section | Content Status |
|-----------|---------|---------------|
| `pages/index.mdx` | Landing | ✅ Complete |
| `pages/getting-started/index.mdx` | Getting Started | ✅ Complete |
| `pages/getting-started/installation.mdx` | Getting Started | ✅ Complete |
| `pages/getting-started/quickstart.mdx` | Getting Started | ✅ Complete |
| `pages/overview/index.mdx` | Overview | ✅ Complete |
| `pages/overview/architecture.mdx` | Overview | ✅ Complete |
| `pages/overview/goals.mdx` | Overview | ✅ Complete |
| `pages/concepts/workspace.mdx` | Core Concepts | ✅ Complete |
| `pages/concepts/shadow-dom.mdx` | Core Concepts | ✅ Complete |
| `pages/concepts/canvas-overlay.mdx` | Core Concepts | ✅ Complete |
| `pages/concepts/reflow-loop.mdx` | Core Concepts | ✅ Complete |
| `pages/concepts/flat-string-bridge.mdx` | Core Concepts | ✅ Complete |
| `pages/sdk/workspace-api.mdx` | SDK Reference | ✅ Complete |
| `pages/sdk/configuration.mdx` | SDK Reference | ✅ Complete |
| `pages/sdk/types.mdx` | SDK Reference | ✅ Complete |
| `pages/sdk/matrix.mdx` | SDK Reference | ✅ Complete |
| `pages/sdk/layout.mdx` | SDK Reference | ✅ Complete |
| `pages/sdk/renderer.mdx` | SDK Reference | ✅ Complete |
| `pages/sdk/drop-zone.mdx` | SDK Reference | ✅ Complete |
| `pages/guides/operations.mdx` | Guides | ✅ Complete |
| `pages/guides/custom-editor.mdx` | Guides | ✅ Complete |
| `pages/guides/layout-system.mdx` | Guides | ✅ Complete |
| `pages/guides/importing.mdx` | Guides | ✅ Complete |
| `pages/guides/class-manipulation.mdx` | Guides | ✅ Complete |
| `pages/architecture/modules.mdx` | Architecture | ✅ Complete |
| `pages/architecture/guidelines.mdx` | Architecture | ✅ Complete |
| `pages/architecture/adr/0001-state-sync.mdx` | ADR | ✅ Complete |
| `pages/architecture/adr/0002-text-editing.mdx` | ADR | ✅ Complete |
| `pages/architecture/adr/0003-class-manipulation.mdx` | ADR | ✅ Complete |
| `pages/architecture/adr/0004-mutation-sync.mdx` | ADR | ✅ Complete |
| `pages/architecture/adr/0005-stylesheets.mdx` | ADR | ✅ Complete |
| `pages/contributing/development.mdx` | Contributing | ✅ Complete |
| `pages/contributing/glossary.mdx` | Contributing | ✅ Complete |
