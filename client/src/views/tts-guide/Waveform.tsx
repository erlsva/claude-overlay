import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { clampFraction, formatLength, formatTime, waveMask } from "../../support/waveform";

const KEY_STEP = 5;

/**
 * The clip drawn as bars, doubling as its progress bar: the played part is filled, and you can
 * click or drag anywhere on it to jump there. It is also a slider for the keyboard and screen
 * readers (arrows move by five seconds, Home and End go to the ends).
 */
export function Waveform({
  peaks,
  time,
  length,
  onSeek,
  disabled,
}: {
  peaks: number[];
  time: number;
  length: number;
  onSeek: (fraction: number) => void;
  disabled: boolean;
}) {
  const mask = useMemo(() => waveMask(peaks), [peaks]);
  const dragging = useRef(false);
  const progress = length > 0 ? clampFraction(time / length) : 0;

  const at = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return clampFraction((event.clientX - box.left) / box.width);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const to: Record<string, number> = {
      ArrowLeft: (time - KEY_STEP) / length,
      ArrowDown: (time - KEY_STEP) / length,
      ArrowRight: (time + KEY_STEP) / length,
      ArrowUp: (time + KEY_STEP) / length,
      Home: 0,
      End: 1,
    };
    if (!(event.key in to)) return;
    event.preventDefault();
    onSeek(to[event.key]);
  };

  return (
    <div
      className={`tts-public__seek${disabled ? " is-disabled" : ""}`}
      role="slider"
      aria-label="Position in the clip"
      aria-valuemin={0}
      aria-valuemax={Math.round(length)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={`${formatTime(time)} of ${formatLength(length)}`}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={disabled ? undefined : onKeyDown}
      onPointerDown={(event) => {
        if (disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
        onSeek(at(event));
      }}
      onPointerMove={(event) => {
        if (dragging.current) onSeek(at(event));
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <div
        className="tts-public__wave"
        style={{
          maskImage: mask,
          WebkitMaskImage: mask,
          // One variable moves; the bars themselves are never restyled.
          ["--progress" as string]: `${(progress * 100).toFixed(2)}%`,
        }}
      />
    </div>
  );
}
