# Canvus SDK

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
Clone the repository and install the development dependencies:
```bash
git clone https://github.com/balfaro01/canvus.git
cd canvus
npm install
```

### 2. Build the SDK
Compile the TypeScript source files in `src/` to the compiled ESM distribution bundle in `dist/`:
```bash
npm run build
```

### 3. Launch the Workbench Demo
Launch a local development server on `http://localhost:3000` to interact with selection overlays, resizing reflow, and operations streams:
```bash
npm run demo
```

---

## 📚 Developer Guides

To understand how to integrate, configure, and extend the Canvus SDK, explore the following documentation:

1.  **[Architecture & Reflow Loop Guide](file:///Users/balfaro01/Documents/GitHub/canvus/docs/architecture.md)**: Twin-layer mounting, ResizeObserver integration, and the Synchronous Reflow Loop.
2.  **[Operation Payloads & Undo/Redo](file:///Users/balfaro01/Documents/GitHub/canvus/docs/operations.md)**: Schema design for style, class, hierarchy, and text changes.
3.  **[Custom Editor Integration](file:///Users/balfaro01/Documents/GitHub/canvus/docs/custom-editor-integration.md)**: Mounting TipTap/Quill rich-text editors.
4.  **[Layout & Insertion System](file:///Users/balfaro01/Documents/GitHub/canvus/docs/layout-system.md)**: Deep-dives into Flex/Grid detection, tree hierarchy rules, and drag drop zones.
5.  **[Complete API Reference](file:///Users/balfaro01/Documents/GitHub/canvus/docs/api.md)**: Full catalog of `Workspace` configuration, callback hooks, and API methods.
