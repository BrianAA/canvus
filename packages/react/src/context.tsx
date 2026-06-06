// ─────────────────────────────────────────────────────────────
// @canvus/react — React Context & Provider
//
// Manages the Workspace lifecycle and React node mounting.
// The CanvusProvider owns:
//   1. The Workspace instance (created on mount, disposed on unmount)
//   2. A Map<string, Root> of active React roots for mounted nodes
//   3. A Map<string, ReactNodeDescriptor> tracking React node metadata
//   4. The onHTMLCommit interception logic for commit routing
// ─────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { Workspace } from "@canvus/core";
import type { Rect } from "@canvus/core";
import type {
  CanvusContextValue,
  CanvusProps,
  ReactNodeDescriptor,
  ReactNodeSnapshot,
} from "./types.js";

// ── Context ─────────────────────────────────────────────────

/**
 * React context for accessing the Canvus workspace and
 * React node management methods.
 *
 * @internal — consumers should use `useCanvus()` instead.
 */
export const CanvusContext = createContext<CanvusContextValue | null>(null);

// ── Provider Props ──────────────────────────────────────────

interface CanvusProviderProps extends CanvusProps {
  /** The container element to mount the Workspace into. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  children?: ReactNode;
}

// ── Provider Component ──────────────────────────────────────

/**
 * Internal provider that manages the Workspace lifecycle
 * and React node mounting. Wrapped by `<Canvus />`.
 *
 * @internal
 */
export function CanvusProvider({
  containerRef,
  config,
  onHTMLCommit,
  onReactNodeCommit,
  onSelectionChange,
  onViewportChange,
  onOperationsGenerated,
  onNodeRectChange,
  onInteractionChange,
  onBreadcrumbChange,
  onTextEditRequest,
  children,
}: CanvusProviderProps) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  // ── Stable refs for mutable tracking state ──────────
  // These maps persist across renders without causing re-renders.

  /** Active React roots indexed by node ID. */
  const activeRootsRef = useRef(new Map<string, Root>());
  /** React node metadata indexed by node ID. */
  const reactNodeMetaRef = useRef(new Map<string, ReactNodeDescriptor>());
  /** Temporary store for recently deleted React node descriptors (for Undo/Redo restoration). */
  const deletedReactNodesRef = useRef(new Map<string, ReactNodeDescriptor>());

  // ── Stable callback refs ────────────────────────────
  // Store callbacks in refs so the Workspace doesn't need to
  // be re-created when callbacks change.

  const onHTMLCommitRef = useRef(onHTMLCommit);
  onHTMLCommitRef.current = onHTMLCommit;

  const onReactNodeCommitRef = useRef(onReactNodeCommit);
  onReactNodeCommitRef.current = onReactNodeCommit;

  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const onOperationsGeneratedRef = useRef(onOperationsGenerated);
  onOperationsGeneratedRef.current = onOperationsGenerated;

  const onNodeRectChangeRef = useRef(onNodeRectChange);
  onNodeRectChangeRef.current = onNodeRectChange;

  const onInteractionChangeRef = useRef(onInteractionChange);
  onInteractionChangeRef.current = onInteractionChange;

  const onBreadcrumbChangeRef = useRef(onBreadcrumbChange);
  onBreadcrumbChangeRef.current = onBreadcrumbChange;

  const onTextEditRequestRef = useRef(onTextEditRequest);
  onTextEditRequestRef.current = onTextEditRequest;

  // ── Workspace Lifecycle ─────────────────────────────

