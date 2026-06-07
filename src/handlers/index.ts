// ─────────────────────────────────────────────────────────────
// canvus/src/handlers/index.ts — Handler barrel exports.
// ─────────────────────────────────────────────────────────────

export type {
  WorkspaceContext,
  InteractionHandler,
  KeyboardHandler,
  InteractionDetail,
} from "./types.js";

export { PanHandler } from "./pan.handler.js";
export { DrawHandler } from "./draw.handler.js";
export { ClipboardHandler } from "./clipboard.handler.js";
export { CommandHandler } from "./command.handler.js";
export { SpacingHandler } from "./spacing.handler.js";
export { ResizeHandler, getLockedPropertiesForAnchor } from "./resize.handler.js";
export { DragHandler } from "./drag.handler.js";
export { SelectionHandler } from "./selection.handler.js";
