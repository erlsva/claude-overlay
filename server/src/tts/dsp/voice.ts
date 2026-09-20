/** Shaping a voice: character pitch, channel (intercom) and the scream, strain and muffle effects. */

import { type Scene } from "../shared/scene.js";
import { RATE } from "./wav.js";
import { biquad } from "./biquad.js";

export function channelFilter(
  scene: Scene,
  opts: { pitchShift?: boolean; strainDb?: number } = {},
): string {
  const filters = ["aresample=44100"];
  // A voice that was deliberately created for a character is already the right
  // pitch. Shifting it again only smears it, so callers can switch shifting off.
  const pitch = opts.pitchShift === false ? 1 : characterPitch(scene);
  if (pitch !== 1) {
    // Lower pitch and formants, then restore the original tempo. These core
    // FFmpeg filters are available on Render without optional audio libraries.
    filters.push(
      `asetrate=${Math.round(RATE * pitch)}`,
      "aresample=44100",
      `atempo=${(1 / pitch).toFixed(6)}`,
    );
  }
  if (scene.channel === "intercom")
    filters.push(
      "highpass=f=420",
      "lowpass=f=2800",
      "acompressor=threshold=0.08:ratio=5:attack=5:release=70:makeup=2",
      "asoftclip=type=tanh:threshold=0.4:output=0.85",
      "equalizer=f=1500:t=q:w=1:g=5",
    );
  // The voice model reads a screamed line as a clean, raised voice, which is what
  // sounds thin. Measured against a real scream, the difference is roughness (broadband
  // strain), not pitch or tags. So push the voice hard into a saturator, squash it, then
  // take the top end back down to where a real scream sits.
  if (opts.strainDb && opts.strainDb > 0) filters.push(...strainFilters(opts.strainDb));
  if (scene.distant) filters.push("lowpass=f=2200", "volume=0.55");
  return filters.join(",");
}

/** Saturation chain that gives a voice the rough, strained texture of shouting. */
export function strainFilters(driveDb: number): string[] {
  return [
    `volume=${driveDb.toFixed(1)}dB`,
    "asoftclip=type=atan:threshold=0.1",
    "acompressor=threshold=0.04:ratio=8:attack=2:release=50:makeup=2",
    "equalizer=f=3200:t=q:w=1:g=-4",
    "lowpass=f=6500",
  ];
}

export function characterPitch(scene: Scene): number {
  // A model's long explanation of a performance often says "deep voice" about a
  // character that has nothing to do with pitch. Read only the character name
  // for planned scenes; the user's own short direction for local ones.
  const identity = (scene.character || "").slice(0, 60);
  const direction = `${identity} ${scene.prepared ? "" : scene.delivery || ""}`.toLowerCase();
  if (/\b(?:giant|huge|massive)\s+(?:cave\s+)?(?:troll|ogre|monster|demon)\b/.test(direction))
    return 0.72;
  if (/\b(?:troll|ogre|monster|demon)\b/.test(direction)) return 0.76;
  if (/\b(?:giant|huge|massive)\b/.test(direction)) return 0.8;
  if (/\b(?:deep|very low|low-pitched|low pitched|gravelly)\s+(?:voice|voiced)?\b/.test(direction))
    return 0.84;
  return 1;
}

/** Gives a raised or screamed voice the spectrum of a real scream. amount scales the shaping: 0 leaves the voice alone. */
// --- Scream tone -------------------------------------------------------------
// Measured on a real recording of one person speaking and then screaming, the
// spectrum shifts in a consistent way: chest and low-mid energy falls away, the
// 500-2000 Hz body comes forward, and almost nothing is left above 4-5 kHz. That
// is why a real scream sounds clear rather than bright. Reproducing that shape
// on a voice is clean (no distortion); saturating it instead sounds crunchy.
export function screamTone(samples: Float32Array, amount = 1): Float32Array {
  if (!(amount > 0) || !samples.length) return samples;
  const a = amount;
  let out = biquad("highpass", 160, 0.7, 0, samples);
  out = biquad("lowshelf", 450, 0.7, -5 * a, out);
  out = biquad("peak", 800, 0.8, 2 * a, out);
  out = biquad("peak", 1500, 0.8, 1.5 * a, out);
  out = biquad("peak", 3000, 0.9, -3 * a, out);
  out = biquad("highshelf", 4500, 0.7, -6 * a, out);
  return biquad("lowpass", 9000, 0.7, 0, out);
}

/**
 * A voice or sound heard through a door or wall: the highs are absorbed, leaving a
 * dull, boxy low-mid body. scale makes it heavier (2 is a thick door), lighter below 1.
 * The cutoff is low because a voice keeps much of its energy between 700 Hz and 2 kHz:
 * at 1200 Hz a voice still sounded clear, and at 800 Hz it was only a thin wall. The
 * default is the "thick door" the owner chose by ear (800 Hz at 1.5, about 530 Hz).
 */
export function muffle(samples: Float32Array, scale = 1): Float32Array {
  if (!(scale > 0) || !samples.length) return samples;
  const cutoff = Math.max(250, 533 / scale);
  let out = biquad("highpass", 90, 0.7, 0, samples);
  out = biquad("lowpass", cutoff, 0.7, 0, out);
  out = biquad("lowpass", cutoff, 0.7, 0, out);
  return biquad("peak", 260, 1, 3, out);
}
