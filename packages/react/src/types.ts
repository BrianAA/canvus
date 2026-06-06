// ─────────────────────────────────────────────────────────────
// @canvus/react — Type Definitions
// React-specific types for the Canvus React bindings package.
// ─────────────────────────────────────────────────────────────

import type {
  Rect,
  WorkspaceConfig,
  WorkspaceCallbacks,
  WebHTMLNode,
  Workspace,
} from "@canvus/core";
import type { ComponentType, CSSProperties } from "react";

// ── React Node Descriptor ───────────────────────────────────

/**
 * Descriptor for mounting a live React component as a canvas node.
 *
 * Instead of providing raw HTML markup, you provide a React component
 * and its props. The `@canvus/react` layer will create an empty
 * container in the core workspace and mount the component into it
 * using React's `createRoot` API.
 */
export interface ReactNodeDescriptor {
  /** Unique node identifier. */
  id: string;
  /** The React component to render inside the canvas node. */
  component: ComponentType<any>;
  /** Props to pass to the component. */
  props: Record<string, any>;
  /** Initial position and dimensions in canvas-space. */
  currentRect: Rect;
  /** Optional parent node ID for nested mounting. */
  parentId?: string | null;
}

// ── React Node Snapshot ─────────────────────────────────────

/**
 * Snapshot emitted when a React-managed node is committed
 * after a visual gesture (drag, resize, etc.).
 *
 * This replaces the Flat String Bridge's HTML output for
 * React nodes, giving the host application structured data
 * instead of rendered HTML markup.
 */
export interface ReactNodeSnapshot {
  /** The React component reference. */
  component: ComponentType<any>;
  /** String name of the component (for serialization). */
  componentName: string;
  /** Current props at the time of commit. */
  props: Record<string, any>;
  /** Current canvas-space bounding rect after the gesture. */
  rect: Rect;
}

// ── Component Props ─────────────────────────────────────────

/**
 * Props for the `<Canvus />` component.
 *
 * Accepts workspace configuration, visual styling, and all
 * workspace callbacks. React-managed node commits are routed
 * to `onReactNodeCommit` instead of `onHTMLCommit`.
 */
export interface CanvusProps {
  /** Workspace configuration (snap threshold, overlay styles, etc.). */
  config?: WorkspaceConfig;
  /** CSS styles applied to the container div. */
  style?: CSSProperties;
  /** CSS class name for the container div. */
  className?: string;

  // ── Commit Callbacks ──────────────────────────────────

  /**
   * Fired for vanilla HTML node commits only.
   * React-managed nodes are filtered out and routed
   * to `onReactNodeCommit` instead.
   */
  onHTMLCommit?: WorkspaceCallbacks["onHTMLCommit"];

  /**
   * Fired when a React-managed node is committed after
   * a visual gesture (drag, resize, spacing adjustment).
   * Provides the component reference, current props, and
   * updated rect for host-side state management.
   */
  onReactNodeCommit?: (id: string, snapshot: ReactNodeSnapshot) => void;

  // ── Standard Workspace Callbacks ──────────────────────

  onSelectionChange?: WorkspaceCallbacks["onSelectionChange"];
  onViewportChange?: WorkspaceCallbacks["onViewportChange"];
  onOperationsGenerated?: WorkspaceCallbacks["onOperationsGenerated"];
  onNodeRectChange?: WorkspaceCallbacks["onNodeRectChange"];
  onInteractionChange?: WorkspaceCallbacks["onInteractionChange"];
  onBreadcrumbChange?: WorkspaceCallbacks["onBreadcrumbChange"];
  onTextEditRequest?: WorkspaceCallbacks["onTextEditRequest"];
}

// ── Context Value ───────────────────────────────────────────

/**
 * Value returned by the `useCanvus()` hook.
 *
 * Provides both the raw `Workspace` instance for imperative
 * access and convenience methods for React node lifecycle.
 */
export interface CanvusContextValue {
  /** The raw Workspace instance for imperative access, or null before mount. */
  workspace: Workspace | null;

  /** Mount a React component as a canvas node. */
  addReactNode: (descriptor: ReactNodeDescriptor) => void;

  /** Update props of a mounted React node (triggers re-render). */
  updateReactNode: (id: string, props: Record<string, any>) => void;

  /** Remove a React node from the canvas and unmount its React root. */
  removeReactNode: (id: string) => void;

  /**
   * Add a vanilla HTML node (pass-through to core).
   * For standard raw-markup nodes that don't use React rendering.
   */
  addNode: (
    node: Readonly<WebHTMLNode>,
    parentId?: string | null,
    index?: number,
  ) => Rect;
}
