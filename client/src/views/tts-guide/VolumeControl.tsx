import type { CSSProperties } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";

/** A mute button and a volume slider. The slider is a plain range input, so it works by keyboard too. */
export function VolumeControl({
  volume,
  muted,
  onVolume,
  onToggleMute,
}: {
  volume: number;
  muted: boolean;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
}) {
  const shown = muted ? 0 : volume;
  const Icon = shown === 0 ? VolumeX : shown < 0.5 ? Volume1 : Volume2;
  return (
    <div className="tts-public__volume">
      <button
        type="button"
        className="tts-public__icon-button tts-public__icon-button--plain"
        onClick={onToggleMute}
        aria-label={muted || volume === 0 ? "Turn the sound back on" : "Mute"}
        aria-pressed={muted || volume === 0}
      >
        <Icon size={20} aria-hidden="true" />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={shown}
        onChange={(event) => onVolume(Number(event.target.value))}
        aria-label="Volume"
        aria-valuetext={`${Math.round(shown * 100)}%`}
        style={{ ["--fill" as string]: `${shown * 100}%` } as CSSProperties}
      />
      <output className="tts-public__volume-value" aria-hidden="true">
        {Math.round(shown * 100)}%
      </output>
    </div>
  );
}
