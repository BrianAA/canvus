// ─────────────────────────────────────────────────────────────
// @canvus/react — <Canvus /> Component
//
// The primary mount point for a Canvus workspace in React.
// Renders a container div, initializes the Workspace via
// CanvusProvider, and exposes the workspace through context.
//
// Usage:
//   import { Canvus, useCanvus } from "@canvus/react";
//
//   function App() {
//     return (
//       <Canvus
//         config={{ snapThreshold: 8 }}
//         onSelectionChange={(ids) => console.log(ids)}
//         style={{ width: "100%", height: "100vh" }}
//       >
//         <ToolPanel />
//       </Canvus>
//     );
//   }
//
//   function ToolPanel() {
//     const { addReactNode } = useCanvus();
//     // ...
//   }
// ─────────────────────────────────────────────────────────────

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from "react";
import { CanvusProvider } from "./context.js";
import { useCanvus } from "./useCanvus.js";
import type { CanvusProps, CanvusContextValue } from "./types.js";

// ── Handle Type ─────────────────────────────────────────────

/**
 * Imperative handle exposed via `ref` on the `<Canvus />` component.
 * Provides direct access to the workspace and React node methods.
 */
export type CanvusHandle = CanvusContextValue;

// ── Internal Bridge ─────────────────────────────────────────

/**
 * Bridge component that exposes the context value via
 * `useImperativeHandle` to the parent's forwarded ref.
 */
function CanvusBridge({
  forwardedRef,
  children,
}: {
  forwardedRef: React.Ref<CanvusHandle>;
  children?: ReactNode;
}) {
  const ctx = useCanvus();

  useImperativeHandle(forwardedRef, () => ctx, [ctx]);

  return <>{children}</>;
}

// ── Canvus Component ────────────────────────────────────────

/**
 * The primary Canvus workspace component for React applications.
 *
 * Renders a container `<div>`, initializes the core `Workspace`
 * engine on mount, and provides React node management methods
 * via the `useCanvus()` hook.
 *
 * Children rendered inside `<Canvus>` can access the workspace
 * and React node APIs via `useCanvus()`.
 *
 * @example
 * ```tsx
 * <Canvus
 *   config={{ snapThreshold: 8 }}
 *   onSelectionChange={(ids) => setSelected(ids)}
 *   onReactNodeCommit={(id, snapshot) => save(id, snapshot)}
 *   style={{ width: "100%", height: "100vh" }}
 * >
 *   <Toolbar />
 * </Canvus>
 * ```
 *
 * @example Imperative access via ref:
 * ```tsx
 * const canvusRef = useRef<CanvusHandle>(null);
 *
 * <Canvus ref={canvusRef}>
 *   <button onClick={() => {
 *     canvusRef.current?.addReactNode({ ... });
 *   }}>
 *     Add Node
 *   </button>
 * </Canvus>
 * ```
 */
export const Canvus = forwardRef<CanvusHandle, CanvusProps & { children?: ReactNode }>(
  function Canvus(
    {
      config,
      style,
      className,
      children,
      // Callbacks
      onHTMLCommit,
      onReactNodeCommit,
      onSelectionChange,
      onViewportChange,
      onOperationsGenerated,
      onNodeRectChange,
      onInteractionChange,
      onBreadcrumbChange,
      onTextEditRequest,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          position: "relative",
          overflow: "hidden",
          width: "100%",
          height: "100%",
          ...style,
        }}
      >
        <CanvusProvider
          containerRef={containerRef}
          config={config}
          onHTMLCommit={onHTMLCommit}
          onReactNodeCommit={onReactNodeCommit}
          onSelectionChange={onSelectionChange}
          onViewportChange={onViewportChange}
          onOperationsGenerated={onOperationsGenerated}
          onNodeRectChange={onNodeRectChange}
          onInteractionChange={onInteractionChange}
          onBreadcrumbChange={onBreadcrumbChange}
          onTextEditRequest={onTextEditRequest}
        >
          <CanvusBridge forwardedRef={ref}>
            {children}
          </CanvusBridge>
        </CanvusProvider>
      </div>
    );
  },
);
