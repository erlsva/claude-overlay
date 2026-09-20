import { Activity, X } from "lucide-react";
import type { DashboardContext } from "./context";

/** The full activity history dialog. */
export function ActivityHistory({
  s,
}: {
  s: Pick<DashboardContext, "activityPresence" | "setActivityMenuOpen" | "studio">;
}) {
  const { activityPresence, setActivityMenuOpen, studio } = s;
  return (
    <div
      role="dialog"
      aria-label="Complete activity history"
      className="motion-popover"
      data-state={activityPresence.state}
      style={{
        position: "fixed",
        left: "calc(var(--sidebar-width) + 10px)",
        bottom: 16,
        width: "min(300px, calc(100vw - var(--sidebar-width) - 26px))",
        maxHeight: "min(440px, calc(100vh - 32px))",
        overflowY: "auto",
        padding: 7,
        background: "var(--bg-raised)",
        border: "1px solid var(--line-strong)",
        borderRadius: 7,
        boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
        zIndex: 3000,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          position: "sticky",
          top: -7,
          padding: "8px 4px",
          margin: "-7px -1px 3px",
          borderBottom: "1px solid var(--line)",
          background: "var(--bg-raised)",
          color: "var(--text-primary)",
        }}
      >
        <Activity size={14} color="var(--accent-text)" />
        <strong style={{ fontSize: 12 }}>All activity</strong>
        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{studio.activity.length}</span>
        <button
          className="ui-icon-button ui-button--compact"
          onClick={() => setActivityMenuOpen(false)}
          title="Close activity history"
          aria-label="Close activity history"
          style={{
            border: "1px solid var(--line-strong)",
            background: "var(--bg-control)",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          <X size={13} />
        </button>
      </div>
      {studio.activity.map((item) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            gap: 7,
            padding: "7px 4px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <Activity size={12} color="var(--accent-text)" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: "var(--text-secondary)",
                fontSize: 11,
                lineHeight: 1.4,
              }}
            >
              <strong>{item.user}</strong> {item.action}
            </div>
            <small style={{ color: "var(--text-muted)", fontSize: 11 }}>
              {new Date(item.at).toLocaleString()}
            </small>
          </div>
        </div>
      ))}
      {studio.activity.length === 0 && (
        <div style={{ padding: 10, color: "var(--text-muted)", fontSize: 11 }}>No activity yet</div>
      )}
    </div>
  );
}
