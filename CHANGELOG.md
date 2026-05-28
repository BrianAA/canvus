# Changelog

All notable changes to the Canvus SDK are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- Explicit JavaScript flagging: Added `markNodeHasJS()`, `unmarkNodeHasJS()`, and `hasJSMark()` APIs on `Workspace` to flag content nodes with JS behavior.
- Visual script badges: Renders a specialized amber `⚡️ JS` badge next to the selection boundary for selected nodes containing guest script behavior (read from host JS marks).
- Side-by-side badge layout rendering: Draws multiple layout/script badges side-by-side with automatic horizontal offset accumulation.
- CSS Grid track parsing and visualization (`parseGridTracks`, grid overlay rendering)
- Grid controls in the demo workbench for defining `grid-template-columns` and other grid properties
- Spacing adjusters with live numeric tooltips for real-time margin/padding editing
- Coordinate/dimension indicators during drag and resize gestures
- Marquee selection for multi-node selection via drag rectangle

### Changed
- Transitioned script execution and stylesheet extraction to a host-driven architecture, removing automatic execution/parsing from the SDK core.
- Streamlined CSS Isolation: Replaced the 300-line CSS parser/rewriter in `injectCSS()` with a lightweight regex performing minimal `:root`/`html`/`body` → `:host` rewriting.
- Upgraded `isEditableTarget` to a robust, duck-typed check to prevent cross-document prototype check failures for shadow DOM target nodes.
- Upgraded overlay renderer to support grid track visualization alongside flex layout badges

### Fixed
- Overlap hit-test interception on small elements: Double-clicking leaf/nested nodes bypasses resize handle / spacing adjuster hit-tests on the second click, allowing text editing mode to successfully activate.
- Spacebar input on `<button>` elements: Intercepts the Spacebar key inside the inline editor, preventing default button click activation (which would toggle Preview Mode) and programmatically inserting spaces at the caret.
- Interval-driven reset during text editing: Prevented background intervals (like `updateToggleBtn` in `test-page.html`) from resetting the text and cursor of an active button while the user is actively editing it.

### Removed
- Removed `importHTMLDocument` and `ImportHTMLOptions` from public exports and core SDK codebase.
- Removed automatic JS detection via global `EventTarget.prototype.addEventListener` monkey-patching.

### Documented
- Updated `docs-site/pages/sdk/renderer.mdx` with `LayoutBadgeInfo` changes.
- Updated `docs-site/pages/concepts/canvas-overlay.mdx` with Script badges & side-by-side badges details.
- Created full documentation site at `docs-site/` powered by Nextra 3 + Next.js 14
- **33 MDX pages** covering: Getting Started (3), Overview (3), Core Concepts (5), SDK Reference (7), Guides (5), Architecture + ADRs (7), Contributing (2), Landing (1)
- Migrated content from `docs/`, `agent.md`, `context.md`, and `PRD.md` into structured docs site
- Created documentation coverage manifest tracking all 57 public exports
- Created `docs-updater` skill for documentation maintenance workflows

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
