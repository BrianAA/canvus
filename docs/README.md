# Canvus Documentation Hub

This directory contains technical guides, reference material, and Architectural Decision Records (ADRs) for developers working on the Canvus SDK.

---

## 📖 Developer Guides

*   **[Architecture & Reflow Loop](file:///Users/balfaro01/Documents/GitHub/canvus/docs/architecture.md)**: Conceptual overview of the Twin-Layer architecture (Shadow DOM projection layer vs. Canvas overlay layer) and the step-by-step rendering loop.
*   **[Operation-Driven State Synchronization (Undo/Redo)](file:///Users/balfaro01/Documents/GitHub/canvus/docs/operations.md)**: Operation schemas, serialization format, and details about the `applyOperation` replay APIs.
*   **[Custom Rich-Text Editor Mount Guide](file:///Users/balfaro01/Documents/GitHub/canvus/docs/custom-editor-integration.md)**: Integrating external editors (e.g. TipTap or Quill) through the custom inline editor callback escape hatch.
*   **[CSS Layout Introspection & Placement System](file:///Users/balfaro01/Documents/GitHub/canvus/docs/layout-system.md)**: Details on the hierarchical tree structures, Flexbox/Grid track detection, drop zone target detection, and coordinate translation.
*   **[API Reference Catalog](file:///Users/balfaro01/Documents/GitHub/canvus/docs/api.md)**: Complete list of class properties, configurations, event callbacks, and TypeScript types.

---

## 🏛️ Architectural Decision Records (ADR)

Our design system is guided by the following core Architectural Decision Records:

1.  **[ADR-0001: Operation-Driven State Synchronization](file:///Users/balfaro01/Documents/GitHub/canvus/docs/adr/0001-operation-driven-state-sync.md)**: Rationale behind host-managed transaction queues over internal SDK undo/redo states.
2.  **[ADR-0002: Pluggable Inline Text Editing](file:///Users/balfaro01/Documents/GitHub/canvus/docs/adr/0002-pluggable-inline-text-editing.md)**: Restricting default edits to plain-text and providing rich-text escape hatches.
3.  **[ADR-0003: Native Class Name Manipulation](file:///Users/balfaro01/Documents/GitHub/canvus/docs/adr/0003-class-manipulation-support.md)**: Native class manipulation APIs to avoid inline style clutter in utility-class environments.
4.  **[ADR-0004: Granular Mutation Sync Boundary](file:///Users/balfaro01/Documents/GitHub/canvus/docs/adr/0004-granular-mutation-sync-boundary.md)**: Eliminating virtual DOM reconciliation overhead in favor of explicit mutation API calls.
5.  **[ADR-0005: Stylesheet Injection and Script Execution](file:///Users/balfaro01/Documents/GitHub/canvus/docs/adr/0005-stylesheet-javascript-execution.md)**: Isolate user CSS inside the Shadow Root and disable default script execution.
