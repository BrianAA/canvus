import { useState, useCallback, useRef, useEffect } from "react";
import { Canvus } from "@canvus/react";
import type { CanvusHandle, ReactNodeSnapshot } from "@canvus/react";
import type { WorkspaceConfig } from "@canvus/core";
import { DemoCard } from "./components/DemoCard";
import { ControlPanel } from "./components/ControlPanel";
import { PropsInspector } from "./components/PropsInspector";
import { EventLog } from "./components/EventLog";
import "./App.css";

// Stable config object — must live outside the component
// to avoid re-creating the workspace on every render.
const WORKSPACE_CONFIG: WorkspaceConfig = { snapThreshold: 6 };

// ── Log Entry Type ──────────────────────────────────────────

interface LogEntry {
  id: string;
  timestamp: string;
  type: "react-commit" | "html-commit" | "selection" | "info";
  message: string;
}

// ── App ─────────────────────────────────────────────────────

function App() {
  const canvusRef = useRef<CanvusHandle>(null);
  const setCanvusRef = useCallback((handle: CanvusHandle | null) => {
    (canvusRef as any).current = handle;
    if (handle?.workspace) {
      (window as any).ws = handle.workspace;
      handle.workspace.injectCSS(`
        :host {
          font-family: 'Inter', system-ui, sans-serif;
        }
      `);
    }
  }, []);

  const [nodeCounter, setNodeCounter] = useState(0);
  const [activeNodes, setActiveNodes] = useState<
    Array<{ id: string; type: "react" | "html"; title: string }>
  >([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPreview, setIsPreview] = useState(false);

  const undoStackRef = useRef<any[][]>([]);
  const redoStackRef = useRef<any[][]>([]);

  // Track current props for each React node so the inspector can display them
  const [nodeProps, setNodeProps] = useState<Map<string, Record<string, any>>>(
    () => new Map(),
  );

  const addLog = useCallback(
    (type: LogEntry["type"], message: string) => {
      setLogs((prev) => [
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toLocaleTimeString(),
          type,
          message,
        },
        ...prev.slice(0, 49),
      ]);
    },
    [],
  );

  const handleOperationsGenerated = useCallback((ops: any[]) => {
    console.log('E2E DEBUG: onOperationsGenerated called with ops:', JSON.stringify(ops));
    undoStackRef.current.push(ops);
    redoStackRef.current = [];

    // Sync deletion of nodes from gestures
    for (const op of ops) {
      if (op.type === "delete-node") {
        setActiveNodes((prev) => prev.filter((n) => n.id !== op.nodeId));
        setNodeProps((prev) => {
          const next = new Map(prev);
          next.delete(op.nodeId);
          return next;
        });
      }
    }
  }, []);

  const handleUndo = useCallback(() => {
    const handle = canvusRef.current;
    console.log('E2E DEBUG: handleUndo called. workspace:', !!handle?.workspace, 'undoStack size:', undoStackRef.current.length);
    if (!handle?.workspace) return;

    const ops = undoStackRef.current.pop();
    if (!ops) {
      console.log('E2E DEBUG: handleUndo - no operations on undoStack');
      return;
    }

    console.log('E2E DEBUG: handleUndo - applying reverse operations:', JSON.stringify(ops));
    // Apply operations in reverse sequence with reverse payloads
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      if (op.type === "update-style" && op.payload && op.payload.left && op.payload.top) {
        // Split to avoid the core bug where concurrent left/top updates
        // read stale currentRect values before remeasureSubtree runs.
        handle.workspace.applyOperation({
          type: op.type,
          nodeId: op.nodeId,
          payload: { left: op.undoPayload.left },
          undoPayload: { left: op.payload.left }
        });
        handle.workspace.applyOperation({
          type: op.type,
          nodeId: op.nodeId,
          payload: { top: op.undoPayload.top },
          undoPayload: { top: op.payload.top }
        });
      } else {
        handle.workspace.applyOperation({
          type: op.type,
          nodeId: op.nodeId,
          payload: op.undoPayload,
          undoPayload: op.payload,
        });
      }
    }

    redoStackRef.current.push(ops);

    // Sync deletion of nodes from undoing a creation,
    // or restoration of nodes from undoing a deletion.
    for (const op of ops) {
      if (op.type === "create-node") {
        setActiveNodes((prev) => prev.filter((n) => n.id !== op.nodeId));
        setNodeProps((prev) => {
          const next = new Map(prev);
          next.delete(op.nodeId);
          return next;
        });
      } else if (op.type === "delete-node") {
        const isReact = op.nodeId.includes("react") || op.nodeId.includes("cloned") || op.nodeId.includes("pasted");
        if (!isReact) {
          setActiveNodes((prev) => {
            if (prev.some((n) => n.id === op.nodeId)) return prev;
            const title = `HTML Node ${op.nodeId.split("-").pop() || ""}`;
            return [...prev, { id: op.nodeId, type: "html", title }];
          });
        }
      }
    }

    addLog("info", `Undid ${ops.length} operation(s)`);
  }, [addLog]);

  const handleRedo = useCallback(() => {
    const handle = canvusRef.current;
    console.log('E2E DEBUG: handleRedo called. workspace:', !!handle?.workspace, 'redoStack size:', redoStackRef.current.length);
    if (!handle?.workspace) return;

    const ops = redoStackRef.current.pop();
    if (!ops) {
      console.log('E2E DEBUG: handleRedo - no operations on redoStack');
      return;
    }

    console.log('E2E DEBUG: handleRedo - applying original operations:', JSON.stringify(ops));
    // Re-apply operations in original sequence
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (op.type === "update-style" && op.payload && op.payload.left && op.payload.top) {
        handle.workspace.applyOperation({
          type: op.type,
          nodeId: op.nodeId,
          payload: { left: op.payload.left },
          undoPayload: { left: op.undoPayload.left }
        });
        handle.workspace.applyOperation({
          type: op.type,
          nodeId: op.nodeId,
          payload: { top: op.payload.top },
          undoPayload: { top: op.undoPayload.top }
        });
      } else {
        handle.workspace.applyOperation({
          type: op.type,
          nodeId: op.nodeId,
          payload: op.payload,
          undoPayload: op.undoPayload,
        });
      }
    }

    undoStackRef.current.push(ops);

    // Sync deletion of nodes from redoing a deletion,
    // or restoration of nodes from redoing a creation.
    for (const op of ops) {
      if (op.type === "delete-node") {
        setActiveNodes((prev) => prev.filter((n) => n.id !== op.nodeId));
        setNodeProps((prev) => {
          const next = new Map(prev);
          next.delete(op.nodeId);
          return next;
        });
      } else if (op.type === "create-node") {
        const isReact = op.nodeId.includes("react") || op.nodeId.includes("cloned") || op.nodeId.includes("pasted");
        if (!isReact) {
          setActiveNodes((prev) => {
            if (prev.some((n) => n.id === op.nodeId)) return prev;
            const title = `HTML Node ${op.nodeId.split("-").pop() || ""}`;
            return [...prev, { id: op.nodeId, type: "html", title }];
          });
        }
      }
    }

    addLog("info", `Redid ${ops.length} operation(s)`);
  }, [addLog]);

  // Global keydown handler for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.composedPath()[0] as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleUndo, handleRedo]);

  const togglePreviewMode = useCallback(() => {
    const handle = canvusRef.current;
    if (!handle?.workspace) return;

    const next = !isPreview;
    handle.workspace.setPreviewMode(next);
    setIsPreview(next);
    addLog("info", `Preview mode ${next ? "enabled" : "disabled"}`);
  }, [isPreview, addLog]);

  // ── Add React Node ──────────────────────────────────

  const handleAddReactNode = useCallback(() => {
    const handle = canvusRef.current;
    if (!handle) return;

    const count = nodeCounter + 1;
    setNodeCounter(count);

    const id = `react-card-${count}`;
    const title = `Card ${count}`;
    const xOffset = (count - 1) % 4;
    const yOffset = Math.floor((count - 1) / 4);

    const initialProps = {
      title,
      description: "A live React component on the canvas.",
      count: 0,
      variant:
        count % 3 === 0
          ? "accent"
          : count % 2 === 0
            ? "secondary"
            : "primary",
    };

    handle.addReactNode({
      id,
      component: DemoCard,
      props: initialProps,
      currentRect: {
        x: 40 + xOffset * 340,
        y: 40 + yOffset * 280,
        width: 300,
        height: 240,
      },
    });

    setActiveNodes((prev) => [...prev, { id, type: "react", title }]);
    setNodeProps((prev) => new Map(prev).set(id, initialProps));
    addLog("info", `Added React node "${id}"`);
  }, [nodeCounter, addLog]);

  // ── Add HTML Node ───────────────────────────────────

  const handleAddHTMLNode = useCallback(() => {
    const handle = canvusRef.current;
    if (!handle) return;

    const count = nodeCounter + 1;
    setNodeCounter(count);

    const id = `html-node-${count}`;
    const xOffset = (count - 1) % 4;
    const yOffset = Math.floor((count - 1) / 4);

    handle.addNode({
      id,
      rawMarkup: `
        <div style="
          padding: 24px;
          background: linear-gradient(135deg, #1e293b, #334155);
          border-radius: 12px;
          color: #e2e8f0;
          font-family: 'Inter', system-ui, sans-serif;
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
        ">
          <h3 style="margin: 0; font-size: 16px; color: #94a3b8;">HTML Node</h3>
          <p style="margin: 0; font-size: 14px; line-height: 1.5; opacity: 0.8;">
            This is a vanilla HTML node using rawMarkup.
            It participates in the Flat String Bridge.
          </p>
        </div>
      `,
      currentRect: {
        x: 40 + xOffset * 340,
        y: 40 + yOffset * 280,
        width: 300,
        height: 200,
      },
    });

    setActiveNodes((prev) => [
      ...prev,
      { id, type: "html", title: `HTML Node ${count}` },
    ]);
    addLog("info", `Added HTML node "${id}"`);
  }, [nodeCounter, addLog]);

  // ── Update React Node Props (from inspector) ────────

  const handleUpdateProps = useCallback(
    (id: string, props: Record<string, any>) => {
      const handle = canvusRef.current;
      if (!handle) return;

      handle.updateReactNode(id, props);

      // Update tracked props
      setNodeProps((prev) => {
        const next = new Map(prev);
        const existing = next.get(id) ?? {};
        next.set(id, { ...existing, ...props });
        return next;
      });

      const keys = Object.keys(props).join(", ");
      addLog("info", `Updated "${id}" props: ${keys}`);
    },
    [addLog],
  );

  // ── Remove Node ─────────────────────────────────────

  const handleRemoveNode = useCallback(
    (id: string, type: "react" | "html") => {
      const handle = canvusRef.current;
      if (!handle) return;

      if (type === "react") {
        handle.removeReactNode(id);
      } else {
        handle.workspace?.removeNode(id);
      }
      setActiveNodes((prev) => prev.filter((n) => n.id !== id));
      setNodeProps((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      addLog("info", `Removed ${type} node "${id}"`);
    },
    [addLog],
  );

  // ── Workspace Callbacks ─────────────────────────────

  const handleReactNodeCommit = useCallback(
    (id: string, snapshot: ReactNodeSnapshot) => {
      addLog(
        "react-commit",
        `"${id}" → ${snapshot.componentName}(${JSON.stringify(snapshot.props).slice(0, 60)}…) @ [${Math.round(snapshot.rect.x)}, ${Math.round(snapshot.rect.y)}]`,
      );

      // Sync activeNodes state for cloned, duplicated, or restored React nodes
      setActiveNodes((prev) => {
        if (prev.some((n) => n.id === id)) return prev;
        const title = snapshot.props.title || `Card ${id.split("-").pop() || ""}`;
        return [...prev, { id, type: "react", title }];
      });

      // Sync nodeProps state so the inspector displays them properly
      setNodeProps((prev) => {
        const next = new Map(prev);
        next.set(id, snapshot.props);
        return next;
      });
    },
    [addLog],
  );

  const handleHTMLCommit = useCallback(
    (id: string, html: string) => {
      addLog("html-commit", `"${id}" → ${html.slice(0, 80)}…`);

      // Sync activeNodes state for cloned/duplicated HTML nodes
      setActiveNodes((prev) => {
        if (prev.some((n) => n.id === id)) return prev;
        const title = `HTML Node ${id.split("-").pop() || ""}`;
        return [...prev, { id, type: "html", title }];
      });
    },
    [addLog],
  );

  const handleSelectionChange = useCallback(
    (ids: ReadonlySet<string>) => {
      const arr = Array.from(ids);
      setSelectedIds(arr);
      if (arr.length > 0) {
        addLog("selection", `Selected: ${arr.join(", ")}`);
      }
    },
    [addLog],
  );

  return (
    <div className="app-layout">
      {/* ── Sidebar (outside Canvus container) ──── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">
            <span className="logo-gradient">Canvus</span>
            <span className="logo-tag">React Demo</span>
          </h1>
          <button
            className={`preview-toggle ${isPreview ? "active" : ""}`}
            onClick={togglePreviewMode}
          >
            <span className="preview-toggle-icon">{isPreview ? "👁️" : "✏️"}</span>
            <span>{isPreview ? "Preview" : "Edit"}</span>
          </button>
        </div>

        <ControlPanel
          onAddReactNode={handleAddReactNode}
          onAddHTMLNode={handleAddHTMLNode}
          activeNodes={activeNodes}
          selectedIds={selectedIds}
          onUpdateProps={(id) => handleUpdateProps(id, { count: Math.floor(Math.random() * 100) })}
          onRemoveNode={handleRemoveNode}
        />

        <PropsInspector
          selectedIds={selectedIds}
          activeNodes={activeNodes}
          nodeProps={nodeProps}
          onUpdateProps={handleUpdateProps}
        />

        <EventLog logs={logs} />
      </aside>

      {/* ── Canvas (the workspace container) ────── */}
      <div className="canvas-area">
        <Canvus
          ref={setCanvusRef}
          config={WORKSPACE_CONFIG}
          onReactNodeCommit={handleReactNodeCommit}
          onHTMLCommit={handleHTMLCommit}
          onSelectionChange={handleSelectionChange}
          onOperationsGenerated={handleOperationsGenerated}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default App;
