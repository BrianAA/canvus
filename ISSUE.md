# Issue 1: Register Workspace Callbacks for Lock Detection

## What to build

Add API options to the Workspace settings to enable host applications to declare when a node style property (like margin, padding, width, height, or border-radius) is locked by a stylesheet class, and to listen for interactions on these locked properties.

## Acceptance criteria

- [ ] Add `isPropertyLocked?: (nodeId: string, property: string) => boolean` callback to `WorkspaceCallbacks` and `WorkspaceConfig` interfaces in `src/types.ts`.
- [ ] Add `onPropertyLockInteraction?: (nodeId: string, property: string, currentValue: string) => void` callback to `WorkspaceCallbacks` and `WorkspaceConfig` in `src/types.ts`.
- [ ] Implement proxy/delegate methods in the main `Workspace` class in `src/workspace.ts` to coordinate calling these hooks.
- [ ] Expose default stub behaviors if these callbacks are not provided by the host (defaulting to unlocked/no-op).

## Blocked by

None - can start immediately

---

# Issue 2: Spacing Adjuster Class-Lock Logic & Verification

## What to build

Prevent users from dragging spacing adjusters (margins and paddings) when the property is locked by a CSS class. The SDK should block pointer events on locked spacing elements and fire the lock interaction callback to let the host handle alerts/unlocking.

## Acceptance criteria

- [ ] When hovering over a node, the workspace spacing adjuster detection checks `isPropertyLocked` for margin/padding directions.
- [ ] If a margin/padding direction is locked, change mouse cursor to default and prevent active drag handler registration for that specific spacing adjuster.
- [ ] On pointer down attempt on a locked spacing adjuster, intercept the event, block dragging, and invoke the `onPropertyLockInteraction` callback with the nodeId, property name, and its current computed style value (e.g. `12px`).
- [ ] Write unit/integration tests verifying a locked margin/padding blocks visual drag and notifies the callback.

## Blocked by

- Blocked by #1

---

# Issue 3: Resize & Corner-Radius Class-Lock Logic & Verification

## What to build

Prevent users from dragging resize handles (width and height) or corner-radius adjustment handles when those properties are locked by a CSS class. Block the drag actions, keep default pointer cursor, and emit lock interactions to the host.

## Acceptance criteria

- [ ] When hovering over resize anchors (e.g., nw, n, ne, e, se, s, sw, w) or corner-radius handles, query `isPropertyLocked` for size/radius properties.
- [ ] If the property is locked, do not render resize cursors (keep default arrow or pointer cursor) and disable dragging/adjusting.
- [ ] On drag attempt on a locked resize anchor or corner-radius handle, block the gesture and fire `onPropertyLockInteraction` with the nodeId, property name, and its current computed value.
- [ ] Write unit/integration tests validating blocked resize/radius gestures and lock callback triggers.

## Blocked by

- Blocked by #1

---

# Issue 4: Multi-Node Selection Class-Lock Policy

## What to build

Implement a selection policy for multi-node operations. If the user performs a drag/resize gesture on multiple selected elements, and any subset of those elements contains a class-locked property for that gesture, the SDK must block the gesture completely for layout integrity.

## Acceptance criteria

- [ ] When initiating a drag, resize, or spacing adjustment on a multi-node selection, iterate through all selected node IDs and check if the target property is locked.
- [ ] If *any* node in the selection is locked for that property, cancel the entire interaction gesture.
- [ ] Fire `onPropertyLockInteraction` for each locked node in the selection to allow the host application to alert the user.
- [ ] Write tests showing that multi-select drag/resize aborts cleanly when one of the selected nodes is locked.

## Blocked by

- Blocked by #2
- Blocked by #3

---

# Issue 5: E2E Visual Regression Suite for Locked Styles

## What to build

Implement full end-to-end integration tests inside the Playwright/Electron spec suite validating the entire class-lock and unlocking lifecycle (detection -> blocked drag -> toast alert -> inline override -> successful drag).

## Acceptance criteria

- [ ] Add a mock host page containing elements styled with Tailwind classes (e.g. `p-4`, `w-48`).
- [ ] Register mock implementations of `isPropertyLocked` and `onPropertyLockInteraction` in the demo workspace instance.
- [ ] Verify using Playwright that attempting to drag padding or resize the element fails to change bounds and triggers the mock toast message.
- [ ] Trigger an unlock event (simulating host writing inline styles) and verify the element is now resizable/drag-adjustable.

## Blocked by

- Blocked by #2
- Blocked by #3
- Blocked by #4
