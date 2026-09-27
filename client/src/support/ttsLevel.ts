/**
 * How much the overlay's TTS icon moves, worked out from the clip's stored waveform and where the
 * audio is right now. Pure, so it can be tested without a browser or any audio.
 */

/** Below this share of the loudest slice the icon stays still, so pauses in speech settle. */
const QUIET = 0.15;
/** More than 1 makes loud parts stand out from ordinary ones. */
const CONTRAST = 1.4;

const clean = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

/**
 * How loud the clip is `seconds` into it, from 0 (quiet, or a pause) to 1 (loud). The waveform is
 * whole numbers from 0 to 100, one per equal slice of the clip; this blends between neighbouring
 * slices so the movement is smooth, then adds contrast so words jump and pauses settle.
 */
export function levelAt(
  peaks: readonly unknown[] | null | undefined,
  seconds: number,
  duration: number,
): number {
  if (!Array.isArray(peaks) || peaks.length === 0) return 0;
  if (!Number.isFinite(seconds) || !(duration > 0)) return 0;
  // A slice's value belongs to the middle of the slice, so the blend runs from middle to middle.
  const position = Math.min(
    peaks.length - 1,
    Math.max(0, (seconds / duration) * peaks.length - 0.5),
  );
  const from = Math.floor(position);
  const to = Math.min(peaks.length - 1, from + 1);
  const a = clean(peaks[from]);
  const b = clean(peaks[to]);
  const raw = (a + (b - a) * (position - from)) / 100;
  return Math.pow(Math.max(0, (raw - QUIET) / (1 - QUIET)), CONTRAST);
}

/** With no waveform to follow (rare), a lively but steady movement for as long as the clip plays. */
export function steadyLevel(seconds: number): number {
  return 0.45 + 0.3 * Math.sin(Number.isFinite(seconds) ? seconds * 9 : 0);
}

/**
 * One step of smoothing: the movement rises quickly and falls back more slowly, and it moves at
 * the same speed whatever the frame rate.
 */
export function smoothLevel(previous: number, target: number, seconds: number): number {
  const towards = target > previous ? 0.7 : 0.2; // the share covered in each 1/60 s
  const share = 1 - Math.pow(1 - towards, Math.max(0, seconds) * 60);
  return previous + (target - previous) * share;
}

export interface Pose {
  x: number;
  y: number;
  rotate: number;
  scale: number;
}

/** Where the icon is: still at level 0, and bouncing, shaking and swelling as the level rises. */
export function poseFor(level: number, seconds: number): Pose {
  const l = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  // "+ 0" turns a negative zero into a plain zero, so a still icon reads "0px", never "-0px".
  return {
    x: Math.sin(seconds * 19 + 1) * l * 3 + 0,
    y: 0 - l * 12,
    rotate: Math.sin(seconds * 26) * l * 8 + 0,
    scale: 1 + l * 0.18,
  };
}

export const poseCss = (pose: Pose) =>
  `translate(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px) rotate(${pose.rotate.toFixed(2)}deg) scale(${pose.scale.toFixed(3)})`;
