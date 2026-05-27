# Project Issues: Milestone 6+ Implementation Tasks

---

## Issue #1: rAF-Throttled Redraw Engine

### What to build
Transition the `Workspace` rendering orchestrator from synchronous redraws to a throttled rendering cycle driven by `requestAnimationFrame`. When state modifications occur, the workspace is marked as dirty, and a repaint of the HTML5 canvas `Viewport Surface Layer` is scheduled for the next frame. Multiple sequential updates in a single animation tick must be collapsed into a single rendering call.

### Acceptance criteria
- [x] Visual interactions (pan, zoom, drag-node, resize-node, spacing adjusters, guides) do not trigger synchronous redraws.
- [x] A flag (e.g. `renderRequested` or `dirty`) is used to schedule a single `requestAnimationFrame` render pass.
- [x] The demo application operates smoothly at the display's native refresh rate without layout thrashing.
- [x] Performance logs show decreased CPU overhead during continuous visual dragging/panning.

### Blocked by
None - can start immediately

---

## Issue #2: Standardized Operation Payload & Event Generation

### What to build
Define a canonical `Operation` type schema to describe styling, classing, hierarchy structure, and text modifications. Implement an event dispatcher in `WorkspaceCallbacks` that fires on `pointerup` (or visual gesture completion) containing the serialized operation payload with the changes made and the reciprocal `undo` payload.

### Acceptance criteria
- [x] Define the `Operation` interface in `src/types.ts` to support mutation types: `update-style`, `update-classes`, `reparent`, `reorder`, and `update-text`.
- [x] Expose an `onOperationsGenerated` callback on `WorkspaceCallbacks`.
- [x] Construct and trigger the operation payload (with `undoPayload`) upon completion of visual resize, drag, and spacing adjuster gestures.
- [x] Verify generated operations print clearly to the console log in the demo.

### Blocked by
None - can start immediately

---

## Issue #3: Workspace Operation Replay API (`applyOperation`)

### What to build
Expose a public API `Workspace.applyOperation(op: Operation)` that programmatically replays layout and structure modifications. It must resolve mutations to the custom element styles, tree structure indices, class lists, and text content inside the `Projection Mutation Layer` (Shadow DOM) and trigger a throttled redraw.

### Acceptance criteria
- [x] Implement `applyOperation` on the `Workspace` class.
- [x] Replaying a `reparent` or `reorder` operation correctly updates both the `NodeTree` hierarchy and the DOM wrappers in `ShadowMount`.
- [x] Replaying a `update-style` operation updates inline style values and updates the node dimensions.
- [x] Verify that capturing an emitted operation's `undo` payload and executing `ws.applyOperation(undoPayload)` successfully rolls back the workspace layout.

### Blocked by
- Blocked by Issue #2

---

## Issue #4: Native Class Manipulation APIs & Operations

### What to build
Build public class manipulation methods into the SDK Workspace (`addClass`, `removeClass`, `toggleClass`). Modifying node classes must update the DOM wrappers, notify the tree model, trigger a layout remeasurement, and generate an `update-classes` operation.

### Acceptance criteria
- [x] Add `addClass`, `removeClass`, and `toggleClass` to `Workspace`.
- [x] Modifying node classes updates the underlying Shadow DOM element's class list and triggers a synchronous reflow/remeasure loop.
- [x] Invoking class mutations generates a clean `update-classes` operation sent via `onOperationsGenerated`.
- [x] Verify that class modifications are correctly reflected in the extracted HTML string from the `Flat String Bridge`.

### Blocked by
- Blocked by Issue #2
- Blocked by Issue #3

---

## Issue #5: Plain-Text Inline Editor

### What to build
Implement the default plain-text inline text editing experience. Double-clicking a text-bearing node enters editing mode, applying `contenteditable="plaintext-only"` to the first child element of the wrapper. The SDK intercepts key bindings to prevent style pollution and, upon blur, returns to normal state and emits a `update-text` operation.

### Acceptance criteria
- [x] Double-clicking a text node toggles editing mode, setting `contenteditable="plaintext-only"` inside the Shadow DOM content root.
- [x] Intercepts copy-paste and keystroke bindings to block formatting tags (e.g. bold, italic, custom fonts).
- [x] On blur/focus-loss, editing mode exits, the content is locked, and a `update-text` operation is generated.
- [x] The clean edited text is successfully outputted by the `Flat String Bridge`.

### Blocked by
- Blocked by Issue #2
- Blocked by Issue #3

---

## Issue #6: Custom Editor Mount Escape Hatch

### What to build
Expose the `onTextEditRequest` callback in `WorkspaceCallbacks` to bypass the default plain-text editor. If configured, double-clicking a text node passes the DOM node and a commit callback to the host application, allowing developers to mount their own rich-text editors (like TipTap or Quill).

### Acceptance criteria
- [x] Add `onTextEditRequest` to `WorkspaceCallbacks`.
- [x] If registered, double-clicking a text node delegates control to the callback, skipping the plain-text editing mode.
- [x] The custom editor commit callback updates the element's content root in the Shadow DOM and generates a `update-text` operation.
- [x] Verify editing works correctly when integrated with a mock popup text input in the demo.

### Blocked by
- Blocked by Issue #5
