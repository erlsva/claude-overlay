import {
  Database,
  Search,
  Clipboard,
  Square,
  Headphones,
  Play,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDuration } from "./api";
import { TtsPreview } from "./TtsPreview";
import type { TtsContext } from "./context";
import type { TtsPanelProps } from "./types";

/** Saved clips: search, preview, replay and delete. */
export function TtsLibrary({
  props,
  s,
}: {
  props: TtsPanelProps;
  s: Pick<
    TtsContext,
    | "busy"
    | "clips"
    | "clipsPage"
    | "clipsPageCount"
    | "closePreview"
    | "copyToken"
    | "filteredClips"
    | "pagedClips"
    | "playingKey"
    | "previewAudioRef"
    | "previewKey"
    | "removeClip"
    | "search"
    | "selected"
    | "setClipsPage"
    | "setPlayingKey"
    | "setSearch"
    | "submit"
    | "togglePreview"
  >;
}) {
  const { overlayConnected } = props;
  const {
    busy,
    clips,
    clipsPage,
    clipsPageCount,
    closePreview,
    copyToken,
    filteredClips,
    pagedClips,
    playingKey,
    previewAudioRef,
    previewKey,
    removeClip,
    search,
    selected,
    setClipsPage,
    setPlayingKey,
    setSearch,
    submit,
    togglePreview,
  } = s;
  return (
    <div className="tts-library">
      <div className="tts-subheading">
        <span>
          <Database size={14} />
          <strong>Saved clips</strong>
        </span>
        <small>{clips.length} / latest 100</small>
      </div>
      {clips.length > 0 && (
        <label className="studio-search">
          <Search size={13} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search prompts, senders, or tokens…"
          />
        </label>
      )}
      {pagedClips.map((clip) => (
        <article className="tts-clip" key={clip.id}>
          <div className="tts-clip__meta">
            <strong>{clip.prompt}</strong>
            <small>
              {clip.sender} · {formatDuration(clip.duration)} ·{" "}
              {new Date(clip.createdAt).toLocaleString()}
            </small>
          </div>
          <div className="tts-clip__token">
            <code title={clip.token}>{clip.token}</code>
            <button
              className="ui-icon-button ui-button--compact ui-icon-button--ghost"
              onClick={() => void copyToken(clip)}
              title="Copy reusable TTS token"
              aria-label="Copy reusable TTS token"
            >
              <Clipboard size={14} />
            </button>
          </div>
          <div className="tts-clip__actions">
            <button
              className="ui-button ui-button--compact"
              onClick={() => togglePreview(clip, "library")}
            >
              {playingKey === previewKey(clip, "library") ? (
                <>
                  <Square size={11} fill="currentColor" /> Stop
                </>
              ) : (
                <>
                  <Headphones size={13} /> Preview
                </>
              )}
            </button>
            <button
              className="ui-button ui-button--compact soundboard-action--obs"
              disabled={!overlayConnected || busy}
              onClick={() => void submit(true, clip.token)}
              title={
                overlayConnected
                  ? "Play this clip on the overlay"
                  : "Open the overlay to play this clip"
              }
            >
              <Play size={12} fill="currentColor" /> Play on overlay
            </button>
            <button
              className="ui-icon-button ui-button--compact ui-icon-button--ghost ui-icon-button--danger"
              disabled={busy}
              onClick={() => void removeClip(clip)}
              title="Permanently delete this saved clip"
              aria-label="Delete this saved clip"
            >
              <Trash2 size={14} />
            </button>
          </div>
          {selected?.origin === "library" && selected.clip.id === clip.id && (
            <TtsPreview
              clip={selected.clip}
              audioRef={previewAudioRef}
              autoPlay={selected.autoPlay}
              onPlayingChange={(playing) =>
                setPlayingKey(playing ? previewKey(selected.clip, selected.origin) : null)
              }
              onClose={closePreview}
            />
          )}
        </article>
      ))}
      {clipsPageCount > 1 && (
        <nav className="tts-clips-pager" aria-label="Saved clips pages">
          <button
            type="button"
            className="ui-icon-button ui-button--compact ui-icon-button--ghost"
            disabled={clipsPage === 0}
            onClick={() => setClipsPage((current) => current - 1)}
            aria-label="Previous page of saved clips"
            title="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          <span>
            Page {clipsPage + 1} of {clipsPageCount}
          </span>
          <button
            type="button"
            className="ui-icon-button ui-button--compact ui-icon-button--ghost"
            disabled={clipsPage >= clipsPageCount - 1}
            onClick={() => setClipsPage((current) => current + 1)}
            aria-label="Next page of saved clips"
            title="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </nav>
      )}
      {!clips.length && (
        <div className="studio-empty-state">
          <strong>No saved TTS clips</strong>
          <span>Generate your first scene. Its replay token will appear here.</span>
        </div>
      )}
      {!!clips.length && !filteredClips.length && (
        <div className="studio-empty-state">
          <strong>No matching clips</strong>
          <span>Try a different search term.</span>
        </div>
      )}
    </div>
  );
}
