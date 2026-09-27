import { useEffect, useState } from "react";
import { Clipboard, Gamepad2, Plus, Trash2 } from "lucide-react";
import { api } from "./api";
import type { RemoteToken } from "./types";
import type { useTtsServices } from "./useTtsServices";

/**
 * Named tokens for controlling TTS from outside the dashboard (a Stream Deck button, or anything
 * else that can send an HTTP request with `Authorization: Bearer <token>` to `POST /tts/remote`).
 * Owner/admin only: shown in the TTS panel beneath everything else.
 */
export function TtsRemoteTokens({
  s,
}: {
  s: Pick<ReturnType<typeof useTtsServices>, "confirm" | "toast">;
}) {
  const { confirm, toast } = s;
  const [tokens, setTokens] = useState<RemoteToken[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [justCreated, setJustCreated] = useState<{ name: string; token: string } | null>(null);

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
    <div className="tts-remote">
      <div className="tts-subheading">
        <span>
          <Gamepad2 size={14} />
          <strong>Remote control</strong>
        </span>
        <small>
          {tokens.length} token{tokens.length === 1 ? "" : "s"}
        </small>
      </div>
      <p className="tts-remote__hint">
        A named token lets something outside the dashboard (a Stream Deck's "API Request" action,
        say) pause TTS, skip, restart or change the volume, by sending it as{" "}
        <code>Authorization: Bearer …</code> to <code>POST /tts/remote</code>.
      </p>

      {justCreated && (
        <div className="tts-remote-reveal" role="status">
          <strong>"{justCreated.name}" is ready. Copy it now — it will not be shown again.</strong>
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

      <label className="studio-search tts-remote-create">
        <input
          value={name}
          maxLength={60}
          disabled={busy}
          placeholder="Name this token, e.g. “Office Stream Deck”"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void create();
          }}
        />
        <button
          type="button"
          className="ui-button ui-button--compact"
          disabled={busy || !name.trim()}
          onClick={() => void create()}
        >
          <Plus size={13} /> Create token
        </button>
      </label>
    </div>
  );
}
