/** Pure helpers for the clip player's waveform and clock. Nothing here touches the browser. */

/** How many bars the waveform has. */
export const BARS = 60;

/** The quietest a bar is drawn, as a share of the full height, so silence still shows as a dot. */
const FLOOR = 0.07;

/** "0:05", "1:32". Whole seconds, rounded down; anything that is not a time reads as "0:00". */
export function formatTime(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** A clip's length: to the nearest second, and never "0:00" for a clip that has any sound. */
export function formatLength(seconds: number): string {
  return formatTime(seconds > 0 ? Math.max(1, Math.round(seconds)) : 0);
}

/** A position along the bar as a share of it, held between 0 and 1. */
export function clampFraction(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * The bar heights (0 to 1) for decoded audio: how loud each equal slice of the clip is, scaled so
 * the loudest slice is full height. Loudness is the RMS of the slice, eased with a power below 1
 * so quiet speech does not vanish next to a shout.
 */
export function peaksFrom(samples: ArrayLike<number>, bars: number = BARS): number[] {
  const size = Math.max(1, Math.floor(samples.length / bars));
  const loudness: number[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const from = bar * size;
    const to = Math.min(samples.length, from + size);
    let sum = 0;
    for (let at = from; at < to; at++) sum += samples[at] * samples[at];
    loudness.push(to > from ? Math.sqrt(sum / (to - from)) : 0);
  }
  const loudest = Math.max(...loudness);
  return loudness.map((value) =>
    loudest > 0 ? Math.max(FLOOR, Math.pow(value / loudest, 0.6)) : FLOOR,
  );
}

/**
 * A stand-in shape for a clip whose audio is not decoded yet (or cannot be), so the bar never
 * looks empty. It is decorative, seeded by the clip's id, so the same clip always draws the same.
 */
export function fallbackPeaks(seed: string, bars: number = BARS): number[] {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  const raw = Array.from({ length: bars }, () => random());
  return raw.map((value, index) => {
    const smooth =
      value * 0.5 + (raw[index - 1] ?? value) * 0.25 + (raw[index + 1] ?? value) * 0.25;
    return Math.max(FLOOR, 0.2 + smooth * 0.8);
  });
}

const SLOT = 5;
const BAR_WIDTH = 3;
const HEIGHT = 44;

/**
 * The bars as a CSS `mask-image` value. Painting the bars through a mask lets one element show the
 * whole waveform and fill it with a single gradient, so progress moves one CSS variable per frame
 * instead of restyling every bar.
 */
export function waveMask(peaks: number[]): string {
  const rects = peaks
    .map((peak, index) => {
      const height = Math.max(3, Math.round(Math.min(1, Math.max(0, peak)) * HEIGHT));
      const x = index * SLOT + (SLOT - BAR_WIDTH) / 2;
      return `<rect x="${x}" y="${(HEIGHT - height) / 2}" width="${BAR_WIDTH}" height="${height}" rx="1.5"/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${peaks.length * SLOT} ${HEIGHT}" preserveAspectRatio="none">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
