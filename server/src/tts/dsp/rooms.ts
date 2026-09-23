/** Rooms, echo and reverb: what a room sounds like and how an effect tail is built. */

import { type Scene } from "../scene/index.js";
import { RATE } from "./wav.js";

// A room is a reverb time, a spread of reflection delays, how much high end it
// keeps, and how loud it is. The default is the general room used everywhere
// before; a cathedral is long, wide and bright, which a small-room reverb
// cannot imitate no matter how it is turned up.
export type RoomProfile = {
  decay: number;
  level: number;
  delayScale: number;
  damping: number;
  predelay: number;
};

export function roomProfile(scene: Scene): RoomProfile {
  const extreme = scene.effectStrength === "extreme";
  // A sound effect has no last word to repeat, and copies of the whole sound sound
  // like it is layered on top of itself. So an echo on a sound is the room fading
  // away slowly and smoothly: longer and wider than plain reverb.
  const soundEcho = !scene.dialogue.trim() && (scene.effect === "echo" || scene.effect === "both");
  let profile: RoomProfile;
  if (scene.room === "cathedral")
    profile = {
      decay: extreme ? 7 : 4.8,
      level: extreme ? 0.8 : 0.62,
      delayScale: 1.9,
      damping: 0.28,
      predelay: 0.045,
    };
  // A small, close room: short decay, reflections arrive quickly.
  else if (scene.room === "indoor")
    profile = {
      decay: extreme ? 1.8 : 1.1,
      level: extreme ? 0.42 : 0.3,
      delayScale: 0.7,
      damping: 0.42,
      predelay: 0.012,
    };
  // Down a well: narrow and hollow, dull and boomy, with a short early reflection.
  else if (scene.room === "well")
    profile = {
      decay: extreme ? 2.6 : 1.6,
      level: extreme ? 0.48 : 0.36,
      delayScale: 0.55,
      damping: 0.62,
      predelay: 0.008,
    };
  else if (soundEcho)
    profile = {
      decay: extreme ? 4.2 : 2.8,
      level: extreme ? 0.55 : 0.42,
      delayScale: 1.5,
      damping: 0.45,
      predelay: 0.03,
    };
  else
    profile = {
      decay: extreme ? 3.2 : 1.8,
      level: extreme ? 0.5 : 0.32,
      delayScale: 1,
      damping: 0.35,
      predelay: 0.025,
    };
  if (soundEcho && scene.room)
    profile = { ...profile, decay: profile.decay * 1.4, level: profile.level * 1.15 };
  if (soundEcho && scene.effect === "both")
    profile = { ...profile, decay: profile.decay * 1.25, level: profile.level * 1.15 };
  return profile;
}

