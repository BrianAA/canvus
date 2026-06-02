# Changelog

All notable changes to the Canvus SDK are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- Drawing Tools: Added new Box and Text drawing tools (`setActiveTool`, `getActiveTool`, `setDrawingTag`, `getDrawingTag`) with real-time dotted boundary preview, dimensions overlay tooltip, and direct tag customization.
- Corner Radius Handles: Introduced corner radius adjustment handles on container elements with hit testing, hovering, and resizing capabilities.
- Clipboard Operations: Added copy, cut, paste, and duplicate APIs (`copySelectedNode()`, `cutSelectedNode()`, `pasteNode()`, `duplicateSelectedNode()`, `deleteSelectedNode()`) with keyboard shortcut bindings.
- New Operation Types: Added `"create-node"` and `"delete-node"` operations for transactional undo/redo tracking of tree insertions and removals.
- Lazy Child Registration: Children of nodes are registered lazily on parent selection, significantly improving workspace startup performance and preventing layout distortion.
- Sibling Selection/Hover Support: Enhanced selection resolution to allow selecting and hovering siblings and children at all depths of the active registry hierarchy.
- Dynamic Forced Hover States: Automatically injects/removes `.canvus-state-hover` class on canvas elements under the cursor so CSS `:hover` styles render correctly despite pointer-event blocking overlays.
- Explicit JavaScript flagging: Added `markNodeHasJS()`, `unmarkNodeHasJS()`, and `hasJSMark()` APIs on `Workspace` to flag content nodes with JS behavior.
- Visual script badges: Renders a specialized amber `⚡️ JS` badge next to the selection boundary for selected nodes containing guest script behavior (read from host JS marks).
- Side-by-side badge layout rendering: Draws multiple layout/script badges side-by-side with automatic horizontal offset accumulation.
- CSS Grid track parsing and visualization (`parseGridTracks`, grid overlay rendering)
- Grid controls in the demo workbench for defining `grid-template-columns` and other grid properties
- Spacing adjusters with live numeric tooltips for real-time margin/padding editing
- Coordinate/dimension indicators during drag and resize gestures
- Marquee selection for multi-node selection via drag rectangle

### Changed
- Spacing Adjusters Separation: Decoupled spacing adjusters into separate `rect` bounds (for pointer hit-testing handle-bars) and `visualRect` bounds (for drawing exact padding/margin overlays).
- Refined `NodeTree.isContainer` and `isContainerNode` to inspect tag names in `rawMarkup` to dynamically classify container elements.
- Refined workspace renderer to remove static child outlines around selected elements to avoid visual clutter.
- Increased hover stroke contrast (indigo color and `1.5`px width) to ensure maximum visibility on both light and dark canvas backgrounds.
- Transitioned script execution and stylesheet extraction to a host-driven architecture, removing automatic execution/parsing from the SDK core.
- Streamlined CSS Isolation: Replaced the 300-line CSS parser/rewriter in `injectCSS()` with a lightweight regex performing minimal `:root`/`html`/`body` → `:host` rewriting.
- Upgraded `isEditableTarget` to a robust, duck-typed check to prevent cross-document prototype check failures for shadow DOM target nodes.
- Upgraded overlay renderer to support grid track visualization alongside flex layout badges

### Fixed
- Zoomed Spacing Highlights: Fixed margin/padding highlight box over-calculation in zoomed/scaled layouts by introducing `ShadowMount.getElementScale()` to calculate accumulated internal element scale factors.
- Restricted text editing on double-click to only trigger on actual text elements, avoiding accidental edit modes on outer layout wrappers.
- Fixed JS flagging in lazy registration by scanning elements containing script tags prior to stripping them in the Electron importer.
- Playwright E2E integration tests adapted to drill-down selection and direct node class assertions.
- Overlap hit-test interception on small elements: Double-clicking leaf/nested nodes bypasses resize handle / spacing adjuster hit-tests on the second click, allowing text editing mode to successfully activate.
- Spacebar input on `<button>` elements: Intercepts the Spacebar key inside the inline editor, preventing default button click activation (which would toggle Preview Mode) and programmatically inserting spaces at the caret.
- Interval-driven reset during text editing: Prevented background intervals (like `updateToggleBtn` in `test-page.html`) from resetting the text and cursor of an active button while the user is actively editing it.

