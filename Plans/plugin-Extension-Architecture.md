### Product Requirement Document (PRD)

#### Document Metadata

- **Status**: Draft
- **Author**: Core Canvas Architect
- **Target Version**: v2.0-Alpha (Pluggable Kernel)

---

### 1. Executive Summary & Product Vision

The current Canvus SDK functions as a high-performance **Visual Layout Surgeon**. It takes absolute ownership of the Shadow DOM, manipulating layout properties and extracting clean semantic HTML strings through the _Flat String Bridge_.

To expand into high-value developer workflows—such as a **Storybook Composer Add-on**—the SDK must evolve from a strict HTML string collector into an **Agnostic Canvas Container Platform**.

This PRD defines the architectural transition to a **Micro-Kernel Strategy**. The core canvas engine will remain completely pure, fast, and framework-agnostic, while yielding DOM-rendering control to a pluggable layer. This unlocks custom rendering capabilities (like React, Vue, or Web Components) without fragmenting the codebase or breaking the existing Electron-based testing framework.

---

### 2. Core Objectives & Constraints

#### 2.1 Non-Negotiable Constraints (The Guardrails)

- **Zero Core Regression**: The existing vanilla HTML visual editing workflows must continue to work seamlessly out-of-the-box using the default configuration.
- **Test Bench Stability**: The Playwright/Electron automated E2E regression test suite must remain green. All existing atomic geometric manipulation rules must hold true.
- **Decoupled Physics**: The math behind camera transformations (pan/zoom), marquee selections, alignment snapping guidelines, and reflow bounds checking must remain 100% pure and untouched.

#### 2.2 Product Goals

- **Pluggable Architecture**: Introduce a standard Extension/Plugin interface that exposes safe lifecycle hooks to third-party developers.
- **Custom Node Renderers**: Enable nodes to register custom rendering logic (e.g., framework lifecycles) rather than forcing static string evaluation via `innerHTML`.
- **@canvus/react Validation**: Verify the soundness of the pluggable architecture by shipping a separate, clean implementation package for React.

---

### 3. Feature & Technical Requirements

#### 3.1 Kernel Evolution: The Hook and Lifecycle System

`ShadowMount` will be abstracted so it no longer assumes all content roots are basic unmanaged HTML markup strings.

- **Custom Node Topology**: Expand `WebHTMLNode` to accept a non-serializable, developer-defined runtime payload or custom component identifier.
- **Renderer Registration**: The SDK will expose a registry mapping a `nodeType` string to a specific `CustomNodeRenderer` lifecycle execution block.

```typescript
export interface CustomNodeRenderer {
  /** Invoked immediately after the SDK mounts the isolated positioning wrapper into the Shadow DOM */
  mount: (container: HTMLElement, initialPayload: any) => void;
  /** Invoked when styles are changed or external applyOperation operations push new data */
  update: (container: HTMLElement, updatedPayload: any) => void;
  /** Invoked when a node is removed via deleteSelectedNode or reparented away */
  unmount: (container: HTMLElement) => void;
}
```

- **Synchronous Pipeline Interceptors**: Expose key hook triggers to the `Workspace` configuration map to support complex visual UI metrics layers:
- `beforeReflow`: Fired right before the browser calculates elements bounds.
- `afterMeasure`: Fired directly after `measureNodeCanvasSpace` updates the layout geometric cache. This allows plugins to render advanced layout context clues (like spacing lines or design system error boxes).
- `onRenderOverlay`: Pass the 2D Canvas context (`CanvasRenderingContext2D`) to plugins during the `OverlayRenderer.render` cycle, allowing developers to paint custom selection frames, cursors, or indicators.

#### 3.2 Test Bench Architecture Preservation

- **Default Fallback**: If a node does not specify a custom `nodeType`, the workspace automatically uses a native `html-string` fallback engine. This fallback executes the exact legacy logic: writing `rawMarkup` into the DOM element.
- **Reflow Synchronization Guarantee**: Frameworks like React update asynchronously by batching DOM modifications. The core loop demands synchronous geometry calculations. The pluggable API must provide a mechanism for custom renderers to tell the canvas: _"I have completed my style mutations synchronously, you may now execute `measureAll()` safely."_

---

### 4. Step-by-Step Implementation Plan

The rollout is broken down into clean phases to ensure continuous integration without breaking the current code bench.

```
+------------------------------------------+
|  Phase 1: Abstract ShadowMount Primitives |
+------------------------------------------+
                     |
                     v
+------------------------------------------+
|    Phase 2: Establish Plugin Registry    |
+------------------------------------------+
                     |
                     v
+------------------------------------------+
|     Phase 3: Verify via Test Bench       |
+------------------------------------------+
                     |
                     v
+------------------------------------------+
|    Phase 4: Implement @canvus/react      |
+------------------------------------------+

```

#### Phase 1: Abstract ShadowMount Primitives

- **Action**: Audit `src/shadow-mount.ts` and decouple the code that touches `innerHTML` or reads text strings directly.
- **Deliverable**: Isolate markup compilation into a default driver strategy class inside the `ShadowMount` system.

#### Phase 2: Establish the Plugin Configuration System

- **Action**: Update `src/types.ts` to support the new payload and interface structures. Inject the pluggable engine mapping lookup map into the primary `Workspace` constructor lifecycle.
- **Deliverable**: A fully functioning vanilla TypeScript workspace that initializes third-party plugin extensions seamlessly at boot time.

#### Phase 3: Run the Test Bench Validation