// Echo repeats only the end of speech. Room reverb is continuous through the utterance.
export function effectTail(
  dry: Float32Array,
  scene: Scene,
  timing: { start: number; end: number } | null,
  onDurationExpanded?: (naturalSeconds: number, requestedSeconds: number) => void,
): Float32Array {
  const spoken = !!scene.dialogue.trim();
  if (spoken && scene.effect !== "none" && !timing)
    throw new Error("Speech timing was unavailable. Cannot place the effect after the final word.");
  let waveformEnd = dry.length;
  if (spoken && timing) {
    waveformEnd = 0;
    // Preserve any audible provider output beyond its reported alignment. This
    // is common with screams, breaths and expressive word endings.
    for (let i = dry.length - 1; i >= 0; i--) {
      if (Math.abs(dry[i]) > 0.0005) {
        waveformEnd = i + 1;
        break;
      }
    }
  }
  const end =
    spoken && timing
      ? Math.min(dry.length, Math.max(waveformEnd, Math.ceil((timing.end + 0.12) * RATE)))
      : dry.length;
  // Timestamp trimming must not cut a nonzero waveform directly to silence.
  // Taper only the trailing guard after the aligned word, preserving its consonants.
  if (spoken && timing) {
    dry = dry.slice();
    const fadeStart = Math.max(Math.ceil(timing.end * RATE), end - Math.round(0.025 * RATE));
    const fadeLength = end - fadeStart;
    for (let i = fadeStart; i < end; i++) {
      const t = (i - fadeStart) / Math.max(1, fadeLength - 1);
      dry[i] *= 0.5 * (1 + Math.cos(Math.PI * t));
    }
  }
  const natural = end / RATE;
  // An authored duration is the complete scene length, matching the way the
  // prompt reads: speech/source first, then the effect decays in the time left.
  // Without a duration, preserve the natural source and add an automatic tail.
  const automaticTail = scene.effect === "none" ? 0 : scene.effectStrength === "extreme" ? 3 : 2;
  const requestedSeconds = scene.duration ?? natural + automaticTail;
  // Provider generation is already billable at this point. Never discard good
  // audio merely because its natural performance ran past the requested time.
  // Preserve every spoken word and surface a warning instead.
  // Ignore tiny encoder/alignment drift. It is not actionable and previously
  // produced a warning for virtually every generated scene.
  const overrunTolerance = Math.max(0.35, requestedSeconds * 0.05);
  // Padding out to the requested length only has something to fill it with when
  // there is a room or echo to decay. With no effect, a duration meaningfully
  // longer than the natural audio has nothing to fill the gap but dead silence,
  // so it is left at its natural length instead. A near-exact match still snaps
  // to the precise duration, and an overrun still compresses/keeps exactly as it
  // does with an effect - only the "shorter than asked, nothing to fill it" case
  // changes.
  const seconds =
    natural > requestedSeconds + 0.05
      ? natural
      : scene.effect === "none" && natural < requestedSeconds - 0.05
        ? natural
        : requestedSeconds;
  if (natural > requestedSeconds + overrunTolerance)
    onDurationExpanded?.(natural, requestedSeconds);
  const output = new Float32Array(Math.round(seconds * RATE));
  output.set(dry.subarray(0, Math.min(end, output.length)));
  if (scene.effect !== "none") {
    const start = spoken ? Math.max(0, Math.floor(timing!.start * RATE)) : 0;
    const seed = dry.subarray(start, end);
    const onset = Math.min(output.length, end + Math.round(0.12 * RATE));
    const remaining = (output.length - onset) / RATE;
    // Echo and room are independent, so they can be combined.
    const wantsEcho = scene.effect === "echo" || scene.effect === "both";
    // Speech repeats its last word. A sound effect's echo is the room fading away (see roomProfile).
    const spokenEcho = wantsEcho && spoken;
    const wantsReverb =
      scene.effect === "reverb" || scene.effect === "both" || (wantsEcho && !spoken);
    if (spokenEcho && remaining > 0) {
      const spacing = Math.max(0.3, seed.length / RATE + 0.13);
      for (let repeat = 0; onset + repeat * spacing * RATE < output.length; repeat++) {
        const offset = onset + Math.round(repeat * spacing * RATE);
        const progress = (offset - onset) / Math.max(1, output.length - onset);
        // A reflection is quieter and loses high frequencies on each return.
        // The tail window controls decay time, not a fixed-volume sample loop.
        const gain = 0.3 * Math.exp(-progress * 6.9);
        const cutoff = Math.max(350, 3200 * Math.pow(0.7, repeat));
        const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
        let low = 0;
        const attack = Math.min(seed.length * 0.3, RATE * 0.06);
        const release = Math.min(seed.length * 0.3, RATE * 0.08);
        for (let j = 0; j < seed.length && offset + j < output.length; j++) {
          low += alpha * (seed[j] - low);
          const envelope = Math.min(
            1,
            j / Math.max(1, attack),
            (seed.length - 1 - j) / Math.max(1, release),
          );
          output[offset + j] += low * gain * Math.max(0, envelope);
        }
      }
    }
    if (wantsReverb) {
      // Parallel damped combs with all-pass diffusion: a dense decay instead of discrete word repeats.
      // Drive the room with the whole utterance, including the scream's onset.
      // This prevents a disconnected repeat of the final syllable when the tail starts.
      // Room reflections also exist during the source, so a provider overrun
      // must not disable the cave sound merely because no decay time remains.
      // With an echo as well, the room is fed the source and its echoes together.
      const room = roomProfile(scene);
      const drive = spokenEcho ? output.slice() : dry;
      const driveEnd = spokenEcho ? drive.length : end;
      const roomOnset = Math.round(room.predelay * RATE);
      const wet = new Float32Array(Math.max(0, output.length - roomOnset));
      const delays = [0.0297, 0.0371, 0.0411, 0.0437, 0.0531, 0.0617, 0.0713, 0.0797];
      for (const baseDelay of delays) {
        const delay = baseDelay * room.delayScale;
        const size = Math.round(delay * RATE);
        const ring = new Float32Array(size);
        let low = 0;
        const feedback = Math.pow(0.001, delay / room.decay);
        for (let i = 0; i < wet.length; i++) {
          const at = i % size;
          const value = ring[at];
          low = room.damping * low + (1 - room.damping) * value;
          ring[at] = (i < driveEnd ? drive[i] : 0) + low * feedback;
          wet[i] += value / 4;
        }
      }
      for (const delay of [0.005, 0.0017]) {
        const ring = new Float32Array(Math.round(delay * RATE));
        for (let i = 0; i < wet.length; i++) {
          const at = i % ring.length;
          const value = wet[i];
          const delayed = ring[at];
          wet[i] = delayed - 0.5 * value;
          ring[at] = value + 0.5 * wet[i];
        }
      }
      // Keep the room gain constant across the speech boundary: no tail volume swell.
      for (let i = 0; i < wet.length; i++) {
        const at = roomOnset + i;
        // The echo already fills the space, so the room is a little quieter beside it.
        const level = room.level * (spokenEcho ? 0.8 : 1);
        // Speech needs a clearly audible room without washing out consonants.
        // The former 0.4 multiplier made normal cave reverb easy to miss.
        output[at] += wet[i] * level * (spoken ? 0.6 : 1);
      }
    }
    // The last echo or room reflection must reach silence at the authored
    // boundary instead of being sliced at an arbitrary waveform sample.
    const fade = Math.min(Math.round(0.35 * RATE), Math.floor(output.length / 4));
    for (let i = output.length - fade; i < output.length; i++) {
      const progress = (i - (output.length - fade)) / Math.max(1, fade - 1);
      output[i] *= 0.5 * (1 + Math.cos(Math.PI * progress));
    }
  }
  return output;
}