### Documented
- Updated `docs-site/pages/getting-started/installation.mdx` — added `npm install @canvus/core` as primary installation method, moved clone-and-build to a secondary "Contributing" section
- Updated `docs-site/pages/getting-started/quickstart.mdx` — imports now use `@canvus/core` package instead of `./dist/index.js`
- Updated `docs-site/pages/contributing/development.mdx` — added callout clarifying contributor vs. end-user setup paths
- Updated `docs-site/pages/sdk/types.mdx` to cover `CanvusTool`, new interaction modes (`draw-node`, `resize-radius`), and new operations (`create-node`, `delete-node`).
- Updated `docs-site/pages/sdk/workspace-api.mdx` to cover new clipboard operations and drawing tools methods.
- Updated `docs-site/pages/sdk/renderer.mdx` to document `isContainerNode` helper, `visualRect` on `SpacingAdjusterInfo`, and drawing/radius properties on `OverlayFrame`.
- Updated `docs-site/pages/guides/operations.mdx` to include schemas and examples for `create-node` and `delete-node` operations.
- Updated `docs-site/pages/sdk/renderer.mdx` with `LayoutBadgeInfo` changes.
- Updated `docs-site/pages/concepts/canvas-overlay.mdx` with Script badges & side-by-side badges details.
- Created full documentation site at `docs-site/` powered by Nextra 3 + Next.js 14
- **33 MDX pages** covering: Getting Started (3), Overview (3), Core Concepts (5), SDK Reference (7), Guides (5), Architecture + ADRs (7), Contributing (2), Landing (1)
- Migrated content from `docs/`, `agent.md`, `context.md`, and `PRD.md` into structured docs site
- Created documentation coverage manifest tracking all 57 public exports
- Created `docs-updater` skill for documentation maintenance workflows
- Added 8 missing Workspace methods to `workspace-api.mdx`: `setPreviewMode`, `isPreviewMode`, `forceNodeState`, `markNodeHasJS`, `unmarkNodeHasJS`, `hasJSMark`, `dispatchInteractionEvent`, `getContentRoot`
- Added `injectCSS`, `injectCSSLink` sections to `workspace-api.mdx`
- Added `computeAggregateBounds` utility documentation to `workspace-api.mdx`
- Added `onForcePseudoState` callback to `configuration.mdx`
- Replaced stale 10-field `OverlayStyle` with full 30-field interface in `configuration.mdx` and `canvas-overlay.mdx`
- Rewrote `renderer.mdx` with correct `Guide`, `OverlayFrame`, `SpacingAdjusterType`, `SpacingAdjusterInfo` types and fixed function signatures
- Removed ghost `importer.ts` module from `modules.mdx` (module was deleted from SDK)
- Fixed `shadow-dom.mdx` `injectCSS` method reference to use Workspace-level API
- Added 5 new glossary terms to `context.md`: Preview Mode, Lazy Child Registration, Dynamic Forced Hover, Marquee Selection, Middle Mouse Pan
- Updated `AI_CONTEXT.md` with all missing Workspace methods and `onForcePseudoState` callback
- Created new `docs-site/pages/guides/electron-integration.mdx` covering Electron demo architecture, CDP integration, and E2E testing

---

## [0.1.0] - 2026-05-25

### Added
- **Twin-Layer Architecture**: Shadow DOM projection layer + Canvas overlay surface
- **Workspace** orchestrator class with full event binding (pointer, key, wheel)
- **ShadowMount**: Open Shadow Root with style isolation and `SHADOW_RESET_CSS`
- **OverlayRenderer**: 2D Canvas painter for selection, handles, guides, badges
- **NodeTree**: In-memory hierarchical tree model with cycle detection
- **Layout introspection**: `detectLayout`, `getFlowAxis`, `getFlowSign`, `detectChildSlots`
- **Viewport math**: `screenToCanvas`, `canvasToScreen`, `calculateZoomAnchor`, hit testing
- **Drop zone system**: Layout-aware drag-and-drop with insertion indicators
- **Operation-driven state sync**: Discrete mutation payloads for host-managed undo/redo (ADR-0001)
- **Pluggable text editing**: `onTextEditRequest` escape hatch for custom editors (ADR-0002)
- **CSS class manipulation**: `addClass`, `removeClass`, `toggleClass` with operation generation (ADR-0003)
- **Flat String Bridge**: Clean HTML export via `ShadowMount.extractHTML`
- **Figma-style selection**: Click, double-click drill-down, Cmd+click deep select, Shift+click multi-select
- **8-handle resize** with live browser reflow and alignment snap guides
- **rAF-throttled rendering** for 60/120Hz display support
- **Demo workbench** at `demo/index.html` for interactive testing
