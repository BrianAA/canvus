import type { KeyboardHandler, WorkspaceContext } from "./types.js";
/**
 * Manages copy, cut, paste, duplicate, and delete operations.
 */
export declare class ClipboardHandler implements KeyboardHandler {
    readonly id = "clipboard";
    private ctx;
    private clipboardItems;
    constructor(ctx: WorkspaceContext);
    onKeyDown(e: KeyboardEvent): boolean;
    /** Deletes the currently selected node from the workspace. */
    deleteSelectedNode(): void;
    /** Duplicates the selected node right next to it as a sibling. */
    duplicateSelectedNode(): void;
    /** Copies the selected node to the internal clipboard. */
    copySelectedNode(): void;
    /** Cuts the selected node to the clipboard, removing it from the canvas. */
    cutSelectedNode(): void;
    /** Pastes the node currently in the clipboard into the canvas. */
    pasteNode(): void;
}
//# sourceMappingURL=clipboard.handler.d.ts.map