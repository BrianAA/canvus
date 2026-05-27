---
name: docs-updater
description: "Keeps the Canvus docs site (docs-site/) synchronized with SDK source code changes. Use this skill after any code change to update documentation pages, track coverage, and maintain the changelog."
---

# Documentation Site Maintenance & Synchronization

This skill ensures the Nextra documentation site at `docs-site/` stays in sync with the SDK source code in `src/`. It tracks documentation coverage, enforces update rules, and maintains a changelog.

## Use this skill when

- Adding, modifying, or removing **public exports** in `src/index.ts`
- Changing **type definitions**, interfaces, or enums in `src/types.ts`
- Modifying **interaction behaviors** (gestures, resize, drag, selection)
- Adding new **operation types** or modifying payload schemas
- Creating new **modules or features** in `src/`
- Updating **demo capabilities** in `demo/`
- After any PR or significant code change session

## Do not use this skill when

- Making internal refactors that don't alter the public API surface
- Fixing CSS in the demo page
- Updating build tooling or CI configuration

---

## Step 1: Check the Coverage Manifest

Read the coverage manifest at [`skills/docs-updater/resources/coverage-manifest.md`](file:///Users/balfaro01/Documents/GitHub/canvus/skills/docs-updater/resources/coverage-manifest.md).

This file maps every public export in `src/index.ts` to its documentation page in `docs-site/pages/`. It tracks:

- ✅ **Documented** — Export is covered with description, signature, and example
- ⚠️ **Outdated** — Export exists in docs but may be stale (signature changed, behavior updated)
- ❌ **Missing** — Export has no documentation page coverage

**After any code change**, compare the current `src/index.ts` exports against the manifest. If new exports appear or signatures change, flag them.

---

## Step 2: Update Documentation Pages

### Source → Docs Site Mapping

| Source Module | Docs Page | What to Sync |
|--------------|-----------|-------------|
| `src/types.ts` | `docs-site/pages/sdk/types.mdx` | Interfaces, enums, constants, factory functions |
| `src/matrix.ts` | `docs-site/pages/sdk/matrix.mdx` | Coordinate math, zoom, pan, hit testing |
| `src/shadow-mount.ts` | `docs-site/pages/concepts/shadow-dom.mdx` | Mount lifecycle, style injection, extractHTML |
| `src/tree.ts` | `docs-site/pages/concepts/workspace.mdx` | NodeTree mutations, hierarchy, cycle detection |
| `src/layout.ts` | `docs-site/pages/sdk/layout.mdx` | Display detection, flex/grid analysis, child slots |
| `src/renderer.ts` | `docs-site/pages/sdk/renderer.mdx` | Overlay drawing, guides, badges, spacing adjusters |
| `src/drop-zone.ts` | `docs-site/pages/sdk/drop-zone.mdx` | Drop target calculation, insertion indicators |
| `src/workspace.ts` | `docs-site/pages/sdk/workspace-api.mdx` | All public Workspace methods and callbacks |
| `src/workspace.ts` | `docs-site/pages/sdk/configuration.mdx` | WorkspaceConfig, WorkspaceCallbacks |
| `src/importer.ts` | `docs-site/pages/guides/importing.mdx` | importHTMLDocument, ImportHTMLOptions |

### Sync Rules

1. **New public export** → Add to the appropriate docs page with:
   - TypeScript signature
   - Parameter table
   - Brief description
   - Code example (when useful)
   
2. **Changed signature** → Update the docs page and mark the change in the changelog

3. **New operation type** → Update both:
   - `docs-site/pages/sdk/types.mdx` (OperationType enum)
   - `docs-site/pages/guides/operations.mdx` (payload schema + example)

4. **New interaction behavior** → Update:
   - `docs-site/pages/concepts/canvas-overlay.mdx` (if visual)
   - `docs-site/pages/guides/layout-system.mdx` (if selection/drag)

5. **New ADR** → Create `docs-site/pages/architecture/adr/NNNN-slug.mdx` and add to `docs-site/pages/architecture/adr/_meta.js`

6. **New module** → Add a new page in the appropriate section and update the section's `_meta.js`

---

## Step 3: Update the Changelog

After making documentation or code changes, add an entry to [`CHANGELOG.md`](file:///Users/balfaro01/Documents/GitHub/canvus/CHANGELOG.md) in the project root.

### Changelog Format

```markdown
## [Unreleased]

### Added
- New feature or export

### Changed  
- Modified behavior or API

### Fixed
- Bug fix

### Documented
- New or updated documentation page

### Removed
- Deprecated feature or export
```

### Rules
- Group entries under the current `[Unreleased]` heading
- When releasing, rename `[Unreleased]` to `[vX.Y.Z] - YYYY-MM-DD`
- Always tag documentation updates under `### Documented`
- Reference the specific docs page that was updated

---

## Step 4: Run Validation

```bash
npm run docs:validate
```

This checks:
- All `src/index.ts` exports are referenced in docs
- No broken internal links in markdown files
- ADR index is complete

---

## Step 5: Update the Coverage Manifest

After syncing, update [`skills/docs-updater/resources/coverage-manifest.md`](file:///Users/balfaro01/Documents/GitHub/canvus/skills/docs-updater/resources/coverage-manifest.md) to reflect the current state:

- Mark newly documented exports as ✅
- Flag changed exports that need review as ⚠️
- List any exports still missing coverage as ❌

---

## Step 6: Regenerate AI Context

After updating docs or code, regenerate the compressed AI context file so future AI conversations have fresh data:

```bash
npm run ai:context
```

This produces [`AI_CONTEXT.md`](file:///Users/balfaro01/Documents/GitHub/canvus/AI_CONTEXT.md) — a single ~18KB file that any AI model can read in one shot to understand the entire SDK without searching through 33+ pages.

---

## Quick Checklist

```
□ Read coverage-manifest.md
□ Compare src/index.ts exports against manifest
□ Update relevant docs-site pages
□ Add CHANGELOG.md entry
□ Run npm run docs:validate
□ Update coverage-manifest.md
□ Regenerate AI context (npm run ai:context)
□ Verify docs site renders (npm run docs:dev)
```
