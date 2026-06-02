# Canvus SDK

[![npm version](https://img.shields.io/npm/v/@canvus/core.svg)](https://www.npmjs.com/package/@canvus/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Canvus is a headless, framework-agnostic vanilla TypeScript SDK for building visual layout editing workspaces. By separating rendering and visual handles, it enables developers to construct CMS page-builder canvases, A/B testing editors, and high-performance visual IDE tools with web-native performance.

---

## 🚀 Key Features

*   **Twin-Layer Architecture**: Renders user-supplied HTML/CSS inside an isolated Shadow DOM projection layer, keeping parent editor styles untouched. An HTML5 Canvas overlay runs overlays, coordinates selections, snap lines, and resizing handles.
*   **Zero Framework Dependencies**: Pure TypeScript, compiling to a lightweight ESM bundle.
*   **Operation-Driven State Synchronization**: Exposes discrete mutations (`Operation` delta payloads) for visual gestures, allowing host applications to manage a unified history stack (Undo/Redo) and multiplayer collaboration.
*   **Pluggable Rich Text Escape Hatch**: Features a built-in plain-text editor, with a callback trigger to mount custom rich-text editors (e.g., TipTap or Quill).
*   **Native Class Manipulation**: Supports modifying Tailwind CSS or Bootstrap style classes directly on nodes without relying on inline CSS styling attribute overwrites.
*   **requestAnimationFrame Throttled Rendering**: Canvas repaints are scheduled for the next animation frame, avoiding performance bottlenecks on high-refresh-rate screens.

---

## 📦 Directory Tour

```
canvus/
├── demo/                   # Dev Workbench (Interactive local testing site)
├── dist/                   # Compiled SDK ESM build and type declarations
├── docs/                   # Developer documentation & Architecture Decision Records (ADRs)
├── src/                    # SDK Core source code (TypeScript)
├── skills/                 # Custom Agent/AI skills for codebase tasks
└── package.json            # Scripts, build rules, and dependencies
```

For a detailed walkthrough of each source file and their individual roles, see the [Architecture Guide](file:///Users/balfaro01/Documents/GitHub/canvus/docs/architecture.md).

---

## 🛠️ Quick Start

### 1. Installation
Install via npm:
```bash
npm install @canvus/core
```

### 2. Basic Usage
Import and initialize a workspace in your project:
```ts
import { Workspace } from "@canvus/core";

const workspace = new Workspace(container, {
  html: '<div class="my-layout">Hello Canvus</div>',
  onChange(ops) {
    console.log("Operations:", ops);
  },
});
```

The SDK exports all core primitives — see the [API Reference](docs/api.md) for the full surface.

### 3. Development (Contributing)
To work on the SDK itself, clone the repo and use the local dev scripts:
```bash
git clone https://github.com/balfaro01/canvus.git
cd canvus
npm install
npm run build      # Compile TypeScript → dist/
npm run demo       # Launch workbench at http://localhost:3000
```

---

## 📚 Developer Guides

To understand how to integrate, configure, and extend the Canvus SDK, explore the following documentation:

1.  **[Architecture & Reflow Loop Guide](file:///Users/balfaro01/Documents/GitHub/canvus/docs/architecture.md)**: Twin-layer mounting, ResizeObserver integration, and the Synchronous Reflow Loop.
2.  **[Operation Payloads & Undo/Redo](file:///Users/balfaro01/Documents/GitHub/canvus/docs/operations.md)**: Schema design for style, class, hierarchy, and text changes.
3.  **[Custom Editor Integration](file:///Users/balfaro01/Documents/GitHub/canvus/docs/custom-editor-integration.md)**: Mounting TipTap/Quill rich-text editors.
4.  **[Layout & Insertion System](file:///Users/balfaro01/Documents/GitHub/canvus/docs/layout-system.md)**: Deep-dives into Flex/Grid detection, tree hierarchy rules, and drag drop zones.
5.  **[Complete API Reference](file:///Users/balfaro01/Documents/GitHub/canvus/docs/api.md)**: Full catalog of `Workspace` configuration, callback hooks, and API methods.
