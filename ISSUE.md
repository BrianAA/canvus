# Project Issues: SDK Slimming — "Dumb Canvas" Architecture

> These issues track the outstanding work from the grill-me session that established
> the SDK's new boundary: a **dumb canvas** that renders HTML, provides interactive
> overlays, and emits clean signals. Parsing, script execution, CSS preprocessing,
> and JS detection are the **host IDE's responsibility**.

---

## Issue #1: Update `AI_CONTEXT.md` for "Dumb Canvas" Architecture

### What to build

Update `AI_CONTEXT.md` — the first file AI agents read — to reflect the SDK's new architecture. Remove references to the old auto-detection behavior and importer-as-core, and document the new explicit APIs and host-driven philosophy.

### Acceptance criteria

- [ ] Remove `importHTMLDocument` from the public API surface listing (~line 133).
- [ ] Remove description of auto JS detection via `addEventListener` interception (~lines 496-498).
- [ ] Remove `importHTMLDocument` from the features list (~line 499).
- [ ] Add `markNodeHasJS(nodeId)`, `unmarkNodeHasJS(nodeId)`, `hasJSMark(nodeId)` to the API surface.
- [ ] Document that `injectCSS()` now performs minimal `:root`/`body`/`html` → `:host` rewriting only.
- [ ] Document that `executeScopedScript()` is available as an opt-in public API but is NOT auto-invoked.
- [ ] Add a "SDK Boundary" section clarifying what the SDK handles vs what the host handles.

### Blocked by

None - can start immediately

---

## Issue #2: Add `[Unreleased]` Breaking Changes to `CHANGELOG.md`

### What to build

Add a new `[Unreleased]` section to `CHANGELOG.md` documenting all breaking changes from the SDK slimming work. This ensures consumers upgrading understand what moved, what was removed, and what replaced it.

### Acceptance criteria

- [ ] New `[Unreleased]` section added at the top of the changelog.
- [ ] Documents removal of `importHTMLDocument` and `ImportHTMLOptions` from public API.
- [ ] Documents removal of `rewriteCSS()` (300-line CSS parser replaced with 3-line `:host` regex).
- [ ] Documents removal of auto script detection from `addNode()`/`addChildNode()`/`updateMarkup()`.
- [ ] Documents removal of global `EventTarget.prototype.addEventListener` monkey-patch.
- [ ] Documents new `markNodeHasJS()` / `unmarkNodeHasJS()` / `hasJSMark()` API.
- [ ] Documents that `executeScopedScript()` is kept as explicit opt-in API.

### Blocked by

None - can start immediately

---

## Issue #3: Remove `importer.ts` Dead Code from SDK `src/`

### What to build

`src/importer.ts` (412 lines) is no longer exported from `index.ts` but still exists on disk and gets compiled to `dist/importer.js`. Remove it from the SDK source tree so it doesn't ship as dead code. The file should be preserved in version control history and will be re-introduced in the Electron demo project (Issue #9).

### Acceptance criteria

- [ ] `src/importer.ts` is deleted from the SDK source tree.
- [ ] `dist/importer.js` and `dist/importer.d.ts` are no longer generated on `npm run build`.
- [ ] No remaining imports or references to `importer.ts` in any `src/` file.
- [ ] The SDK builds clean after removal.

### Blocked by

None - can start immediately

---

## Issue #4: Rewrite Importing Guide for Host-Driven Workflow

### What to build

Rewrite `docs-site/pages/guides/importing.mdx` to reflect the new architecture where HTML parsing and CSS preprocessing are the host application's responsibility. The guide should teach consumers the core SDK APIs they use instead: `ws.injectCSS(css)`, `ws.addNode(node, parentId)`, and `ws.getShadowMount().executeScopedScript(code)`.

### Acceptance criteria

- [ ] The guide no longer references `importHTMLDocument` as a core SDK export.
- [ ] Documents the host-driven workflow: host parses HTML → host extracts CSS → host calls `injectCSS` → host calls `addNode`.
- [ ] Includes a code example showing the new workflow end-to-end.
- [ ] Explains the minimal `:root`/`body`/`html` → `:host` rewriting that `injectCSS` performs automatically.
- [ ] Notes that `executeScopedScript()` is available for hosts that need to run scoped JS.

### Blocked by

- Blocked by Issue #1

---

## Issue #5: Update Canvas Overlay Docs for Explicit `markNodeHasJS()`

### What to build

Update `docs-site/pages/concepts/canvas-overlay.mdx` to reflect that JS badges are no longer auto-detected via global `addEventListener` interception. They are now triggered explicitly by the host calling `ws.markNodeHasJS(nodeId)`.

### Acceptance criteria

- [ ] Lines 41-42 updated: script badges described as host-triggered via `markNodeHasJS()`, not auto-detected.
- [ ] Side-by-side badge rendering description remains accurate (layout + JS badge).
- [ ] Example code snippet shows `ws.markNodeHasJS(nodeId)` usage.

### Blocked by

- Blocked by Issue #1

---

