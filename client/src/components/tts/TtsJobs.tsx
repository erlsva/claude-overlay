import {
  Clock3,
  LoaderCircle,
  Check,
  CircleAlert,
  Clipboard,
  Square,
  Headphones,
} from "lucide-react";
import { shorten } from "./api";
import { TtsPreview } from "./TtsPreview";
import type { TtsContext } from "./context";

/** Clips being generated, and the ones that just finished. */
export function TtsJobs({
  s,
}: {
  s: Pick<
    TtsContext,
    | "closePreview"
    | "jobs"
    | "playingKey"
    | "previewAudioRef"
    | "previewKey"
    | "selected"
    | "setPlayingKey"
    | "toast"
    | "togglePreview"
  >;
}) {
  const {
    closePreview,
    jobs,
    playingKey,
    previewAudioRef,
    previewKey,
    selected,
    setPlayingKey,
    toast,
    togglePreview,
  } = s;
  return (
    <div className="tts-jobs" aria-live="polite">
      <div className="tts-subheading">
        <span>
          <Clock3 size={14} />
          <strong>Recent jobs</strong>
        </span>
      </div>
      {jobs.slice(0, 4).map((job) => (
        <div className="tts-job-entry" key={job.id}>
          <div
            className={`tts-job tts-job--${job.status}${job.warning ? " tts-job--warning" : ""}`}
          >
            {job.status === "queued" || job.status === "running" ? (
              <LoaderCircle className="tts-spin" size={14} />
            ) : job.status === "complete" ? (
              <Check size={14} />
            ) : (
              <CircleAlert size={14} />
            )}
            <span>
              <strong>
                {job.status}
                {job.createdAt &&
                  ` · ${new Date(job.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              </strong>
              <small title={job.error || job.warning || job.message}>
                {shorten(job.error || job.warning || job.message)}
              </small>
            </span>
            {(job.error || job.warning) && (
              <button
                className="ui-icon-button ui-button--compact ui-icon-button--ghost"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(`TTS job ${job.id}\n${job.error || job.warning}`)
                    .then(() => toast.success("TTS error copied"))
                    .catch(() => toast.error("Could not copy the TTS error"))
                }
                title="Copy details (full text and job ID)"
                aria-label="Copy details"
              >
                <Clipboard size={12} />
              </button>
            )}
            {job.clip && (
              <button
                className="ui-icon-button ui-button--compact ui-icon-button--ghost"
                onClick={() => togglePreview(job.clip!, "job")}
                title={
                  playingKey === previewKey(job.clip, "job")
                    ? "Stop the preview"
                    : "Preview this clip on the dashboard"
                }
                aria-label={
                  playingKey === previewKey(job.clip, "job")
                    ? "Stop the preview"
                    : "Preview this clip on the dashboard"
                }
              >
                {playingKey === previewKey(job.clip, "job") ? (
                  <Square size={12} fill="currentColor" />
                ) : (
                  <Headphones size={13} />
                )}
              </button>
            )}
          </div>
          {selected?.origin === "job" && selected.clip.id === job.clip?.id && (
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
        </div>
      ))}
    </div>
  );
}
