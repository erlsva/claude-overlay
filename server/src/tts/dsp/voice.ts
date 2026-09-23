/**
 * Shaping a voice: character pitch, how it is transmitted (intercom, walkie-talkie, tin can,
 * old radio), and the scream, strain, muffle and novelty (robot, underwater, chipmunk...) effects.
 */

import { type Scene } from "../scene/index.js";
import { RATE } from "./wav.js";
import { biquad } from "./biquad.js";

// --- Transmission (channel) ---------------------------------------------------
// What something is heard through: a narrower band, and usually some compression, stands in
// for a small speaker. Each preset is its own small, clean recipe rather than one generic
// bandpass turned up or down, because a walkie-talkie and a tin can are narrow for different
// reasons (compression vs. resonance) and sound wrong if treated the same way.

export function channelBandpass(channel: Scene["channel"]): string[] {
  if (channel === "walkie")
    // Narrower and more obviously compressed than a telephone; a light, brief limiter
    // gives it the characteristic "pumping" a real handset has on louder words.
    return [
      "highpass=f=480",
      "lowpass=f=2500",
      "acompressor=threshold=0.09:ratio=4:attack=4:release=90:makeup=2.5",
      "equalizer=f=1100:t=q:w=1:g=3",
    ];
  if (channel === "tincan")
    // A taut string and a resonant metal can, not a powered speaker: no compression, just a
    // very narrow band with a strong resonant peak where the can rings.
    return [
      "highpass=f=650",
      "lowpass=f=2000",
      "equalizer=f=1150:t=q:w=0.8:g=8",
      "equalizer=f=1900:t=q:w=1.2:g=4",
      "volume=1.15",
    ];
  if (channel === "radio")
    // Warmer and a little wider than a phone line: an old broadcast receiver, not a narrow
    // handset. A gentle low-shelf lift and light compression give it a nostalgic body
    // without the harshness a hard limiter or a narrow band would add.
    return [
      "highpass=f=180",
      "lowpass=f=4500",
      "bass=g=2:f=200",
      "acompressor=threshold=0.15:ratio=2.5:attack=8:release=120:makeup=1.5",
    ];
  if (channel === "intercom")
    // A telephone/intercom/megaphone line: close to the real ~300-3400 Hz telephone band,
    // with light compression for a small-speaker feel. Kept clean: no hard clipping, and the
    // presence boost sits low enough not to turn nasal or crunchy.
    return [
      "highpass=f=300",
      "lowpass=f=3400",
      "acompressor=threshold=0.12:ratio=3:attack=6:release=90:makeup=1.5",
      "equalizer=f=1100:t=q:w=1:g=2.5",
    ];
  return [];
}

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
  filters.push(...channelBandpass(scene.channel));
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

// --- Novelty voice effects -----------------------------------------------------
// Distinct from channel/room/muffle (where it is heard): a deliberate, funny transformation
// of the voice or sound itself, only applied when asked for. Each is one clean, well-known
// technique rather than a pile of saturation, so it stays a recognisable effect and not noise.

/**
 * Resamples by a fixed ratio, like a tape or record played at the wrong speed: pitch and
 * tempo move together. ratio > 1 shrinks it (faster, higher - chipmunk); ratio < 1 stretches
 * it (slower, deeper - a record played too slow). Plain linear interpolation: good enough for
 * a comedy effect, and simple enough to reason about.
 */
