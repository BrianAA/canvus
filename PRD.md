# Product Requirements Document (PRD): Canvus SDK — Visual Editor Workspace Extension

## 1. Executive Summary & Vision
Canvus is a headless, framework-agnostic vanilla TypeScript SDK for an interactive visual HTML editor workspace. It allows developers to build low-level layout design tools and A/B testing experimentation platforms. This document specifies the next phase of the SDK (Milestone 6+), focusing on production-grade state synchronization, inline content editing, utility-class framework styling, and core render performance optimizations.

---

## 2. Core Functional Requirements

### A. Operation-Driven State Synchronization (Undo/Redo)
To integrate Canvus into parent IDEs or CMS platforms with their own global history (e.g. Monaco editor), the SDK must delegate transaction history management to the host application using an operation-driven approach.
* **Operation Generation**: Any user gesture (drag, resize, spacing adjustment) that completes must emit a serialized `Operation` delta payload containing the modified state (new styles, classes, or hierarchy positions) and its exact reciprocal undo instructions.
* **Replay API**: The SDK must expose a public `applyOperation(op: Operation)` method to execute an operation programmatically (for undo, redo, or multiplayer collaboration).
* **Operation Schema**: Must support style edits, class edits, hierarchy reparenting, reordering, and text edits.

### B. Pluggable Inline Text Editing
Users must be able to double-click any text-bearing element in the workspace to modify its text contents inline.
* **Plain-Text by Default**: Double-clicking a text node triggers inline `contenteditable="plaintext-only"` inside the Shadow DOM wrapper, inheriting local font families, weights, and styles. HTML paste and command key styling (e.g. bold, italic) are blocked to maintain code integrity.
* **Custom Editor Mount (Rich Text Escape Hatch)**: Host applications can register an `onTextEditRequest` callback. If registered, the default plain-text editor is bypassed, and the host receives the DOM element. The host can then mount a custom editor (like TipTap or Quill) directly inside/over the canvas element and commit the final HTML back to the SDK.

### C. Native Class Manipulation Support
Visual styling gestures should support modern utility-class CSS frameworks (like Tailwind CSS or Bootstrap) without injecting hardcoded inline styles.
* **Class Swapping**: The SDK must expose public APIs to add, remove, and toggle classes on content nodes.
* **Operation Integration**: These class modifications must generate a clean `update-classes` operation.

### D. Throttled Repaints
To optimize rendering performance on dense document layouts and high-refresh-rate displays (120Hz+), canvas redrawing must be throttled.
* **requestAnimationFrame Throttling**: When `Workspace.render()` is called, it must queue a redraw pass for the next animation frame instead of executing synchronously. Multiple mutations within a single tick will render as a single redraw.

### E. Granular Synchronization Boundary
The SDK maintains clear API-driven boundaries for structural changes. It does not parse or diff full HTML pages.
* **Granular Updates**: Structural changes (adding, removing, reordering, reparenting nodes) are made exclusively via explicit SDK mutation methods (`addNode`, `removeNode`, `reparentNode`, `reorderChild`), keeping the SDK lightweight and free of Virtual DOM complexity.

---

## 3. Non-Functional Requirements & Invariants
* **Zero Runtime Dependencies**: The SDK must remain written in pure vanilla TypeScript, compiling to a lightweight, framework-agnostic ESM bundle.
* **Strict Styling Isolation**: SDK chrome wrapper styles (`.canvus-node-wrapper`) must remain strictly isolated inside the Shadow Root.
* **Pristine Flat String Bridge**: Exported HTML from `ShadowMount.extractHTML` must be completely stripped of any SDK wrapper indicators or inline layout helper attributes.
