// ─────────────────────────────────────────────────────────────
// PropsInspector — Live props editor for selected React nodes
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";

interface ActiveNode {
  id: string;
  type: "react" | "html";
  title: string;
}

interface PropsInspectorProps {
  selectedIds: string[];
  activeNodes: ActiveNode[];
  nodeProps: Map<string, Record<string, any>>;
  onUpdateProps: (id: string, props: Record<string, any>) => void;
}

const VARIANT_OPTIONS = ["primary", "secondary", "accent"] as const;

export function PropsInspector({
  selectedIds,
  activeNodes,
  nodeProps,
  onUpdateProps,
}: PropsInspectorProps) {
  // Find the selected React node (if any)
  const selectedReactNode = activeNodes.find(
    (n) => n.type === "react" && selectedIds.includes(n.id),
  );

  const currentProps = selectedReactNode
    ? nodeProps.get(selectedReactNode.id)
    : undefined;

  if (!selectedReactNode || !currentProps) {
    return (
      <section className="panel-section">
        <h3 className="section-title">Props Inspector</h3>
        <p className="empty-state">
          Select a React node on the canvas to edit its props
        </p>
      </section>
    );
  }

  return (
    <section className="panel-section props-inspector">
      <h3 className="section-title">
        Props Inspector
        <span className="badge">⚛️ {selectedReactNode.id}</span>
      </h3>

      <div className="props-form">
        {/* Title */}
        <PropField
          label="title"
          type="text"
          value={currentProps.title ?? ""}
          onChange={(val) =>
            onUpdateProps(selectedReactNode.id, { title: val })
          }
        />

        {/* Description */}
        <PropField
          label="description"
          type="textarea"
          value={currentProps.description ?? ""}
          onChange={(val) =>
            onUpdateProps(selectedReactNode.id, { description: val })
          }
        />

        {/* Count */}
        <PropField
          label="count"
          type="number"
          value={currentProps.count ?? 0}
          onChange={(val) =>
            onUpdateProps(selectedReactNode.id, { count: Number(val) })
          }
        />

        {/* Variant */}
        <div className="prop-field">
          <label className="prop-label">variant</label>
          <div className="variant-picker">
            {VARIANT_OPTIONS.map((v) => (
              <button
                key={v}
                className={`variant-btn variant-${v} ${currentProps.variant === v ? "active" : ""}`}
                onClick={() =>
                  onUpdateProps(selectedReactNode.id, { variant: v })
                }
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Reusable Prop Field ─────────────────────────────────────

function PropField({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: "text" | "textarea" | "number";
  value: string | number;
  onChange: (value: string) => void;
}) {
  const [localValue, setLocalValue] = useState(String(value));

  // Sync from parent when external updates happen
  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const val = e.target.value;
      setLocalValue(val);
      onChange(val);
    },
    [onChange],
  );

  const handleBlur = useCallback(() => {
    onChange(localValue);
  }, [localValue, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && type !== "textarea") {
        onChange(localValue);
      }
    },
    [localValue, onChange, type],
  );

  return (
    <div className="prop-field">
      <label className="prop-label">{label}</label>
      {type === "textarea" ? (
        <textarea
          className="prop-input prop-textarea"
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          rows={2}
        />
      ) : (
        <input
          className="prop-input"
          type={type}
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      )}
    </div>
  );
}
