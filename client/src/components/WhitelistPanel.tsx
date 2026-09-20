import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import { authHeaders } from "../hooks/useAuth";
import { useToast } from "./ToastProvider";
import { RoleTags } from "./RoleTag";
import type { UserRole } from "../types";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

interface WhitelistEntry {
  username: string;
  added_by: string;
  added_at: string;
  isAdmin: boolean;
  role?: UserRole;
  roles?: UserRole[];
}

interface WhitelistPanelProps {
  open: boolean;
  onClose: () => void;
  isOwner: boolean;
  isAdmin: boolean;
}

// Every row gets its badges. An older server without roles falls back to the admin flag.
const rolesOf = (entry: WhitelistEntry): UserRole[] =>
  entry.roles ?? [entry.role ?? (entry.isAdmin ? "super-moderator" : "moderator")];

export function WhitelistPanel({ open, onClose, isOwner, isAdmin }: WhitelistPanelProps) {
  const [list, setList] = useState<WhitelistEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const fetchList = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/whitelist`, {
        credentials: "include",
        headers: authHeaders(),
      });
      if (res.ok) setList(await res.json());
      else toast.error("Could not load the whitelist");
    } catch {
      toast.error("Could not reach the server to load the whitelist");
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleAdd = async () => {
    const username = input.trim().toLowerCase();
    if (!username) return;
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/whitelist`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not add that user");
      } else {
        toast.success(`Added ${data.displayName} to the whitelist`);
        setInput("");
        fetchList();
      }
    } catch {
      toast.error("Could not reach the server to add that user");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (username: string) => {
    try {
      const response = await fetch(`${SERVER_URL}/whitelist/${username}`, {
        method: "DELETE",
        credentials: "include",
        headers: authHeaders(),
      });
      if (!response.ok) {
        toast.error(`Could not remove ${username}`);
        return;
      }
      toast.success(`Removed ${username} from the whitelist`);
      fetchList();
    } catch {
      toast.error(`Could not reach the server to remove ${username}`);
    }
  };

  const handleToggleAdmin = async (username: string, isAdmin: boolean) => {
    try {
      const response = await fetch(`${SERVER_URL}/whitelist/${username}/admin`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ isAdmin: !isAdmin }),
      });
      if (!response.ok) {
        toast.error(`Could not update ${username}'s role`);
        return;
      }
      toast.success(
        `${username} is ${isAdmin ? "no longer a super moderator" : "now a super moderator"}`,
      );
      fetchList();
    } catch {
      toast.error(`Could not reach the server to update ${username}`);
    }
  };

  return (
    <div
      className={`whitelist-backdrop${open ? " whitelist-backdrop--open" : ""}`}
      aria-hidden={!open}
      onClick={onClose}
    >
      <div
        className="whitelist-panel"
        style={{
          background: "var(--bg-panel)",
          borderLeft: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 0 32px rgba(0,0,0,0.55)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px 0 16px",
            height: 56,
            borderBottom: "1px solid var(--line)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            Whitelist
          </h2>
          <button
            className="ui-icon-button"
            title="Close whitelist settings"
            aria-label="Close whitelist settings"
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {isAdmin && (
          <div style={{ padding: 16, borderBottom: "1px solid var(--line)" }}>
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-muted)",
              }}
            >
              Add a Twitch username
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="username"
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 32,
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 6,
                  color: "var(--text-primary)",
                  fontSize: 13,
                  padding: "0 12px",
                  outline: "none",
                }}
              />
              <button
                className="ui-button studio-primary"
                onClick={handleAdd}
                disabled={loading || !input.trim()}
                style={{ width: "auto" }}
              >
                {loading ? "…" : "Add"}
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto" }}>
          {list.length === 0 ? (
            <p
              style={{ padding: 16, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}
            >
              No users whitelisted yet
            </p>
          ) : (
            list.map((entry) => (
              <div key={entry.username} className="whitelist-row">
                <div className="whitelist-row__who">
                  <div className="whitelist-row__name">
                    <strong>{entry.username}</strong>
                    <RoleTags roles={rolesOf(entry)} />
                  </div>
                  <span className="whitelist-row__added">
                    Added {new Date(entry.added_at).toLocaleDateString()}
                    {entry.added_by ? ` by ${entry.added_by}` : ""}
                  </span>
                </div>
                {isAdmin && (
                  <div className="whitelist-row__actions">
                    {isOwner && (
                      <button
                        className={`ui-icon-button ui-button--compact whitelist-row__promote${entry.isAdmin ? " is-on" : ""}`}
                        onClick={() => handleToggleAdmin(entry.username, entry.isAdmin)}
                        aria-pressed={entry.isAdmin}
                        aria-label={
                          entry.isAdmin
                            ? `Remove ${entry.username} as super moderator`
                            : `Make ${entry.username} a super moderator`
                        }
                        title={entry.isAdmin ? "Remove super moderator" : "Make super moderator"}
                      >
                        <Star size={13} fill={entry.isAdmin ? "currentColor" : "none"} />
                      </button>
                    )}
                    <button
                      className="ui-button ui-button--compact ui-button--quiet-danger"
                      onClick={() => handleRemove(entry.username)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
