// ─────────────────────────────────────────────────────────────
// @canvus/react — Public API Barrel Export
// ─────────────────────────────────────────────────────────────

// ── Components ──────────────────────────────────────────────

export { Canvus } from "./Canvus.js";
export type { CanvusHandle } from "./Canvus.js";

// ── Hooks ───────────────────────────────────────────────────

export { useCanvus } from "./useCanvus.js";

// ── Context (for advanced usage) ────────────────────────────

export { CanvusProvider, CanvusContext } from "./context.js";

// ── Types ───────────────────────────────────────────────────

export type {
  CanvusProps,
  CanvusContextValue,
  ReactNodeDescriptor,
  ReactNodeSnapshot,
} from "./types.js";
