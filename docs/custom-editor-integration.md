# Custom Rich-Text Editor Mount Guide

To avoid the code layout corruption, styling pollution, and browser-specific inconsistencies that standard `contenteditable` actions cause, Canvus restricts inline text edits to plain-text by default. However, it provides a pluggable escape hatch callback so host applications can mount fully customized rich-text editors (like TipTap, Quill, or custom WYSIWYG boxes) over content nodes.

---

## 1. Default Behavior (Plain-Text Editing)

When a text-bearing node is double-clicked:
1.  Canvus marks the nearest wrapper child as `contenteditable="plaintext-only"`.
2.  It intercepts copy-paste events and formatting hotkeys (e.g. `Cmd+B`, `Cmd+I`) to strip formatting tags.
3.  Upon loss of focus (`blur` event) or pressing `Escape`/`Enter`, editing mode finishes.
4.  It fires `onHTMLCommit` via the **Flat String Bridge** and emits an `update-text` operation.

---

## 2. Pluggable Escape Hatch (`onTextEditRequest`)

To bypass the plain-text default editor and inject your own custom editor, register the `onTextEditRequest` handler in `WorkspaceCallbacks`:

```typescript
export interface WorkspaceCallbacks {
  onTextEditRequest?: (
    nodeId: string,
    element: HTMLElement,
    commit: (newHTML: string) => void
  ) => void;
}
```

### The Workflow:
1.  The user double-clicks a text-bearing node.
2.  Canvus checks if `onTextEditRequest` is registered. If present, the default plain-text editor is **skipped**.
3.  Canvus invokes `onTextEditRequest(nodeId, element, commit)`:
    *   `nodeId`: The unique ID of the selected content node.
    *   `element`: The exact sub-element double-clicked (useful for absolute coordinate calculations).
    *   `commit`: A callback function provided by the SDK. Call `commit(newHTML)` with the updated HTML string once editing is finished.
4.  Calling `commit(newHTML)` updates the Shadow DOM, remeasures boundaries, redraws the overlays, and generates an `update-text` operation.

---

## 3. Implementation Example

Here is a complete integration example showing how to mount a custom editor overlay on double-click:

```typescript
import { Workspace } from 'canvus';

// Instantiate Workspace
const ws = new Workspace(document.getElementById('canvas-container')!, {
  onTextEditRequest(nodeId, element, commit) {
    // 1. Determine positioning of the target element on screen
    const bounds = element.getBoundingClientRect();

    // 2. Create your editor container element overlay
    const editorOverlay = document.createElement('div');
    editorOverlay.style.position = 'absolute';
    editorOverlay.style.left = `${bounds.left + window.scrollX}px`;
    editorOverlay.style.top = `${bounds.top + window.scrollY}px`;
    editorOverlay.style.width = `${bounds.width}px`;
    editorOverlay.style.height = `${bounds.height}px`;
    editorOverlay.style.zIndex = '1000';
    
    document.body.appendChild(editorOverlay);

    // 3. Mount TipTap / Quill or a simple textarea
    const textarea = document.createElement('textarea');
    textarea.value = element.innerHTML;
    textarea.style.width = '100%';
    textarea.style.height = '100%';
    editorOverlay.appendChild(textarea);
    textarea.focus();

    // 4. Handle Save / Commit
    const handleBlur = () => {
      const updatedHTML = textarea.value;
      
      // Save changes back to the SDK
      commit(updatedHTML);
      
      // Clean up overlay element
      editorOverlay.remove();
      textarea.removeEventListener('blur', handleBlur);
    };

    textarea.addEventListener('blur', handleBlur);
    textarea.addEventListener('keydown', (e) => {
      // Enter key (without Shift) commits
      if (e.key === 'Enter' && !e.shiftKey) {
        textarea.blur();
      }
    });
  }
});
```
