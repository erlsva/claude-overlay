/**
 * Loudness targets, comfort limits, and the optional environment dials that shape the sound.
 * Every dial is optional and has a default, so nothing here has to be set on the host.
 */

import type { Intensity } from "../shared/scene.js";

// --- Loudness targets ---------------------------------------------------------
// Every scene is balanced by how loud it sounds before the scenes are joined.
// Generated effects arrive far louder than speech at the same peak, so a clip
// like foxes / pirate / foxes used to jump out at the listener.

/** Loudness of a spoken scene, in LUFS. */
export const SPEECH_TARGET_LUFS = -14;

/**
 * A standalone effect sits below speech. Under speech it is set to the speech
 * level first, then scaled by the scene's background volume.
 */
export const SOUND_ONLY_TARGET_LUFS = -19;

/** A voice behind a door is quieter than one in the room, but it must still be understood. */
export const MUFFLED_LEVEL_LU = 4;

/** Speech is never sped up by more than this to fit a stated duration. */
export const MAX_AUTO_SPEECH_TEMPO = 1.25;

// --- Comfort limits -----------------------------------------------------------
// How far above its own average a moment of a clip may rise before it is turned
// down. Sharp effects get the tightest limit: a piercing spike makes people leave.

export const SHARP_SOUND_SPIKE_LU = 3;
export const SOUND_SPIKE_LU = 5;
export const SHOUTED_SPEECH_SPIKE_LU = 6;

// --- Scream layer and strain (both off by default) ----------------------------

/** The scream layer is texture under the voice, not a second voice: kept well below it. */
export const SCREAM_LAYER_GAIN = 0.35;
export const SHOUT_LAYER_GAIN = 0.18;

/** Drive, in dB, of the saturation that gives shouted and screamed speech its rough texture. */
export const SCREAM_STRAIN_DB = 16;
export const SHOUT_STRAIN_DB = 10;

// --- Environment dials --------------------------------------------------------

/** Reads a numeric dial from the environment: `off`/`false`/`no` is 0, anything unusable is the fallback. */
function dial(name: string, fallback: number, max: number): number {
  const setting = (process.env[name] || "").trim().toLowerCase();
  if (!setting) return fallback;
  if (/^(?:off|false|no)$/.test(setting)) return 0;
  const value = Number(setting);
  return Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : fallback;
}

/**
 * TTS_SCREAM_LAYER: how much of a generated wordless scream is mixed under a
 * shouted line. Off by default: it reads as a second person screaming behind the
 * voice. 1 turns it on; 2 is twice as loud. It costs one extra sound-effect request.
 */
export const screamLayerScale = () => dial("TTS_SCREAM_LAYER", 0, 3);

/**
 * TTS_SCREAM_STRAIN scales the strain drive. Off by default: heavy saturation reads as
 * crunchy and harsh, and it cannot turn a calm voice into a scream. 1 is the full
 * effect, which is also what a "through a walkie talkie" style of scream sounds like.
 */
export const screamStrainScale = () => dial("TTS_SCREAM_STRAIN", 0, 2);

/**
 * TTS_SCREAM_TONE scales the clean spectral shaping that makes a shouted line sound like
 * a scream instead of a raised voice: 0 or off skips it, 1 is the default, 2 is double.
 */
export const screamToneScale = () => dial("TTS_SCREAM_TONE", 1, 2);

/** TTS_MUFFLE: how heavily a voice behind a door is muffled. 1 is the default (a thick door), 2 is heavier, 0.6 a thin wall, off skips it. */
export const muffleScale = () => dial("TTS_MUFFLE", 1, 3);

/** A yell is shaped as fully as a scream: at a lower amount it just sounded like a raised voice. */
export const toneAmountFor = (intensity: Intensity): number =>
  intensity === "normal" ? 0 : screamToneScale();

export function strainDbFor(intensity: Intensity): number {
  if (intensity === "normal") return 0;
  return (intensity === "scream" ? SCREAM_STRAIN_DB : SHOUT_STRAIN_DB) * screamStrainScale();
}
