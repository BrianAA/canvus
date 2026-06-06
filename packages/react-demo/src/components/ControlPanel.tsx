// ─────────────────────────────────────────────────────────────
// ControlPanel — Sidebar controls for the demo application
// ─────────────────────────────────────────────────────────────

interface ActiveNode {
  id: string;
  type: "react" | "html";
  title: string;
}

interface ControlPanelProps {
  onAddReactNode: () => void;
  onAddHTMLNode: () => void;
  activeNodes: ActiveNode[];
  selectedIds: string[];
  onUpdateProps: (id: string) => void;
  onRemoveNode: (id: string, type: "react" | "html") => void;
}

export function ControlPanel({
  onAddReactNode,
  onAddHTMLNode,
  activeNodes,
  selectedIds,
  onUpdateProps,
  onRemoveNode,
}: ControlPanelProps) {
  return (
    <div className="control-panel">
      {/* ── Actions ─────────────────────────────── */}
      <section className="panel-section">
        <h3 className="section-title">Add Nodes</h3>
        <div className="button-group">
          <button
            className="btn btn-primary"
            onClick={onAddReactNode}
          >
            <span className="btn-icon">⚛️</span>
            Add React Node
          </button>
          <button
            className="btn btn-secondary"
            onClick={onAddHTMLNode}
          >
            <span className="btn-icon">📝</span>
            Add HTML Node
          </button>
        </div>
      </section>

      {/* ── Active Nodes ────────────────────────── */}
      <section className="panel-section">
        <h3 className="section-title">
          Active Nodes
          <span className="badge">{activeNodes.length}</span>
        </h3>

        {activeNodes.length === 0 ? (
          <p className="empty-state">No nodes on canvas yet. Add one above!</p>
        ) : (
          <ul className="node-list">
            {activeNodes.map((node) => (
              <li
                key={node.id}
                className={`node-item ${selectedIds.includes(node.id) ? "selected" : ""}`}
              >
                <div className="node-info">
                  <span className={`node-type-badge ${node.type}`}>
                    {node.type === "react" ? "⚛️" : "📝"}
                  </span>
                  <span className="node-id">{node.id}</span>
                </div>
                <div className="node-actions">
                  {node.type === "react" && (
                    <button
                      className="btn-icon-small"
                      onClick={() => onUpdateProps(node.id)}
                      title="Update props"
                    >
                      🔄
                    </button>
                  )}
                  <button
                    className="btn-icon-small btn-danger"
                    onClick={() => onRemoveNode(node.id, node.type)}
                    title="Remove node"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
