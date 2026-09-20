import { Activity } from "lucide-react";
import { RoleTag } from "../../components/RoleTag";
import { AccountMenu } from "./AccountMenu";
import { ActivityHistory } from "./ActivityHistory";
import { ConnectionsPopover } from "./ConnectionsPopover";
import type { DashboardContext } from "./context";
import type { DashboardProps } from "./types";

/** The bottom of the layers panel: recent activity, who is online, and the account menu. */
export function SidebarFooter({ props, s }: { props: DashboardProps; s: DashboardContext }) {
  const { user } = props;
  const {
    studio,
    activityMenuOpen,
    setActivityMenuOpen,
    setPresenceMenuOpen,
    setProfileMenuOpen,
    activityPresence,
    connectionPresence,
    presenceMenuOpen,
    overlayConnected,
    activeUsers,
    profilePresence,
    profileMenuOpen,
  } = s;
  return (
    <div
      style={{
        position: "relative",
        borderTop: "1px solid var(--line)",
        padding: 8,
        background: "var(--bg-app)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "block",
          padding: "0 0 7px",
          marginBottom: 7,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <button
          onClick={() => {
            setActivityMenuOpen((open) => !open);
            setPresenceMenuOpen(false);
            setProfileMenuOpen(false);
          }}
          title="Show the complete activity history"
          aria-expanded={activityMenuOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            minHeight: 32,
            padding: "0 7px",
            border: `1px solid ${activityMenuOpen ? "var(--accent-border)" : "var(--line)"}`,
            borderRadius: 5,
            background: activityMenuOpen ? "var(--accent-surface)" : "var(--bg-raised)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <Activity size={13} color="var(--accent-text)" />
          <span style={{ fontSize: 11, fontWeight: 700 }}>Activity</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
            {studio.activity.length} {activityMenuOpen ? "▲" : "▼"}
          </span>
        </button>
        <div style={{ display: "grid", gap: 3, marginTop: 5 }}>
          {studio.activity.slice(0, 3).map((item) => (
            <div
              key={item.id}
              style={{
                padding: "5px 7px",
                border: "1px solid var(--line)",
                borderRadius: 4,
                background: "var(--bg-sunken)",
              }}
            >
              <div
                style={{
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  lineHeight: 1.35,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <strong>{item.user}</strong> {item.action}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 1 }}>
                {new Date(item.at).toLocaleString()}
              </div>
            </div>
          ))}
          {studio.activity.length === 0 && (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: 11,
                padding: "4px 7px",
              }}
            >
              No activity yet
            </div>
          )}
        </div>
      </div>
      {activityPresence.mounted && <ActivityHistory s={s} />}
      {connectionPresence.mounted && <ConnectionsPopover s={s} />}
      <button
        onClick={() => {
          setPresenceMenuOpen((open) => !open);
          setProfileMenuOpen(false);
          setActivityMenuOpen(false);
        }}
        title="Show overlay status and everyone currently on the dashboard"
        aria-expanded={presenceMenuOpen}
        style={{
          width: "100%",
          height: 34,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "0 6px",
          marginBottom: 6,
          background: presenceMenuOpen ? "var(--bg-raised)" : "transparent",
          border: "1px solid var(--line)",
          borderRadius: 5,
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: overlayConnected ? "#4ade80" : "#f87171",
            boxShadow: overlayConnected ? "0 0 6px rgba(74,222,128,0.55)" : "none",
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 11, fontWeight: 600 }}>
          {overlayConnected ? "Overlay Online" : "Overlay Offline"}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "flex", alignItems: "center" }}>
          {activeUsers.slice(0, 4).map((activeUser, index) => (
            <img
              key={activeUser.userId}
              src={activeUser.avatar}
              alt={activeUser.displayName}
              title={`${activeUser.displayName} is active`}
              style={{
                width: 22,
                height: 22,
                marginLeft: index === 0 ? 0 : -6,
                borderRadius: "50%",
                border: `2px solid ${activeUser.color}`,
                background: "var(--bg-panel)",
              }}
            />
          ))}
          {activeUsers.length > 4 && (
            <span
              style={{
                marginLeft: 4,
                color: "var(--text-muted)",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              +{activeUsers.length - 4}
            </span>
          )}
        </span>
      </button>
      {profilePresence.mounted && <AccountMenu props={props} s={s} />}
      <button
        onClick={() => {
          setProfileMenuOpen((open) => !open);
          setPresenceMenuOpen(false);
          setActivityMenuOpen(false);
        }}
        aria-expanded={profileMenuOpen}
        title={profileMenuOpen ? "Close account menu" : "Open account menu and settings"}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 6,
          background: profileMenuOpen ? "var(--bg-raised)" : "transparent",
          border: "1px solid transparent",
          borderRadius: 5,
          color: "var(--text-primary)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <img
          src={user.avatar}
          alt=""
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: `2px solid ${user.color ?? "#9146FF"}`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            minWidth: 0,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 12,
          }}
        >
          {user.displayName}
        </span>
        <RoleTag role={user.role} />
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
          {profileMenuOpen ? "▼" : "▲"}
        </span>
      </button>
    </div>
  );
}