- **Action**: Execute `npm run test` or run the Electron spec files found in `demo-electron/tests/electron-e2e.spec.ts`.
- **Deliverable**: Full validation showing that 100% of the existing vanilla HTML test specifications remain green, proving that the abstracted architecture causes zero regression.

#### Phase 4: Implement the `@canvus/react` Plugin

- **Action**: Author a clean, modern React wrapper implementation leveraging the freshly exposed lifecycle hooks. See the concrete blueprint implementation below.

---

### 5. Architectural Blueprint: Building `@canvus/react`

This design pattern shows how a developer can build a framework-specific plugin on top of the newly updated, extensible Canvus core kernel.

#### Step 1: Define the React Plugin Implementation Component

This plugin registers a custom node handler called `"react-component"`. It uses React's `createRoot` API to mount real, live components into the isolated canvas container frames.

```typescript
// packages/canvus-react/src/plugin.tsx
import React from "react";
import { createRoot, Root } from "react-dom/client";
import type { CanvusPlugin, CustomNodeRenderer } from "@canvus/core";

export interface ReactNodePayload {
  Component: React.ComponentType<any>;
  props: Record<string, any>;
  nodeId: string;
}

export const CanvusReactPlugin = (): CanvusPlugin => {
  return {
    name: "canvus-react-renderer",
    setup(context) {
      // Retain references to live Fiber roots indexed by node ID
      const activeRoots = new Map<string, Root>();

      const reactRenderer: CustomNodeRenderer = {
        mount(element, payload: ReactNodePayload) {
          const { Component, props, nodeId } = payload;

          // Initialize a real React root directly within the Shadow DOM placeholder shell
          const root = createRoot(element);
          activeRoots.set(nodeId, root);

          // Render the component instance into the infinite canvas matrix
          root.render(<Component {...props} />);
        },

        update(element, payload: ReactNodePayload) {
          const { Component, props, nodeId } = payload;
          const root = activeRoots.get(nodeId);

          // Re-render and apply new prop deltas reactively
          if (root) {
            root.render(<Component {...props} />);
          }
        },

        unmount(element, payload: { nodeId: string }) {
          const root = activeRoots.get(payload.nodeId);
          if (root) {
            // Unmount the component and clean up the React DOM root reference cleanly
            root.unmount();
            activeRoots.delete(payload.nodeId);
          }
        }
      };

      // Register this strategy handler into the core engine kernel
      context.registerCustomRenderer("react-component", reactRenderer);
    }
  };
};

```

#### Step 2: Create a React Component Wrapper

To give developers an idiomatic, declarative experience, create a wrapper component (`<CanvusCanvas />`) that hides the raw instantiation and handles reactivity automatically.

```typescript
// packages/canvus-react/src/CanvusCanvas.tsx
import React, { useEffect, useRef } from "react";
import { Workspace } from "@canvus/core";
import { CanvusReactPlugin } from "./plugin.js";

interface CanvusCanvasProps {
  style?: React.CSSProperties;
  config?: any;
}

export const CanvusCanvas: React.FC<CanvusCanvasProps> = ({ style, config }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<Workspace | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize the Vanilla core engine workspace instance
    const ws = new Workspace(containerRef.current, {}, {
      ...config,
      // Inject the React renderer directly via the core plugin ecosystem system
      plugins: [CanvusReactPlugin(), ...(config?.plugins || [])]
    });

    workspaceRef.current = ws;

    return () => {
      // Safely tear down all event listeners and canvas context elements
      ws.dispose();
    };
  }, [config]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", overflow: "hidden", ...style }}
    />
  );
};

```

#### Step 3: Consumer Usage Example (e.g., The Storybook Composer Canvas)

Now, developers can mount real interactive application components onto the infinite layout grid system with complete state tracking and prop manipulation.

```tsx
// demo/src/StorybookComposer.tsx
import React, { useEffect } from "react";
import { CanvusCanvas } from "@canvus/react";
import { CustomDashboardCard } from "./components/CustomDashboardCard.jsx";

export const StorybookComposer = () => {
  const handleOnCanvasInitialize = (wsInstance: any) => {
    // Mount a true React Component into the workspace layout tree
    wsInstance.addNode({
      id: "interactive-card-1",
      nodeType: "react-component", // Tells the engine to skip standard raw HTML parsing strings
      payload: {
        Component: CustomDashboardCard,
        props: { title: "Production Metric Tracker", dataPoints: [12, 19, 3] },
        nodeId: "interactive-card-1",
      },
      currentRect: { x: 150, y: 200, width: 340, height: 220 },
    });
  };

  return (
    <div
      className="storybook-addon-viewport"
      style={{ width: "100vw", height: "100vh" }}
    >
      <CanvusCanvas config={{ snapThreshold: 8 }} />
    </div>
  );
};
```

---

### 6. Verification & Validation Metrics

To sign off on this feature release, the build pipeline must clear three automated gateways:

1. **Test Bench Invariance**: Run the complete suite of legacy test specifications in the Electron shell. The suite must pass with 100% accuracy, confirming that the new abstraction layer did not introduce regressions to existing functionality.
2. **Memory Leak Audit**: Verify that adding and removing dynamic components properly updates the `activeRoots` collection and invokes React's `.unmount()` destructor. This ensures that long-running design sessions do not trigger memory leaks or leave orphan nodes behind.
3. **Reflow Performance Target**: Measure the time spent in the synchronous reflow loop during high-frequency operations (like dragging a component containing deep VDOM rendering trees). The timeline must maintain a target performance metric of **$\le$ 16ms per frame** to prevent stuttering and keep interactions feeling fluid on the canvas overlay.
