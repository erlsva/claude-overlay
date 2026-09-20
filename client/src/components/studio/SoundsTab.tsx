import { Section, fieldStyle } from "./shared";
import { Plus, Search, AudioLines, Trash2, Square, Headphones, Play } from "lucide-react";
import type { StudioContext } from "./context";
import type { StudioPanelProps } from "./types";

/** The soundboard: add, preview and play clips. */
export function SoundsTab({
  props,
  s,
}: {
  props: StudioPanelProps;
  s: Pick<
    StudioContext,
    | "confirm"
    | "createSound"
    | "listSearch"
    | "name"
    | "setListSearch"
    | "setName"
    | "setSoundUrl"
    | "soundUrl"
    | "toast"
    | "uploadSound"
    | "uploading"
  >;
}) {
  const {
    confirm,
    createSound,
    listSearch,
    name,
    setListSearch,
    setName,
    setSoundUrl,
    soundUrl,
    toast,
    uploadSound,
    uploading,
  } = s;
  return (
    <Section
      title="Soundboard"
      description="Clips play on the overlay without a canvas layer. Preview stays in this browser; Play and Stop control the overlay."
    >
      <input
        style={fieldStyle}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Sound name (optional for Myinstants)"
        maxLength={60}
      />
      <input
        style={fieldStyle}
        value={soundUrl}
        onChange={(e) => setSoundUrl(e.target.value)}
        placeholder="Paste a Myinstants sound-page link"
        maxLength={2048}
        title="Paste the normal Myinstants button-page URL or a direct Myinstants MP3 link"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        <button
          className="ui-button studio-primary"
          onClick={() => void createSound()}
          disabled={uploading || !soundUrl.trim()}
        >
          <Plus size={14} /> Add Myinstants
        </button>
        <label className="ui-button" style={{ cursor: uploading ? "wait" : "pointer" }}>
          {uploading ? "Uploading…" : "Upload file"}
          <input
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.webm"
            hidden
            disabled={uploading}
            onChange={(event) => {
              void uploadSound(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {props.studio.sounds.length > 0 && (
        <label className="studio-search">
          <Search size={13} aria-hidden="true" />
          <input
            value={listSearch}
            onChange={(event) => setListSearch(event.target.value)}
            placeholder="Search sounds…"
            aria-label="Search sounds"
          />
        </label>
      )}
      {props.studio.sounds.length === 0 && (
        <div className="studio-empty-state">
          <strong>No sounds yet</strong>
          <span>Add a Myinstants link or upload an audio file to create your Soundboard.</span>
        </div>
      )}
      {props.studio.sounds
        .filter((item) => item.name.toLowerCase().includes(listSearch.trim().toLowerCase()))
        .map((item) => (
          <div key={item.id} className="soundboard-item">
            <div className="soundboard-item__head">
              <span className="soundboard-item__icon" aria-hidden="true">
                <AudioLines size={15} />
              </span>
              <strong>{item.name}</strong>
              <button
                className="ui-icon-button ui-button--compact ui-icon-button--ghost"
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: `Delete “${item.name}”?`,
                      message:
                        "Commands using this sound will keep a missing target until they are edited.",
                      confirmLabel: "Delete sound",
                      danger: true,
                    }))
                  )
                    return;
                  props.onDeleteSound(item.id);
                  toast.success(`Sound “${item.name}” deleted`);
                }}
                title={`Delete ${item.name}`}
                aria-label={`Delete ${item.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <label className="soundboard-item__volume">
              <span>Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={item.volume}
                onChange={(event) =>
                  props.onSaveSound({
                    ...item,
                    volume: Number(event.target.value),
                  })
                }
              />
              <output>{Math.round(item.volume * 100)}%</output>
            </label>
            <div className="soundboard-item__actions">
              <button
                className="ui-button ui-button--compact"
                onClick={() =>
                  props.previewingSoundIds.includes(item.id)
                    ? props.onStopPreviewSound(item.id)
                    : props.onPreviewSound(item.id)
                }
              >
                {props.previewingSoundIds.includes(item.id) ? (
                  <>
                    <Square size={11} fill="currentColor" />
                    Stop preview
                  </>
                ) : (
                  <>
                    <Headphones size={13} />
                    Preview
                  </>
                )}
              </button>
              <button
                className="ui-button ui-button--compact soundboard-action--obs"
                onClick={() => props.onPlaySound(item.id)}
              >
                <Play size={12} fill="currentColor" />
                Play on overlay
              </button>
              <button
                className="ui-button ui-button--compact"
                onClick={() => props.onStopSound(item.id)}
                title={`Immediately stop every instance of ${item.name} currently playing on the overlay`}
              >
                <Square size={11} fill="currentColor" />
                Stop
              </button>
            </div>
          </div>
        ))}
    </Section>
  );
}
