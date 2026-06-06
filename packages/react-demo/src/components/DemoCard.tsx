import { useState, useCallback } from "react";

// ── Variant Styles ──────────────────────────────────────────

const VARIANT_STYLES: Record<string, { bg: string; accent: string; badge: string }> = {
  primary: {
    bg: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)",
    accent: "#c4b5fd",
    badge: "#4f46e5",
  },
  secondary: {
    bg: "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 50%, #22d3ee 100%)",
    accent: "#67e8f9",
    badge: "#0284c7",
  },
  accent: {
    bg: "linear-gradient(135deg, #f43f5e 0%, #e11d48 50%, #be123c 100%)",
    accent: "#fda4af",
    badge: "#be123c",
  },
};

// ── Props ───────────────────────────────────────────────────

interface DemoCardProps {
  title?: string;
  description?: string;
  count?: number;
  variant?: "primary" | "secondary" | "accent";
}

// ── Component ───────────────────────────────────────────────

/**
 * A sample React component designed to be mounted on the Canvus canvas.
 * Demonstrates that live React state and interactivity work inside
 * the workspace's Shadow DOM.
 */
export function DemoCard({
  title = "Demo Card",
  description = "A live React component on the canvas.",
  count = 0,
  variant = "primary",
}: DemoCardProps) {
  const [localCount, setLocalCount] = useState(count);
  const styles = VARIANT_STYLES[variant] ?? VARIANT_STYLES.primary;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalCount((c) => c + 1);
  }, []);

  return (
    <div
      style={{
        background: styles.bg,
        borderRadius: "16px",
        padding: "24px",
        color: "#fff",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3
          style={{
            margin: 0,
            fontSize: "18px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h3>
        <span
          style={{
            background: styles.badge,
            padding: "2px 10px",
            borderRadius: "12px",
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            opacity: 0.9,
          }}
        >
          React
        </span>
      </div>

      {/* Description */}
      <p
        style={{
          margin: 0,
          fontSize: "13px",
          lineHeight: 1.5,
          opacity: 0.85,
          flex: 1,
        }}
      >
        {description}
      </p>

      {/* Interactive footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "8px",
          borderTop: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <span style={{ fontSize: "13px", opacity: 0.7 }}>
          Count: <strong style={{ color: styles.accent }}>{localCount}</strong>
        </span>
        <button
          onClick={handleClick}
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "8px",
            color: "#fff",
            padding: "6px 16px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = "rgba(255,255,255,0.25)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = "rgba(255,255,255,0.15)";
          }}
        >
          +1
        </button>
      </div>
    </div>
  );
}
