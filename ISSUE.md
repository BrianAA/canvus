# Project Issues: Active JavaScript & Dynamic States

---

## Issue #1: Viewport Preview Mode & Event Passthrough

### What to build

Introduce a "Preview Mode" to the Workspace. When Preview Mode is enabled:
- The Viewport Surface Layer (Canvas) is set to `pointer-events: none` and all selection outlines, grid tracks, badging, and drag-guides are hidden.
- Mouse/pointer events pass directly through to the underlying Shadow DOM content nodes, letting users naturally hover, click, and interact with normal HTML page behaviors.
- Expose `workspace.setPreviewMode(enabled: boolean)` and `workspace.isPreviewMode(): boolean`.
- Add a toggle button in the `demo/index.html` dashboard to test switching modes.

### Acceptance criteria

- [ ] `Workspace` class has a public `setPreviewMode(enabled: boolean)` method.
- [ ] `Workspace` class has a public `isPreviewMode(): boolean` method.
- [ ] When Preview Mode is enabled, selection, hover, resize, and spacing adjuster guides are hidden on the canvas.
- [ ] When Preview Mode is enabled, the overlay canvas has `pointer-events: none` style, allowing click and hover events to go through to Shadow DOM.
- [ ] The demo workspace contains a "Preview Mode" toggle button that functions as expected.

### Blocked by

None - can start immediately

---

## Issue #2: Shadow DOM Script Evaluator Wrapper

### What to build

Implement the safe script execution wrapper outlined in ADR 0005. When adding/updating markup, parse and extract `<script>` tags from the raw HTML and execute/evaluate them scoped to the Shadow DOM boundary:
- When `ShadowMount.addNode()` or `ShadowMount.updateMarkup()` are called, scan the raw HTML for `<script>` tags.
- Extract their inline code or fetch their `src` sources, wrap them to prevent bleeding into the global window, and evaluate/execute them within the context of the Shadow Root.
- Ensure any dynamically created scripts are cleaned up on `removeNode()`.

### Acceptance criteria

- [ ] Scripts in `rawMarkup` are parsed, extracted, and executed inside the Shadow DOM container.
- [ ] Executed scripts are evaluated in a closed/scoped context to minimize global scope leakage.
- [ ] Dynamic event listeners or elements added by these scripts are cleaned up when the corresponding node is removed.
- [ ] Verify script execution in the demo with a mock active component (e.g., a simple counter button script).

### Blocked by

None - can start immediately

---

## Issue #3: Edit Mode State Forcing via CSS Pseudo-Class Utility Classes

### What to build

Expose an API allowing designers to style hover/active states (like tooltips or dropdowns) inside Edit Mode without leaving it by injecting custom state utility classes:
- Expose `workspace.forceNodeState(nodeId, state: 'hover' | 'active' | 'focus', enabled: boolean): void`.
- When enabled, inject corresponding wrapper classes (e.g. `.canvus-state-hover`) directly onto the node's wrapper.
- Add controls to toggle these forced states in the selected node styling panel in the demo app.

### Acceptance criteria

- [ ] `Workspace` class exposes `forceNodeState(nodeId, state, enabled)`.
- [ ] Activating a forced state adds the corresponding utility class (e.g., `.canvus-state-hover`) to the target node's Shadow DOM wrapper.
- [ ] The CSS within `ShadowMount` handles these forced classes appropriately.
- [ ] The demo app features controls to easily toggle forced states for the active selection.

### Blocked by

None - can start immediately

---

## Issue #4: Simulated Interactivity via Synthetic DOM Event Dispatcher

### What to build

Build a mechanism to trigger JS-based dynamic behaviors (like tooltips or dropdowns that require JavaScript execution) while in Edit Mode by dispatching synthetic events directly to elements:
- Expose `workspace.dispatchInteractionEvent(nodeId, eventName: string): void`.
- Internally dispatch synthetic events (e.g. `element.dispatchEvent(new MouseEvent(eventName))`) to the target element inside the Shadow DOM wrapper.
- Test this in the demo by adding a "Simulate Event" section to trigger hover-based tooltips while editing.

### Acceptance criteria

- [ ] `Workspace` class exposes `dispatchInteractionEvent(nodeId, eventName)`.
- [ ] Calling the API dispatches the correct synthetic event to the element inside the Shadow DOM wrapper.
- [ ] Verify that a simulated event successfully triggers script-bound listeners in the demo.

### Blocked by

- Blocked by Issue #2

---

## Issue #5: HTML Page Parser & Stylesheet Extractor

### What to build

Build a parser utility that takes a full HTML string (`<html>...</html>`), uses `DOMParser` to parse it, extracts stylesheet `<link>` and `<style>` nodes, and injects them scoped to the workspace's Shadow DOM using the existing `injectCSS()` and `injectCSSLink()` APIs.

### Acceptance criteria

- [ ] A document importer module `src/importer.ts` exposes `importHTMLDocument(workspace, htmlString, options)`.
- [ ] Style elements (`<style>`) and absolute/CDN stylesheet link elements are successfully extracted from `<head>` and injected into the Shadow DOM.
- [ ] Extracted styles do not leak into the host editor page.

### Blocked by

None - can start immediately

---

## Issue #6: Recursive Node Tree Builder

### What to build

Recursively traverse the parsed `<body>` tree, generate wrapper schemas (`WebHTMLNode`), detect hierarchy structures, and load them into the workspace via `workspace.addNode()`, so that the page mounts inside the Shadow DOM and is registered in the workspace `NodeTree`.

### Acceptance criteria

- [ ] The importer walks the entire DOM body and identifies interactive nodes (either tagging all elements or filtering based on options).
- [ ] All elements are registered inside the workspace with accurate hierarchy structures and parent IDs.
- [ ] Bounding rect measurements compile properly for all registered nodes.

### Blocked by

- Blocked by Issue #5

---

## Issue #7: Base URL & Asset Path Resolver

### What to build

Support resolving relative asset URLs (`src`, `href`, `background-image`) by taking an optional `baseUrl` option and rewriting relative paths to absolute URLs (so images, fonts, and stylesheets render correctly even when the editor runs on a separate localhost origin).

### Acceptance criteria

- [ ] The importer accepts a `baseUrl` string option.
- [ ] Relative `href` stylesheet links are resolved into absolute URLs before being injected.
- [ ] Relative `src` attributes on images inside the body are resolved into absolute URLs.
- [ ] Relative URL paths inside CSS text (like `background-image: url(...)`) are resolved.

### Blocked by

- Blocked by Issue #6