export function resampleRatio(samples: Float32Array, ratio: number): Float32Array {
  if (!(ratio > 0) || Math.abs(ratio - 1) < 0.001 || !samples.length) return samples;
  const outLength = Math.max(1, Math.round(samples.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const source = i * ratio;
    const lo = Math.min(samples.length - 1, Math.floor(source));
    const hi = Math.min(samples.length - 1, lo + 1);
    const t = source - lo;
    out[i] = samples[lo] * (1 - t) + samples[hi] * t;
  }
  return out;
}

/** How much faster (chipmunk) or slower (slowmo) resampleRatio should play the source. */
export function pitchTempoRatio(voiceEffect: Scene["voiceEffect"]): number | undefined {
  if (voiceEffect === "chipmunk") return 1.55;
  if (voiceEffect === "slowmo") return 0.68;
  return undefined;
}

/**
 * A slow, cyclical speed wobble: the same length back out, but each sample is read from a
 * position that oscillates a little ahead and behind, like tape wow-and-flutter or a voice
 * heard underwater. rateHz is how fast it wavers; depthSamples is how far it reaches, which
 * (combined with rateHz) sets the peak pitch deviation - not a drift that grows over time.
 */
function wobble(samples: Float32Array, rateHz: number, depthSamples: number): Float32Array {
  if (!(depthSamples > 0) || !samples.length) return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const source = i + depthSamples * Math.sin((2 * Math.PI * rateHz * i) / RATE);
    const clamped = Math.max(0, Math.min(samples.length - 1, source));
    const lo = Math.floor(clamped);
    const hi = Math.min(samples.length - 1, lo + 1);
    const t = clamped - lo;
    out[i] = samples[lo] * (1 - t) + samples[hi] * t;
  }
  return out;
}

/**
 * Heard from underwater: heavy low-pass with a slow, wavering pitch, like the voice is
 * drifting through water. amount scales both the filtering and the wobble depth. The wobble
 * amplitude (~30 samples at 3.5 Hz) gives about a 1.5% peak pitch deviation - audible as a
 * drift, not a warble.
 */
export function submerge(samples: Float32Array, amount = 1): Float32Array {
  if (!(amount > 0) || !samples.length) return samples;
  const wobbled = wobble(samples, 3.5, 30 * amount);
  const cutoff = Math.max(350, 900 / Math.sqrt(amount));
  let out = biquad("lowpass", cutoff, 0.75, 0, wobbled);
  out = biquad("lowpass", cutoff, 0.75, 0, out);
  return biquad("peak", 350, 1, 3 * amount, out);
}

/**
 * A clean, metallic ring-modulated robot voice: the signal is multiplied by a low steady
 * tone (the classic vocoder/Dalek trick), then narrowed a little so the buzz reads as
 * mechanical rather than just distorted. amount is the wet/dry mix, not extra grit.
 */
export function robotize(samples: Float32Array, amount = 1): Float32Array {
  if (!(amount > 0) || !samples.length) return samples;
  const carrierHz = 45;
  const mix = Math.min(1, 0.6 * amount);
  const modulated = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const carrier = Math.sin((2 * Math.PI * carrierHz * i) / RATE);
    modulated[i] = samples[i] * (1 - mix + mix * carrier);
  }
  let out = biquad("highpass", 220, 0.7, 0, modulated);
  out = biquad("lowpass", 4200, 0.8, 0, out);
  return biquad("peak", 1200, 1.1, 3 * amount, out);
}

/** Reverses a clip end to end, including any room or echo tail: "backmasking". */
export function reverseSamples(samples: Float32Array): Float32Array {
  return samples.slice().reverse();
}

/**
 * A short walkie-talkie key click: a brief filtered burst that reads as the handset keying
 * up or releasing, not a beep. Placed just before and after a walkie-channel line.
 */
export function walkieClick(rising: boolean): Float32Array {
  const seconds = 0.09;
  const length = Math.round(seconds * RATE);
  const raw = new Float32Array(length);
  let seed = rising ? 1 : 2;
  for (let i = 0; i < length; i++) {
    // A small deterministic pseudo-noise generator: enough texture for a click, no
    // dependency on Math.random so the same click renders identically every time.
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = (seed / 0x7fffffff) * 2 - 1;
    const envelope = rising
      ? Math.min(1, i / (length * 0.2)) * Math.pow(1 - i / length, 1.5)
      : Math.pow(1 - i / length, 0.6) * Math.min(1, (length - i) / (length * 0.3));
    raw[i] = noise * envelope * 0.5;
  }
  let out = biquad("highpass", 700, 0.8, 0, raw);
  return biquad("lowpass", 2600, 0.8, 0, out);
}
