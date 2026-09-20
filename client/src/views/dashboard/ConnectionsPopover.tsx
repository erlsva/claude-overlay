import { X } from "lucide-react";
import { RoleTag } from "../../components/RoleTag";
import type { DashboardContext } from "./context";

/** Who is connected: the overlay, the dashboard users and their status. */
export function ConnectionsPopover({
  s,
}: {
  s: Pick<
    DashboardContext,
    | "activeUsers"
    | "connected"
    | "connectionPresence"
    | "overlayConnected"
    | "overlayCount"
    | "setPresenceMenuOpen"
    | "studio"
    | "twitchChannel"
  >;
}) {
  const {
    activeUsers,
    connected,
    connectionPresence,
    overlayConnected,
    overlayCount,
    setPresenceMenuOpen,
    studio,
    twitchChannel,
  } = s;
  return (
    <div
      className="motion-popover"
      data-state={connectionPresence.state}
      style={{
        position: "fixed",
        left: "calc(var(--sidebar-width) + 10px)",
        bottom: 16,
        width: "min(320px, calc(100vw - var(--sidebar-width) - 26px))",
        maxHeight: "min(440px, calc(100vh - 32px))",
        overflowY: "auto",
        padding: 9,
        background: "var(--bg-raised)",
        border: "1px solid var(--line)",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        zIndex: 3000,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "2px 3px 8px",
          marginBottom: 7,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <strong style={{ color: "var(--text-primary)", fontSize: 12 }}>Connection status</strong>
        <span style={{ flex: 1 }} />
        <button
          className="ui-icon-button ui-button--compact"
          onClick={() => setPresenceMenuOpen(false)}
          title="Close connection status"
          aria-label="Close connection status"
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
      <div
        style={{
          display: "grid",
          gap: 5,
          padding: "3px 4px 8px",
          marginBottom: 6,
          borderBottom: "1px solid var(--line)",
          fontSize: 11,
          color: "var(--text-secondary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: overlayConnected ? "#4ade80" : "#f87171",
            }}
          />
          Overlay: {overlayConnected ? "online" : "offline"}
          {overlayCount > 1 ? ` (${overlayCount} sources)` : ""}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: connected ? "#4ade80" : "#f87171",
            }}
          />
          Dashboard server: {connected ? "connected" : "disconnected"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: studio.twitchConnected ? "#4ade80" : "#f59e0b",
            }}
          />
          Chat listener:{" "}
          {studio.twitchConnected
            ? `listening to ${twitchChannel}`
            : `connecting to ${twitchChannel}`}
        </div>
      </div>
      <div
        style={{
          padding: "2px 4px 6px",
          color: "var(--text-muted)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
        }}
      >
        ACTIVE NOW
      </div>
      {activeUsers.map((activeUser) => (
        <div
          key={activeUser.userId}
          style={{
            minHeight: 34,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 5px",
            color: "var(--text-primary)",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <img
            src={activeUser.avatar}
            alt=""
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: `2px solid ${activeUser.color}`,
            }}
          />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {activeUser.displayName}
          </span>
          <RoleTag role={activeUser.role} />
        </div>
      ))}
      {activeUsers.length === 0 && (
        <div
          style={{
            padding: "7px 5px",
            color: "var(--text-muted)",
            fontSize: 11,
          }}
        >
          No dashboard users reported
        </div>
      )}
    </div>
  );
}
