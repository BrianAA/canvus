# @canvus/react

[![npm version](https://img.shields.io/npm/v/@canvus/react.svg)](https://www.npmjs.com/package/@canvus/react)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)

> ⚠️ **Beta Release (v0.1.0)**: `@canvus/react` is currently in active development (public beta). APIs and configuration options may evolve before the v1.0.0 stable release.

React bindings for the [Canvus SDK](https://github.com/balfaro01/canvus) — a headless, framework-agnostic vanilla TypeScript engine for building visual layout editing workspaces (page builders, A/B testing editors, visual IDEs).

---

## 🚀 Key Features

*   **Native React Node Mounting**: Render live, stateful React components inside the isolated canvas Shadow DOM with a simple `addReactNode` API call.
*   **Declarative Prop Updates**: Seamlessly update component props and trigger in-place re-renders using `updateReactNode`, avoiding remounts or visual flickers.
*   **Structured Commits**: Listen to `onReactNodeCommit` to receive structured component states (updated props, dimensions, and canvas coordinates) instead of raw HTML markup.
*   **Coexistence Mode**: Mix and match live React nodes and vanilla HTML nodes on the same visual canvas.
*   **Context-Driven Hooks**: Control the workspace, manage selections, trigger history operations (Undo/Redo), and add/remove components from any child component via the `useCanvus()` hook.

---

## 🛠️ Installation

Install the React bindings alongside the core SDK:

```bash
npm install @canvus/react @canvus/core
```

---

## 💻 Quick Start

### 1. Create the Workspace

Wrap your editor interface with the `<Canvus />` component. This sets up the Shadow DOM, event bindings, and initializes the workspace core engine:

```tsx
import { Canvus } from "@canvus/react";

function Editor() {
  return (
    <Canvus
      config={{ snapThreshold: 8 }}
      style={{ width: "100vw", height: "100vh" }}
      onReactNodeCommit={(id, snapshot) => {
        console.log(`Node "${id}" updated:`, snapshot.props, snapshot.rect);
        // Save the updated layout and props to your database
      }}
    >
      <Toolbar />
    </Canvus>
  );
}
```

### 2. Define Your Canvas Components

Create standard React components to render on the canvas. The wrapper frame handles positioning, margins, and resizing:

```tsx
interface CardProps {
  title: string;
  value: string;
}

function DashboardCard({ title, value }: CardProps) {
  return (
    <div style={{
      padding: 24,
      background: "#1e293b",
      color: "#f8fafc",
      borderRadius: 8,
      height: "100%"
    }}>
      <h3>{title}</h3>
      <p style={{ fontSize: 24, fontWeight: 700 }}>{value}</p>
    </div>
  );
}
```

### 3. Add and Manage Nodes

Use the `useCanvus` hook inside any component nested within `<Canvus />` to interact with the workspace:

```tsx
import { useCanvus } from "@canvus/react";

function Toolbar() {
  const { addReactNode, updateReactNode, removeReactNode } = useCanvus();

  const handleAdd = () => {
    addReactNode({
      id: "revenue-card",
      component: DashboardCard,
      props: { title: "Revenue", value: "$42,000" },
      currentRect: { x: 100, y: 100, width: 300, height: 200 }
    });
  };

  const handleUpdate = () => {
    updateReactNode("revenue-card", { value: "$58,000" });
  };

  return (
    <div style={{ position: "absolute", top: 16, left: 16, zIndex: 100 }}>
      <button onClick={handleAdd}>Add Card</button>
      <button onClick={handleUpdate}>Update Value</button>
      <button onClick={() => removeReactNode("revenue-card")}>Remove</button>
    </div>
  );
}
```

---

## 📖 API Reference

### `<Canvus />`
Mounts a relative-positioned container div and initializes the Canvus workspace.

#### Props
*   `config?: WorkspaceConfig`: Configuration settings for snapping, selection overlays, spacing adjusters, etc.
*   `style?: CSSProperties`: Style object for the wrapper div.
*   `className?: string`: Custom CSS class.
*   `onReactNodeCommit?: (id: string, snapshot: ReactNodeSnapshot) => void`: Triggered when a React-managed node is resized, dragged, or modified.
*   `onSelectionChange?: (selectedIds: ReadonlySet<string>) => void`: Triggered when the selected nodes change.
*   `onViewportChange?: (viewport: ViewportMatrix) => void`: Triggered when panning or zooming occurs.

---

## 📄 License

MIT.
