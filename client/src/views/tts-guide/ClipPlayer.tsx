import { useMemo } from "react";
import { Download, LoaderCircle, Pause, Play } from "lucide-react";
import { SERVER_URL } from "../../config/server";
import { useClipPlayer } from "../../hooks/useClipPlayer";
import { BARS, fallbackPeaks, formatLength, formatTime } from "../../support/waveform";
import type { PublicClip } from "./clipInfo";
import { VolumeControl } from "./VolumeControl";
import { Waveform } from "./Waveform";

/**
 * Play or pause, the time, the waveform (which is also the seek bar), the length, a download
 * button, and a volume slider. The bars are the clip's real shape once its audio has decoded.
 */
export function ClipPlayer({ clip }: { clip: PublicClip }) {
  const player = useClipPlayer(clip.id, clip.duration);
  const peaks = useMemo(
    () => player.peaks ?? fallbackPeaks(clip.id, BARS),
    [player.peaks, clip.id],
  );
  const ready = player.load === "ready";

  return (
    <div className={`tts-public__player${player.playing ? " is-playing" : ""}`}>
      <div className="tts-public__player-row">
        <button
          type="button"
          className="tts-public__round"
          onClick={player.toggle}
          disabled={!ready}
          aria-label={player.playing ? "Pause" : "Play"}
        >
          {player.load === "loading" ? (
            <LoaderCircle className="tts-public__spin" size={22} aria-hidden="true" />
          ) : player.playing ? (
            <Pause size={22} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play size={22} fill="currentColor" aria-hidden="true" />
          )}
        </button>
        <span className="tts-public__time">{formatTime(player.time)}</span>
        <Waveform
          peaks={peaks}
          time={player.time}
          length={player.length}
          onSeek={player.seek}
          disabled={!ready}
        />
        <span className="tts-public__time">{formatLength(player.length)}</span>
        <a
          className="tts-public__icon-button"
          href={`${SERVER_URL}/tts/clips/${clip.id}/file?download=1`}
          download
          aria-label="Download this clip as an MP3"
        >
          <Download size={20} aria-hidden="true" />
        </a>
      </div>
      {player.load === "failed" && (
        <p className="tts-public__player-failed" role="alert">
          The audio could not be loaded.{" "}
          <button type="button" onClick={player.retry}>
            Try again
          </button>
        </p>
      )}
      <VolumeControl
        volume={player.volume}
        muted={player.muted}
        onVolume={player.setVolume}
        onToggleMute={player.toggleMute}
      />
    </div>
  );
}
