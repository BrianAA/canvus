// ─────────────────────────────────────────────────────────────
// @canvus/react — useCanvus() Hook
//
// Provides access to the Canvus workspace and React node
// management methods from any component rendered inside
// a <Canvus /> component.
// ─────────────────────────────────────────────────────────────

import { useContext } from "react";
import { CanvusContext } from "./context.js";
import type { CanvusContextValue } from "./types.js";

/**
 * Hook to access the Canvus workspace and React node APIs.
 *
 * Must be called from a component rendered inside a `<Canvus />`
 * component tree.
 *
 * @returns The workspace instance and React node lifecycle methods.
 *
 * @example
 * ```tsx
 * function Toolbar() {
 *   const { workspace, addReactNode, updateReactNode, removeReactNode } = useCanvus();
 *
 *   const handleAddCard = () => {
 *     addReactNode({
 *       id: `card-${Date.now()}`,
 *       component: DashboardCard,
 *       props: { title: "New Card" },
 *       currentRect: { x: 100, y: 100, width: 300, height: 200 },
 *     });
 *   };
 *
 *   return <button onClick={handleAddCard}>Add Card</button>;
 * }
 * ```
 *
 * @throws Error if called outside of a `<Canvus />` component tree.
 */
export function useCanvus(): CanvusContextValue {
  const context = useContext(CanvusContext);

  if (context === null) {
    throw new Error(
      "useCanvus() must be used within a <Canvus /> component. " +
        "Wrap your component tree with <Canvus /> to provide the workspace context.",
    );
  }

  return context;
}
