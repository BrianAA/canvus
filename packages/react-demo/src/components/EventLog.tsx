// ─────────────────────────────────────────────────────────────
// EventLog — Scrollable log of workspace events
// ─────────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  timestamp: string;
  type: "react-commit" | "html-commit" | "selection" | "info";
  message: string;
}

interface EventLogProps {
  logs: LogEntry[];
}

const TYPE_LABELS: Record<LogEntry["type"], { label: string; className: string }> = {
  "react-commit": { label: "REACT", className: "log-react" },
  "html-commit": { label: "HTML", className: "log-html" },
  selection: { label: "SELECT", className: "log-selection" },
  info: { label: "INFO", className: "log-info" },
};

export function EventLog({ logs }: EventLogProps) {
  return (
    <section className="panel-section event-log">
      <h3 className="section-title">
        Event Log
        <span className="badge">{logs.length}</span>
      </h3>

      <div className="log-entries">
        {logs.length === 0 ? (
          <p className="empty-state">Events will appear here…</p>
        ) : (
          logs.map((entry) => {
            const meta = TYPE_LABELS[entry.type];
            return (
              <div key={entry.id} className="log-entry">
                <span className="log-time">{entry.timestamp}</span>
                <span className={`log-type ${meta.className}`}>
                  {meta.label}
                </span>
                <span className="log-message">{entry.message}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
