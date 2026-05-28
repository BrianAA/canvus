#!/usr/bin/env node
/**
 * generate-ai-context.js
 *
 * Crawls the SDK source and documentation to produce a single compressed
 * AI context file (AI_CONTEXT.md) that any language model can read in
 * one shot to understand the entire Canvus SDK without searching.
 *
 * Usage: node scripts/generate-ai-context.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const DOCS_SITE = path.join(ROOT, "docs-site", "pages");
const OUT = path.join(ROOT, "AI_CONTEXT.md");

// ── Helpers ──────────────────────────────────────────────────

function read(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/** Extract all public exports from src/index.ts as a structured list. */
function extractExports(indexSrc) {
  const exports = [];
  const typeRe = /export\s+type\s*\{([^}]+)\}\s*from\s*["']\.\/([^"']+)["']/g;
  const valueRe = /export\s*\{([^}]+)\}\s*from\s*["']\.\/([^"']+)["']/g;

  for (const m of indexSrc.matchAll(typeRe)) {
    const names = m[1].split(",").map((n) => n.trim()).filter(Boolean);
    names.forEach((n) => exports.push({ name: n, kind: "type", module: m[2].replace(".js", ".ts") }));
  }
  for (const m of indexSrc.matchAll(valueRe)) {
    const names = m[1].split(",").map((n) => n.trim()).filter(Boolean);
    names.forEach((n) => exports.push({ name: n, kind: "value", module: m[2].replace(".js", ".ts") }));
  }
  return exports;
}

/** Extract TypeScript interface/type definitions with JSDoc comments. */
function extractTypeDefinitions(source) {
  const defs = [];
  const lines = source.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Match interface or type declarations
    if (/^\s*export\s+(interface|type)\s+(\w+)/.test(line)) {
      const match = line.match(/export\s+(interface|type)\s+(\w+)/);
      const kind = match[1];
      const name = match[2];

      // Collect JSDoc comment above
      let doc = "";
      let j = i - 1;
      while (j >= 0 && (lines[j].trim().startsWith("*") || lines[j].trim().startsWith("/**") || lines[j].trim().startsWith("//"))) {
        doc = lines[j].trim() + "\n" + doc;
        j--;
      }

      // Collect the body
      if (kind === "interface") {
        let body = line + "\n";
        let braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        i++;
        while (i < lines.length && braceCount > 0) {
          body += lines[i] + "\n";
          braceCount += (lines[i].match(/{/g) || []).length;
          braceCount -= (lines[i].match(/}/g) || []).length;
          i++;
        }
        defs.push({ name, kind, doc: doc.trim(), body: body.trim() });
      } else {
        // type alias - single or multi-line
        let body = line;
        if (!line.includes(";")) {
          i++;
          while (i < lines.length && !lines[i].includes(";")) {
            body += "\n" + lines[i];
            i++;
          }
          if (i < lines.length) body += "\n" + lines[i];
        }
        defs.push({ name, kind: "type", doc: doc.trim(), body: body.trim() });
        i++;
      }
    } else {
      i++;
    }
  }
  return defs;
}

/** Extract function signatures from source. */
function extractFunctions(source) {
  const fns = [];
  const re = /export\s+function\s+(\w+)\s*(\([^)]*\))\s*:\s*([^{;]+)/g;
  for (const m of source.matchAll(re)) {
    fns.push({ name: m[1], signature: `${m[1]}${m[2]}: ${m[3].trim()}` });
  }
  return fns;
}

/** Recursively collect all .mdx page paths. */
function collectPages(dir, base = "") {
  const pages = [];
  if (!fs.existsSync(dir)) return pages;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      pages.push(...collectPages(path.join(dir, entry.name), base + "/" + entry.name));
    } else if (entry.name.endsWith(".mdx")) {
      const route = base + "/" + entry.name.replace(/\.mdx$/, "").replace(/\/index$/, "");
      const title = extractTitle(path.join(dir, entry.name));
      pages.push({ route: route.replace(/\/index$/, ""), title, file: entry.name });
    }
  }
  return pages;
}

/** Extract the first H1 heading from an MDX file. */
function extractTitle(filePath) {
  const content = read(filePath);
  if (!content) return "Untitled";
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : "Untitled";
}

