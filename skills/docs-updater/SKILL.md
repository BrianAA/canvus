---
name: docs-updater
description: "You are a documentation maintenance expert for Canvus. Use this skill to keep the system, architectural, and API documentation synchronized with code changes, validating all paths, ADR links, and exports."
---

# Documentation Maintenance and Verification

This skill aligns AI developers and agents with the rules, tasks, and scripts necessary to maintain documentation quality in the Canvus codebase.

## Use this skill when

- Adding, modifying, or removing files in `src/` (especially if public exports in `src/index.ts` are updated).
- Modifying design primitives, operations payloads, or state invariants.
- Adding new Architectural Decision Records (ADRs) to `docs/adr/`.
- Verifying markdown formatting and link integrity before submitting a PR.

## Do not use this skill when

- Making simple bug fixes that do not alter the public API or visual architecture.
- Adjusting CSS styles in the demo page or styling metrics logs.

## Instructions

### 1. Run Verification
Always execute the automated validation script after modifying codebase code or documentation files:
```bash
npm run docs:validate
```
Verify the output finishes with `PASSED successfully`. Fix any broken references or missing API listings.

### 2. Synchronization Rules
*   **API Exports**: If a type, method, function, or class is exported in [`src/index.ts`](file:///Users/balfaro01/Documents/GitHub/canvus/src/index.ts), it **must** be listed with its parameters, defaults, and description in [`docs/api.md`](file:///Users/balfaro01/Documents/GitHub/canvus/docs/api.md).
*   **Visual Interactions**: If you change gesture cycles (e.g., resizing anchors, selection breadcrumbs, mouse button maps), update the sequence descriptions in [`docs/architecture.md`](file:///Users/balfaro01/Documents/GitHub/canvus/docs/architecture.md).
*   **Operation Payloads**: If you add a new `Operation` type or modify existing payloads/undoPayload structures:
    1.  Update the `OperationType` union in [`src/types.ts`](file:///Users/balfaro01/Documents/GitHub/canvus/src/types.ts).
    2.  Update [`docs/operations.md`](file:///Users/balfaro01/Documents/GitHub/canvus/docs/operations.md) with the new payload JSON schema and a code example.
    3.  Update the `applyOperation` handler implementation in [`src/workspace.ts`](file:///Users/balfaro01/Documents/GitHub/canvus/src/workspace.ts).
*   **ADR Indexing**: When writing a new ADR file in `docs/adr/`, list it under the "Architectural Decision Records" section in [`docs/README.md`](file:///Users/balfaro01/Documents/GitHub/canvus/docs/README.md).

## Output Format

- Documentation updates detailing modified sections.
- Output log of `npm run docs:validate` execution.
- Assumptions, unresolved links, or type updates.