## Issue #6: Update `docs/api.md` — Remove Importer, Add New APIs

### What to build

Update the API reference documentation to remove the `importHTMLDocument` function and add the new `markNodeHasJS()` / `unmarkNodeHasJS()` / `hasJSMark()` methods.

### Acceptance criteria

- [ ] `importHTMLDocument` entry removed from the API reference (~line 210).
- [ ] `markNodeHasJS(nodeId: string): void` documented with description.
- [ ] `unmarkNodeHasJS(nodeId: string): void` documented with description.
- [ ] `hasJSMark(nodeId: string): boolean` documented with description.
- [ ] `injectCSS` entry updated to note the minimal `:host` rewriting behavior.
- [ ] `executeScopedScript` documented as a public opt-in API on `ShadowMount`.

### Blocked by

- Blocked by Issue #1

---

## Issue #7: Update `context.md` with SDK Boundary Definition

### What to build

Add a clear "SDK Boundary" section to `context.md` that defines what the Canvus SDK handles versus what the host application is responsible for. This prevents future AI agents and contributors from re-introducing features that belong in the host.

### Acceptance criteria

- [ ] New section added defining the SDK boundary: renders HTML, provides overlays, emits signals.
- [ ] Explicitly lists what the **host** handles: HTML parsing, CSS preprocessing, script sandboxing, JS detection.
- [ ] The "Day in the Life" example dialogue remains accurate or is updated to reference the new APIs.

### Blocked by

- Blocked by Issue #1

---

## Issue #8: Update Docs-Updater Coverage Manifest

### What to build

Update `skills/docs-updater/resources/coverage-manifest.md` to reflect that `importHTMLDocument` is no longer a core SDK export and that new APIs (`markNodeHasJS`, `unmarkNodeHasJS`, `hasJSMark`) need coverage.

### Acceptance criteria

- [ ] `importHTMLDocument` entry removed or marked as deprecated/external (~line 118).
- [ ] New entries added for `markNodeHasJS`, `unmarkNodeHasJS`, `hasJSMark`.
- [ ] Mapping from `src/importer.ts` to `guides/importing.mdx` removed or updated (~line 57 of `SKILL.md`).

### Blocked by

- Blocked by Issue #4
- Blocked by Issue #5

---

## Issue #9: Scaffold Electron Demo Project with File-Based Import

### What to build

Create a separate Electron application for full workflow testing of the Canvus SDK. This app replaces the removed import UI from `demo/index.html` and serves as the real-world integration test for the host-driven architecture. It should load HTML files from disk, preprocess CSS, sandbox scripts, and mount content into the Canvus workspace.

### Acceptance criteria

- [ ] New Electron project created (separate repo or monorepo workspace — decision needed).
- [ ] Electron app loads HTML files from the filesystem via native file dialog.
- [ ] App extracts `<style>` and `<link>` tags from loaded HTML and injects via `ws.injectCSS()`.
- [ ] App extracts `<script>` tags and executes them via `ws.getShadowMount().executeScopedScript()`.
- [ ] App calls `ws.markNodeHasJS()` for nodes containing detected scripts.
- [ ] `pressure-test.html` and `test-page.html` load and render correctly in the Electron app.
- [ ] The `importHTMLDocument` utility (from git history or reimplemented) is available in the Electron project.

### Blocked by

- Blocked by Issue #3

---

## Issue #10: Move CSS Forced-State Rewriter into Electron Demo

### What to build

Reintroduce the CSS forced-state selector duplication logic (`:hover` → `.canvus-state-hover`) as a utility inside the Electron demo project. Optionally, also explore using Chrome DevTools Protocol `CSS.forcePseudoState` as a native alternative available in Electron's Chromium runtime.

### Acceptance criteria

- [ ] The Electron demo includes a CSS rewriting utility that duplicates `:hover`/`:active`/`:focus` selectors as `.canvus-state-*` class equivalents.
- [ ] When the user toggles forced states in the Electron UI, the rewritten CSS activates the correct styles.
- [ ] Document the CDP `CSS.forcePseudoState` approach as an alternative for future consideration.

### Blocked by

- Blocked by Issue #9

---

## Issue #11: Slim `demo/index.html` to Minimal SDK Validation Demo

### What to build

Reduce the SDK's in-repo demo from ~711 lines to a minimal validation page (~200-400 lines) that proves the core SDK works: mount nodes, drag, resize, export. The full workflow testing (style panels, forced states, event simulation, undo) moves to the Electron demo (Issue #9). A decision is needed on how much to strip.

### Acceptance criteria

- [ ] Demo mounts 2-3 seed nodes (root + nested children) to validate core mounting.
- [ ] Drag, resize, and snap guides work correctly.
- [ ] Flat String Bridge commit log still shows clean HTML on interaction.
- [ ] Viewport controls (zoom, pan, reset) remain functional.
- [ ] Demo is ≤ 400 lines of HTML.
- [ ] All removed features (style panel, forced states, event simulation, undo) are documented as "moved to Electron demo" in a comment at the top of the file.

### Blocked by

None - can start immediately
