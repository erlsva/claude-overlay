import { useEffect, useRef, useState } from "react";
import { Clipboard, Gamepad2, Terminal, Trash2 } from "lucide-react";
import { CreateRow } from "../studio/shared";
import { api } from "./api";
import type { RemoteToken } from "./types";
import type { useTtsServices } from "./useTtsServices";
import type { ActivityItem } from "../../types";

const logTime = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, { hour12: false }).padStart(8, "0");

/**
 * Named tokens for controlling TTS from outside the dashboard (a Stream Deck button, or anything
 * else that can send an HTTP request with `Authorization: Bearer <token>` to `POST /tts/remote`).
 * Owner/admin only. A collapsible section near the top of the panel, so it stays easy to find
 * instead of getting lost below the saved clips (which can run to a hundred entries). Below the
 * tokens is an always-on activity log, styled like a server console — not just something that
 * pops up when a button is pressed — so testing a button feels like watching a log tail.
 */
export function TtsRemoteTokens({
  s,
  recentActivity,
}: {
  s: Pick<ReturnType<typeof useTtsServices>, "confirm" | "toast">;
  /** The button presses seen so far this session, newest first: live proof a press reached the server. */
  recentActivity: ActivityItem[];
}) {
  const { confirm, toast } = s;
  const [tokens, setTokens] = useState<RemoteToken[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [justCreated, setJustCreated] = useState<{ name: string; token: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Oldest first, like a log actually reads; newest line arrives at the bottom, so keep it in view.
  const log = [...recentActivity].reverse();
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  useEffect(() => {
    void api<RemoteToken[]>("/remote-tokens")
      .then(setTokens)
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Could not load remote tokens"),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const created = await api<RemoteToken & { token: string }>("/remote-tokens", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      setTokens((current) => [created, ...(current ?? [])]);
      setJustCreated({ name: created.name, token: created.token });
      setName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the token");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: RemoteToken) => {
    const accepted = await confirm({
      title: "Revoke this remote token?",
      message: `"${token.name}" will stop working at once. Anything using it (a Stream Deck button, say) will need a new token.`,
      confirmLabel: "Revoke",
      danger: true,
    });
    if (!accepted) return;
    setBusy(true);
    try {
      await api(`/remote-tokens/${token.id}`, { method: "DELETE" });
      setTokens((current) => (current ?? []).filter((item) => item.id !== token.id));
      if (justCreated && tokens?.find((item) => item.id === token.id)?.name === justCreated.name)
        setJustCreated(null);
      toast.info(`Revoked "${token.name}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the token");
    } finally {
      setBusy(false);
    }
  };

  if (tokens === null) return null;
  return (
    <details className="tts-guide tts-remote">
      <summary>
        <Gamepad2 size={14} />
        Remote control (Stream Deck, etc.)
        <small>
          {tokens.length} token{tokens.length === 1 ? "" : "s"}
        </small>
      </summary>
      <div>
        <p>
          A named token lets something outside the dashboard (a Stream Deck's "API Request" action,
          say) pause TTS, skip, restart or change the volume, by sending it as{" "}
          <code className="tts-remote__inline-code">Authorization: Bearer …</code> to{" "}
          <code className="tts-remote__inline-code">POST /tts/remote</code>.
        </p>

        {justCreated && (
          <div className="tts-remote-reveal" role="status">
            <strong>
              "{justCreated.name}" is ready. Copy it now — it will not be shown again.
            </strong>
            <div className="tts-remote-reveal__token">
              <code>{justCreated.token}</code>
              <button
                type="button"
                className="ui-icon-button ui-button--compact ui-icon-button--ghost"
                title="Copy the token"
                aria-label="Copy the token"
                onClick={() => {
                  void navigator.clipboard.writeText(justCreated.token);
                  toast.success("Token copied");
                }}
              >
                <Clipboard size={14} />
              </button>
            </div>
            <button
              type="button"
              className="ui-button ui-button--compact"
              onClick={() => setJustCreated(null)}
            >
              Done
            </button>
          </div>
        )}

        {tokens.length > 0 && (
          <ul className="tts-remote__list">
            {tokens.map((token) => (
              <li className="tts-remote-item" key={token.id}>
                <span className="tts-remote-item__text">
                  <strong>{token.name}</strong>
                  <small>
                    Created {new Date(token.createdAt).toLocaleString()} by {token.createdBy}
                    {token.lastUsedAt
                      ? ` · last used ${new Date(token.lastUsedAt).toLocaleString()}`
                      : " · never used"}
                  </small>
                </span>
                <button
                  type="button"
                  className="ui-icon-button ui-button--compact ui-icon-button--ghost ui-icon-button--danger"
                  disabled={busy}
                  title="Revoke this token"
                  aria-label={`Revoke the remote token "${token.name}"`}
                  onClick={() => void revoke(token)}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <CreateRow
          name={name}
          setName={setName}
          placeholder="Token name, e.g. “Office Stream Deck”"
          onCreate={() => void create()}
          label="Create token"
          disabled={busy || !name.trim()}
        />

        <div className="tts-subheading">
          <span>
            <Terminal size={13} />
            <strong>Activity log</strong>
          </span>
        </div>
        <div className="tts-remote-log" ref={logRef} role="log" aria-live="polite">
          {log.length === 0 ? (
            <p className="tts-remote-log__empty">waiting for a button press…</p>
          ) : (
            log.map((item) => (
              <p className="tts-remote-log__line" key={item.id}>
                <span className="tts-remote-log__time">[{logTime(item.at)}]</span>{" "}
                <span className="tts-remote-log__user">{item.user}</span> {item.action}
              </p>
            ))
          )}
          <span className="tts-remote-log__cursor" aria-hidden="true" />
        </div>
      </div>
    </details>
  );
}
