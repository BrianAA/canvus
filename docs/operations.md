# Operation-Driven State Synchronization (Undo/Redo)

Canvus delegates transaction history (Undo/Redo) to the host application. Instead of managing a private internal history stack (which would desynchronize with host state like page metadata, code views, or other workspace widgets), the SDK emits discrete **Operation** payloads when a visual gesture completes.

Host applications listen for these events, push them onto a global transaction stack, and apply them back to the workspace using the `applyOperation` replay API.

---

## 1. The Operation Contract

Every operation emitted or replayed adheres to the `Operation` interface defined in [`src/types.ts`](file:///Users/balfaro01/Documents/GitHub/canvus/src/types.ts):

```typescript
export interface Operation {
  /** The action type class name. */
  type: "update-style" | "update-classes" | "reparent" | "reorder" | "update-text";
  /** Unique selector ID of the target content node. */
  nodeId: string;
  /** Specific delta payload for applying this change. */
  payload: any;
  /** Reciprocal delta payload to undo this change. */
  undoPayload: any;
}
```

---

## 2. Operation Schemas & Payloads

### A. Style Update (`update-style`)
Emitted when dragging a resize anchor or mutating padding/margin spacing adjusters.
*   **Payload**: Key-value pair of CSS property values applied.
*   **Undo Payload**: Reciprocal key-value pair of CSS property values to restore.

```json
{
  "type": "update-style",
  "nodeId": "card-hero",
  "payload": {
    "padding-top": "40px",
    "padding-bottom": "40px"
  },
  "undoPayload": {
    "padding-top": "28px",
    "padding-bottom": "28px"
  }
}
```

### B. Class Swap (`update-classes`)
Emitted when calling `addClass`, `removeClass`, or `toggleClass` methods to mutate utility classes.
*   **Payload**: Lists of class names to `add` and `remove`.
*   **Undo Payload**: Reverse lists to roll back.

```json
{
  "type": "update-classes",
  "nodeId": "card-hero",
  "payload": {
    "add": ["demo-highlight"],
    "remove": []
  },
  "undoPayload": {
    "add": [],
    "remove": ["demo-highlight"]
  }
}
```

### C. Tree Reparent (`reparent`)
Emitted when a node is dragged and dropped into a different parent container or returned to root level.
*   **Payload**: The `newParentId` and insertion `index`.
*   **Undo Payload**: The `oldParentId` and previous insertion `index`.

```json
{
  "type": "reparent",
  "nodeId": "flex-child-1",
  "payload": {
    "newParentId": "flex-container",
    "index": 0
  },
  "undoPayload": {
    "newParentId": null,
    "index": 2
  }
}
```

### D. Tree Reorder (`reorder`)
Emitted when dragging a node changes its index among its siblings within the same parent container.
*   **Payload**: The target insertion `index`.
*   **Undo Payload**: The previous insertion `index`.

```json
{
  "type": "reorder",
  "nodeId": "flex-child-2",
  "payload": {
    "index": 2
  },
  "undoPayload": {
    "index": 1
  }
}
```

### E. Text Update (`update-text`)
Emitted when double-clicking a text node, editing its plain text (or custom rich text), and blurring.
*   **Payload**: The DOM element hierarchy `path` and the modified `html` string.
*   **Undo Payload**: The DOM element hierarchy `path` and the original `html` string.

```json
{
  "type": "update-text",
  "nodeId": "card-hero",
  "payload": {
    "path": [0],
    "html": "Canvus SDK v1.2"
  },
  "undoPayload": {
    "path": [0],
    "html": "Canvus SDK v1.1"
  }
}
```
*Note: The `path` array tracks DOM child indices down from the node's content root to identify the exact sub-element edited.*

---

## 3. Host Integration Flow

To hook up Undo/Redo in a host dashboard (e.g. Monaco Editor, visual CMS):

### 1. Listen for Visual Changes
Bind to the `onOperationsGenerated` callback on instantiation:
```typescript
const historyStack: Operation[][] = [];

const ws = new Workspace(container, {
  onOperationsGenerated(ops) {
    // Push the batch of operations onto the host undo queue
    historyStack.push(ops);
    updateUndoButtonUI();
  }
});
```

### 2. Execute Undo
When the user triggers Undo (e.g., Command/Ctrl + Z), pop the operations and apply their `undoPayload`:
```typescript
function performUndo() {
  if (historyStack.length === 0) return;
  const ops = historyStack.pop();
  
  // Replay in reverse sequence to preserve dependencies
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    
    ws.applyOperation({
      type: op.type,
      nodeId: op.nodeId,
      payload: op.undoPayload,       // Apply the undo payload
      undoPayload: op.payload        // Swap the reciprocal payload
    });
  }
}
```
Applying operations triggers a synchronous reflow, geometry measurement updates, and redraws overlays automatically.
