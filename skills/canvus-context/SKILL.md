---
name: canvus-context
description: "Read this skill first before any Canvus SDK work. It points to the compressed AI context file that contains the entire project knowledge base in a single document — architecture, API surface, types, module roles, and docs map."
---

# Canvus SDK Quick Context Loader

**Always read this skill before starting any Canvus SDK work.** It saves tokens by eliminating exploratory file searches.

## Step 1: Load the AI Context File

Read [`AI_CONTEXT.md`](file:///Users/balfaro01/Documents/GitHub/canvus/AI_CONTEXT.md) in the project root.

This single file (~18KB, ~550 lines) contains:

- **Architecture overview** — Twin-Layer diagram, reflow loop
- **All 57 public exports** — with full TypeScript signatures
- **All 11 core type definitions** — with JSDoc comments  
- **Module roles table** — what each `src/*.ts` file does
- **Workspace methods table** — every public method
- **Workspace callbacks table** — every event hook
- **Operation schemas** — undo/redo payload formats
- **Developer rules** — 6 invariants to never violate
- **Documentation site map** — all 33 pages with routes and titles
- **Recent changelog** — what's been added/changed/fixed

## Step 2: If You Need More Detail

After reading `AI_CONTEXT.md`, only dig into specific files when you need implementation-level detail:

| Need | Read |
|------|------|
| Full API reference | `docs-site/pages/sdk/workspace-api.mdx` |
| Architecture deep-dive | `docs-site/pages/overview/architecture.mdx` |
| Type definitions | `src/types.ts` |
| Interaction behaviors | `src/workspace.ts` |
| Shadow DOM internals | `src/shadow-mount.ts` |
| Canvas drawing | `src/renderer.ts` |
| Doc coverage status | `skills/docs-updater/resources/coverage-manifest.md` |

## Step 3: Keep Context Fresh

After making changes, regenerate the context file:

```bash
npm run ai:context
```

This crawls `src/index.ts`, `src/types.ts`, `docs-site/pages/`, and `CHANGELOG.md` to produce a fresh `AI_CONTEXT.md`.

## When to Use This Skill

- **Every new conversation** about the Canvus SDK
- **Before writing any code** — verify you understand the architecture
- **Before searching files** — check if the answer is already in AI_CONTEXT.md