/** Read the changelog. */
function getChangelog() {
  const content = read(path.join(ROOT, "CHANGELOG.md"));
  if (!content) return "No changelog found.";
  // Return just the Unreleased section + latest version
  const sections = content.split(/^## /m);
  const relevant = sections.slice(0, 3).join("## ");
  return relevant.trim();
}

// ── Main Generation ──────────────────────────────────────────

function generate() {
  const indexSrc = read(path.join(SRC, "index.ts"));
  const typesSrc = read(path.join(SRC, "types.ts"));

  const exports = indexSrc ? extractExports(indexSrc) : [];
  const typeDefs = typesSrc ? extractTypeDefinitions(typesSrc) : [];
  const pages = collectPages(DOCS_SITE);
  const changelog = getChangelog();

  // Group exports by module
  const byModule = {};
  for (const exp of exports) {
    if (!byModule[exp.module]) byModule[exp.module] = [];
    byModule[exp.module].push(exp);
  }

  // Extract function signatures from each module
  const moduleFns = {};
  for (const mod of Object.keys(byModule)) {
    const src = read(path.join(SRC, mod));
    if (src) moduleFns[mod] = extractFunctions(src);
  }

  const timestamp = new Date().toISOString().split("T")[0];

  let out = `# Canvus SDK — AI Context
<!-- Auto-generated by scripts/generate-ai-context.js on ${timestamp} -->
<!-- Regenerate: npm run ai:context -->

> **Read this file first.** It contains a compressed overview of the entire Canvus SDK —
> architecture, public API surface, type definitions, module roles, and documentation map.
> This eliminates the need to search through 33+ documentation pages.

---

## What Is Canvus?

Canvus is a **headless, framework-agnostic vanilla TypeScript SDK** for building visual
layout editing workspaces (page builders, A/B testing editors, visual IDEs).

**Key design decisions:**
- **Twin-Layer Architecture**: Shadow DOM (content) + Canvas 2D (interaction overlays)
- **Zero dependencies**: Pure TypeScript, ESM output, no framework lock-in
- **Browser-native layout**: Delegates CSS reflow to the browser (Flexbox, Grid, text wrap)
- **Operation-driven sync**: Emits discrete Operation payloads for host-managed undo/redo
- **Flat String Bridge**: Exports clean HTML with all SDK wrappers stripped

---

## SDK Boundary

The Canvus SDK enforces a strict **dumb canvas** architecture.

*   **SDK Responsibility**: Isolates and mounts HTML nodes in a Shadow DOM, measures layout bounds, draws selection outlines, snap guides, and layout/script badges on a 2D canvas, handles visual interactions (dragging, resizing, panning, zooming), and exports clean HTML.
*   **Host Responsibility**: Parses raw HTML templates to nodes, preprocesses/compiles CSS styles (Sass, Tailwind, etc.), executes and sandboxes custom/guest scripts, manages file storage, AST databases, and the global transaction undo/redo history.

---

## Architecture Overview

\`\`\`
┌─────────────────────────────────────────────┐
│           Viewport Surface Layer            │  ← Canvas 2D overlay
│  selections, handles, guides, badges        │     (renderer.ts)
├─────────────────────────────────────────────┤
│         Projection Mutation Layer           │  ← Shadow DOM
│  user HTML/CSS, browser-native reflow       │     (shadow-mount.ts)
├─────────────────────────────────────────────┤
│            Workspace Orchestrator           │  ← Event binding, state machine
│  pointer, key, wheel handlers              │     (workspace.ts)
├──────────────┬──────────────┬───────────────┤
│   NodeTree   │    Layout    │   DropZone    │
│   tree.ts    │  layout.ts   │  drop-zone.ts │
├──────────────┴──────────────┴───────────────┤
│ types.ts (data models) │ matrix.ts (math)   │
└─────────────────────────────────────────────┘
\`\`\`

**Reflow Loop**: Pointer drag → Style Surgery → Browser Reflow → ResizeObserver → Cache Update → rAF Canvas Redraw

---

## Module Roles

| Module | File | Responsibility |
|--------|------|----------------|
| **Types** | \`types.ts\` | Vec2, Rect, ViewportMatrix, WebHTMLNode, Operation, enums |
| **Matrix** | \`matrix.ts\` | screenToCanvas, canvasToScreen, zoom anchoring, hit testing |
| **ShadowMount** | \`shadow-mount.ts\` | Shadow DOM lifecycle, style injection, extractHTML (Flat String Bridge) |
| **NodeTree** | \`tree.ts\` | In-memory hierarchy, parent/child tracking, cycle detection |
| **Layout** | \`layout.ts\` | CSS display detection, flex/grid analysis, child slot measurement |
| **Renderer** | \`renderer.ts\` | Canvas 2D overlay: selections, handles, guides, badges, spacing adjusters |
| **DropZone** | \`drop-zone.ts\` | Drag-and-drop placement: flex/grid/block-aware insertion calculation |
| **Workspace** | \`workspace.ts\` | Central orchestrator: events, state machine, public API |
| **Index** | \`index.ts\` | Public API barrel exports |

---

## Public API Surface (${exports.length} exports)

`;

  for (const [mod, exps] of Object.entries(byModule)) {
    out += `### \`${mod}\`\n\n`;
    const fns = moduleFns[mod] || [];
    for (const exp of exps) {
      const fn = fns.find((f) => f.name === exp.name);
      if (fn) {
        out += `- \`${fn.signature}\`\n`;
      } else {
        out += `- \`${exp.name}\` (${exp.kind})\n`;
      }
    }
    out += "\n";
  }

  out += `---

## Core Type Definitions

\`\`\`typescript
`;

  for (const def of typeDefs) {
    out += def.body + "\n\n";
  }

  out += `\`\`\`

---

## Operation Types (Undo/Redo Payloads)

| Type | Trigger | Payload | UndoPayload |
|------|---------|---------|-------------|
| \`update-style\` | Resize, spacing drag | \`{ [prop]: value }\` | \`{ [prop]: oldValue }\` |
| \`update-classes\` | addClass/removeClass | \`{ add: [], remove: [] }\` | \`{ add: [], remove: [] }\` |
| \`reparent\` | Drag into new parent | \`{ newParentId, index }\` | \`{ newParentId: old, index: old }\` |
| \`reorder\` | Drag reorder siblings | \`{ index }\` | \`{ index: old }\` |
| \`update-text\` | Inline text edit | \`{ path, html }\` | \`{ path, html: old }\` |

---

## Key Workspace Methods

| Method | Description |
|--------|-------------|
| \`addNode(node, parentId?, index?)\` | Mount HTML node into Shadow DOM |
| \`removeNode(id)\` | Remove node and descendants |
| \`updateMarkup(id, markup)\` | Replace node's inner HTML |
| \`setNodeStyle(id, prop, value)\` | Mutate a CSS property |
| \`setNodeStyles(id, styles)\` | Batch CSS property changes |
| \`addClass(id, className)\` | Add CSS class |
| \`removeClass(id, className)\` | Remove CSS class |
| \`toggleClass(id, className)\` | Toggle CSS class |
| \`reparentNode(nodeId, newParentId, index?)\` | Move node to new parent |
| \`reorderChild(nodeId, newIndex)\` | Reorder within parent |
| \`applyOperation(op)\` | Replay serialized operation (undo/redo) |
| \`selectNode(id)\` | Set selection |
| \`deselectAll()\` | Clear selection |
| \`extractHTML(id)\` | Flat String Bridge: clean HTML export |
| \`injectCSS(css)\` | Inject style string with minimal :root/:html/:body rewrites to :host |
| \`injectCSSLink(href)\` | Inject external stylesheet link element |
| \`markNodeHasJS(nodeId)\` | Explicitly flag a node as containing/using JavaScript |
| \`unmarkNodeHasJS(nodeId)\` | Remove the JavaScript flag from a node |
| \`hasJSMark(nodeId)\` | Check if a node is flagged as containing JavaScript |
| \`dispose()\` | Cleanup event listeners |

---

## Workspace Callbacks

| Callback | When It Fires |
|----------|--------------|
| \`onHTMLCommit(id, html)\` | Clean HTML after visual gesture completes |
| \`onNodeRectChange(id, rect)\` | Node bounds change from reflow/drag |
| \`onViewportChange(vp)\` | Zoom or pan changes |
| \`onSelectionChange(selectedIds)\` | Selection updates |
| \`onBreadcrumbChange(path)\` | Selection depth breadcrumbs |
| \`onInteractionChange(mode)\` | Drag state changes (pan, resize, etc.) |
| \`onOperationsGenerated(ops)\` | Undoable operations produced |
| \`onTextEditRequest(nodeId, el, commit)\` | Custom editor escape hatch |

---

## Coordinate Spaces

| Space | Units | Used In |
|-------|-------|---------|
| **Screen** | \`clientX\`/\`clientY\` DOM pixels | Raw pointer events |
| **Canvas** | Scaled/translated world units | NodeTree rects, snapping, drawing |

Convert with: \`screenToCanvas(pt, vp)\` / \`canvasToScreen(pt, vp)\`

---

## Developer Rules

1. **Zero dependencies** — Pure vanilla TypeScript only
2. **Never mix coordinate spaces** — Always use matrix.ts converters
3. **Never mutate tree directly** — Use Workspace mutation APIs
4. **Flat String Bridge invariant** — extractHTML must return clean HTML (no SDK wrappers)
5. **rAF-throttled rendering** — Never draw canvas synchronously in hot loops
6. **suppressObserver** — Use when batch-updating DOM to prevent feedback loops

---

## Documentation Site Map

`;

  // Group pages by section
  const sections = {};
  for (const page of pages) {
    const section = page.route.split("/").filter(Boolean)[0] || "root";
    if (!sections[section]) sections[section] = [];
    sections[section].push(page);
  }

  for (const [section, sPages] of Object.entries(sections)) {
    out += `### ${section}\n`;
    for (const p of sPages) {
      out += `- \`${p.route || "/"}\` — ${p.title}\n`;
    }
    out += "\n";
  }

  out += `---

## Recent Changes

${changelog}

---

## File Locations

| What | Path |
|------|------|
| SDK Source | \`src/\` |
| Public API | \`src/index.ts\` |
| Type Definitions | \`src/types.ts\` |
| Demo Workbench | \`demo/index.html\` |
| Docs Site | \`docs-site/pages/\` |
| Changelog | \`CHANGELOG.md\` |
| Coverage Manifest | \`skills/docs-updater/resources/coverage-manifest.md\` |
| AI Context (this file) | \`AI_CONTEXT.md\` |
`;

  fs.writeFileSync(OUT, out, "utf8");
  const lineCount = out.split("\n").length;
  const byteSize = Buffer.byteLength(out, "utf8");
  console.log(`✅ Generated AI_CONTEXT.md (${lineCount} lines, ${(byteSize / 1024).toFixed(1)} KB)`);
  console.log(`   ${exports.length} exports, ${typeDefs.length} type definitions, ${pages.length} doc pages`);
}

generate();