  // Store config in a ref — it's only consumed at workspace
  // creation time and should not trigger re-creation.
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ws = new Workspace(
      container,
      {
        onHTMLCommit: (id, html) => {
          // Route commits: React nodes → onReactNodeCommit,
          // vanilla HTML nodes → onHTMLCommit
          const meta = reactNodeMetaRef.current.get(id);
          if (meta) {
            // This is a React-managed node — build snapshot
            const node = ws.getNodeTree().get(id);
            const snapshot: ReactNodeSnapshot = {
              component: meta.component,
              componentName:
                meta.component.displayName ||
                meta.component.name ||
                "Unknown",
              props: meta.props,
              rect: node?.currentRect ?? meta.currentRect,
            };
            onReactNodeCommitRef.current?.(id, snapshot);
          } else {
            // Vanilla HTML node — pass through
            onHTMLCommitRef.current?.(id, html);
          }
        },
        onSelectionChange: (ids) =>
          onSelectionChangeRef.current?.(ids),
        onViewportChange: (vp) =>
          onViewportChangeRef.current?.(vp),
        onOperationsGenerated: (ops) =>
          onOperationsGeneratedRef.current?.(ops),
        onNodeRectChange: (id, rect) =>
          onNodeRectChangeRef.current?.(id, rect),
        onInteractionChange: (mode) =>
          onInteractionChangeRef.current?.(mode),
        onBreadcrumbChange: (path) =>
          onBreadcrumbChangeRef.current?.(path),
        onTextEditRequest: onTextEditRequest
          ? (nodeId, element, commit) =>
              onTextEditRequestRef.current?.(nodeId, element, commit)
          : undefined,
        onNodeAdded: (id) => {
          const deletedMeta = deletedReactNodesRef.current.get(id);
          if (deletedMeta) {
            const container = ws.getContentRoot(id);
            if (container) {
              const root = createRoot(container);
              root.render(<deletedMeta.component {...deletedMeta.props} />);
              activeRootsRef.current.set(id, root);
              reactNodeMetaRef.current.set(id, deletedMeta);
              deletedReactNodesRef.current.delete(id);

              const node = ws.getNodeTree().get(id);
              const snapshot: ReactNodeSnapshot = {
                component: deletedMeta.component,
                componentName:
                  deletedMeta.component.displayName ||
                  deletedMeta.component.name ||
                  "Unknown",
                props: deletedMeta.props,
                rect: node?.currentRect ?? deletedMeta.currentRect,
              };
              onReactNodeCommitRef.current?.(id, snapshot);
            }
          }
        },
        onNodeRemoved: (id) => {
          const root = activeRootsRef.current.get(id);
          if (root) {
            try {
              root.unmount();
            } catch {
              // Silently ignore
            }
            activeRootsRef.current.delete(id);
          }
          const meta = reactNodeMetaRef.current.get(id);
          if (meta) {
            deletedReactNodesRef.current.set(id, meta);
            reactNodeMetaRef.current.delete(id);
          }
        },
        onNodeCloned: (originalId, cloneId) => {
          const meta = reactNodeMetaRef.current.get(originalId);
          if (meta) {
            const container = ws.getContentRoot(cloneId);
            if (container) {
              const root = createRoot(container);
              root.render(<meta.component {...meta.props} />);
              activeRootsRef.current.set(cloneId, root);
              const clonedMeta: ReactNodeDescriptor = {
                id: cloneId,
                component: meta.component,
                props: { ...meta.props },
                currentRect: ws.getNodeTree().get(cloneId)?.currentRect ?? meta.currentRect,
                parentId: ws.getNodeTree().get(cloneId)?.parentId ?? null,
              };
              reactNodeMetaRef.current.set(cloneId, clonedMeta);
            }
          }
        },
      },
      configRef.current,
    );

    setWorkspace(ws);

    return () => {
      // Unmount all React roots before disposing workspace
      for (const root of activeRootsRef.current.values()) {
        try {
          root.unmount();
        } catch {
          // Silently handle unmount errors during teardown
        }
      }
      activeRootsRef.current.clear();
      reactNodeMetaRef.current.clear();

      ws.dispose();
      setWorkspace(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  // ── React Node Lifecycle Methods ────────────────────

  const addReactNode = useCallback(
    (descriptor: ReactNodeDescriptor) => {
      if (!workspace) {
        console.warn(
          "[@canvus/react] addReactNode called before workspace is ready.",
        );
        return;
      }

      const { id, component: Component, props, currentRect, parentId } =
        descriptor;

      // 1. Create an empty shell in the core workspace
      workspace.addNode(
        { id, rawMarkup: '<div data-canvus-react="true"></div>', currentRect },
        parentId ?? null,
      );

      // 2. Get the content root (the inner <div>)
      const container = workspace.getContentRoot(id);
      if (!container) {
        console.warn(
          `[@canvus/react] Could not find content root for node "${id}".`,
        );
        return;
      }

      // 3. Mount React component into the container
      const root = createRoot(container);
      root.render(<Component {...props} />);

      // 4. Track for updates and cleanup
      activeRootsRef.current.set(id, root);
      reactNodeMetaRef.current.set(id, descriptor);
    },
    [workspace],
  );

  const updateReactNode = useCallback(
    (id: string, props: Record<string, any>) => {
      const root = activeRootsRef.current.get(id);
      const meta = reactNodeMetaRef.current.get(id);

      if (!root || !meta) {
        console.warn(
          `[@canvus/react] Cannot update node "${id}" — not a React-managed node.`,
        );
        return;
      }

      // Update stored props
      const updatedMeta: ReactNodeDescriptor = {
        ...meta,
        props: { ...meta.props, ...props },
      };
      reactNodeMetaRef.current.set(id, updatedMeta);

      // Re-render with merged props
      const Component = updatedMeta.component;
      root.render(<Component {...updatedMeta.props} />);
    },
    [],
  );

  const removeReactNode = useCallback(
    (id: string) => {
      const meta = reactNodeMetaRef.current.get(id);
      if (meta) {
        deletedReactNodesRef.current.set(id, meta);
      }
      // Unmount the React root first
      const root = activeRootsRef.current.get(id);
      if (root) {
        root.unmount();
        activeRootsRef.current.delete(id);
      }
      reactNodeMetaRef.current.delete(id);

      // Then remove from the core workspace
      workspace?.removeNode(id);
    },
    [workspace],
  );

  const addNode = useCallback(
    (...args: Parameters<Workspace["addNode"]>): Rect => {
      if (!workspace) {
        throw new Error(
          "[@canvus/react] addNode called before workspace is ready.",
        );
      }
      return workspace.addNode(...args);
    },
    [workspace],
  );

  // ── Context Value ───────────────────────────────────

  const contextValue = useMemo<CanvusContextValue>(
    () => ({
      workspace,
      addReactNode,
      updateReactNode,
      removeReactNode,
      addNode,
    }),
    [workspace, addReactNode, updateReactNode, removeReactNode, addNode],
  );

  return (
    <CanvusContext.Provider value={contextValue}>
      {children}
    </CanvusContext.Provider>
  );
}
