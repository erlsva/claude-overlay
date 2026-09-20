import { type RefObject } from "react";
import { Headphones, X } from "lucide-react";
import { type Clip } from "./types";
import { base, formatDuration } from "./api";

export function TtsPreview({
  clip,
  audioRef,
  autoPlay,
  onPlayingChange,
  onClose,
}: {
  clip: Clip;
  audioRef: RefObject<HTMLAudioElement>;
  autoPlay?: boolean;
  onPlayingChange: (playing: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="tts-player">
      <div className="tts-player__header">
        <Headphones size={15} />
        <span>
          <strong>Dashboard preview</strong>
          <small>
            {clip.sender} · {formatDuration(clip.duration)}
          </small>
        </span>
        <button
          className="ui-icon-button ui-button--compact"
          onClick={onClose}
          title="Close the preview"
          aria-label="Close dashboard TTS preview"
        >
          <X size={18} />
        </button>
      </div>
      <p>{clip.prompt}</p>
      <audio
        ref={audioRef}
        key={clip.id}
        controls
        autoPlay={autoPlay}
        preload="metadata"
        src={`${base}/clips/${clip.id}/audio`}
        onPlay={() => onPlayingChange(true)}
        onPause={() => onPlayingChange(false)}
        onEnded={() => onPlayingChange(false)}
      />
    </div>
  );
}
