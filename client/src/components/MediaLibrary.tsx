import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Film, ImagePlus, Play, Trash2, Upload, Volume2, X } from "lucide-react";
import type { CanvasElement, MediaType, SoundboardItem } from "../types";
import { authHeaders } from "../hooks/useAuth";
import { usePresence } from "../hooks/usePresence";
import { measureMediaUrl } from "../canvas/mediaSize";
import { randomUUID } from "../utils";
import { useConfirm } from "./ConfirmProvider";
import { useToast } from "./ToastProvider";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";
const ACCEPTED = "image/*,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,.gif";

interface LibraryItem {
  id: string;
  name: string;
  mime: string;
  size: number;
  addedBy: string;
  createdAt: string;
  url: string;
}

interface LibraryState {
  configured: boolean;
  items: LibraryItem[];
  usedBytes: number;
  limitBytes: number;
  maxFileBytes: number;
}

const mediaTypeFor = (mime: string): MediaType =>
  mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : mime === "image/gif" ? "gif" : "image";

const megabytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
const kindLabel = (type: MediaType) => (type === "gif" ? "GIF" : type === "audio" ? "Audio" : type === "video" ? "Video" : "Image");

interface MediaLibraryProps {
  open: boolean;
  onClose: () => void;
  onAdd: (element: CanvasElement) => void;
  onSaveSound: (item: SoundboardItem) => void;
}

/** Files that stay available after the server restarts, for every moderator to reuse. */
export function MediaLibrary({ open, onClose, onAdd, onSaveSound }: MediaLibraryProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<LibraryState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const presence = usePresence(open);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${SERVER_URL}/library`, { credentials: "include", headers: authHeaders() });
      const data = (await response.json().catch(() => ({}))) as Partial<LibraryState> & { error?: string };
      if (!response.ok) throw new Error(data.error || "The shared library could not be loaded.");
      setState(data as LibraryState);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The shared library could not be loaded.");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setState(null);
    void refresh();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose, refresh]);

  if (!presence.mounted) return null;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (state && file.size > state.maxFileBytes) {
      toast.error(`Files in the library can be at most ${megabytes(state.maxFileBytes)}.`);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${SERVER_URL}/library`, { method: "POST", body, credentials: "include", headers: authHeaders() });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || `Upload failed (${response.status})`);
      toast.success(`${file.name} saved to the shared library`);
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const addToCanvas = async (item: LibraryItem) => {
    const type = mediaTypeFor(item.mime);
    const src = `${SERVER_URL}${item.url}`;
    const size = type === "audio" ? null : await measureMediaUrl(src, type === "video" ? "video" : "image");
    onAdd({
      id: randomUUID(),
      type,
      src,
      displayName: item.name,
      x: 200,
      y: 200,
      width: type === "audio" ? 360 : (size?.width ?? 400),
      height: type === "audio" ? 86 : (size?.height ?? 225),
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      zIndex: Date.now(),
    });
    toast.success(`${item.name} added to the canvas`);
    onClose();
  };

  const addToSoundboard = (item: LibraryItem) => {
    onSaveSound({ id: randomUUID(), name: item.name, url: `${SERVER_URL}${item.url}`, volume: 0.25 });
    toast.success(`${item.name} added to the Soundboard`);
  };

  const remove = async (item: LibraryItem) => {
    if (!await confirm({
      title: `Delete “${item.name}” from the library?`,
      message: "It disappears for everyone. Layers and sounds already using it will stop loading it.",
      confirmLabel: "Delete file",
      danger: true,
    })) return;
    try {
      const response = await fetch(`${SERVER_URL}/library/${item.id}`, { method: "DELETE", credentials: "include", headers: authHeaders() });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not delete the file.");
      toast.success(`${item.name} removed from the library`);
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not delete the file.");
    }
  };

  const used = state?.usedBytes ?? 0;
  const limit = state?.limitBytes ?? 1;

  return (
    <div className="readiness-backdrop motion-backdrop" data-state={presence.state} onMouseDown={onClose}>
      <section
        className="readiness-dialog library-dialog motion-dialog"
        data-state={presence.state}
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="library-title">Shared media library</h2>
            <p>Files everyone can add to the canvas. They stay available after the server restarts.</p>
          </div>
          <button className="ui-icon-button" onClick={onClose} title="Close the library" aria-label="Close the library">
            <X size={16} />
          </button>
        </header>

        {state?.configured && (
          <div className="library-toolbar">
            <div className="library-usage" title={`${megabytes(used)} of ${megabytes(limit)} used`}>
              <div className="library-usage__bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
              </div>
              <small>{megabytes(used)} of {megabytes(limit)} used · up to {megabytes(state.maxFileBytes)} per file</small>
            </div>
            <button className="ui-button studio-primary" style={{ width: "auto" }} onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={14} /> {busy ? "Saving…" : "Add file"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED}
              hidden
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        )}

        <div className="library-body">
          {error && <p className="library-note library-note--bad">{error}</p>}
          {!error && !state && <p className="library-note">Loading…</p>}
          {state && !state.configured && (
            <p className="library-note">The shared library needs the Neon database. Set <code>DATABASE_URL</code> on the server to enable it.</p>
          )}
          {state?.configured && state.items.length === 0 && (
            <div className="studio-empty-state">
              <strong>Nothing here yet</strong>
              <span>Add the default videos, images and sounds you want everyone to be able to use.</span>
            </div>
          )}
          {state?.configured && state.items.length > 0 && (
            <div className="library-grid">
              {state.items.map((item) => {
                const type = mediaTypeFor(item.mime);
                const src = `${SERVER_URL}${item.url}`;
                return (
                  <article className="library-card" key={item.id}>
                    <div className="library-card__preview">
                      {type === "image" || type === "gif" ? (
                        <img src={src} alt="" loading="lazy" />
                      ) : type === "video" ? (
                        <video src={`${src}#t=0.1`} preload="metadata" muted playsInline />
                      ) : (
                        <AudioLines size={28} aria-hidden="true" />
                      )}
                      <span className="library-card__kind">
                        {type === "video" ? <Film size={11} /> : type === "audio" ? <Volume2 size={11} /> : <ImagePlus size={11} />}
                        {kindLabel(type)}
                      </span>
                    </div>
                    <div className="library-card__body">
                      <strong title={item.name}>{item.name}</strong>
                      <small>{megabytes(item.size)} · {item.addedBy}</small>
                    </div>
                    <div className="library-card__actions">
                      <button className="ui-button ui-button--compact soundboard-action--obs" onClick={() => void addToCanvas(item)}>
                        <Play size={12} fill="currentColor" /> Add to canvas
                      </button>
                      {type === "audio" && (
                        <button className="ui-button ui-button--compact" onClick={() => addToSoundboard(item)} title="Add this sound to the Soundboard">
                          <Volume2 size={13} /> Soundboard
                        </button>
                      )}
                      <button
                        className="ui-icon-button ui-button--compact ui-icon-button--ghost ui-icon-button--danger"
                        onClick={() => void remove(item)}
                        title="Delete from the library for everyone"
                        aria-label={`Delete ${item.name} from the library`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
