/** How long the sound of a scene should be, and how fast its speech has to go to fit. */

import { type Scene } from "../scene/index.js";
import { isHugeSound } from "../sound.js";
import { MAX_AUTO_SPEECH_TEMPO } from "./tuning.js";

const transientSound =
  /\b(fart|burp|belch|explosion|blast|thunder|gunshot|shot|slam|impact|bang|crash|burst|pop)\b/i;

/**
 * How many seconds of sound to ask the model for. A sound in a scene with no speech is later
 * stretched or squeezed by the scene's speed, so with a written duration it is asked for the
 * length that ends up at that duration (half speed: half as much). Without a duration the clip
 * simply comes out longer or shorter, which is what a speed change means.
 */
export function activeSoundDuration(scene: Scene, hasSpeech: boolean): number {
  const seconds = sourceSoundDuration(scene, hasSpeech);
  if (hasSpeech || !scene.duration || !scene.speechRate) return seconds;
  return Math.min(30, Math.max(0.5, seconds * scene.speechRate));
}

function sourceSoundDuration(scene: Scene, hasSpeech: boolean): number {
  const requested =
    scene.soundDuration ??
    (!hasSpeech && scene.effect !== "none"
      ? Math.max(0.5, Math.min(1.5, (scene.duration ?? 5) * 0.25))
      : (scene.duration ?? 5));
  if (scene.effect === "none" || !scene.duration) return requested;
  // A generated source that fills the whole scene leaves no audible decay.
  // Short impacts reserve most of the scene for the room; sustained ambience
  // keeps more source audio while still guaranteeing an effect tail.
  const sustained =
    /\b(?:sustained|drawn[- ]out|prolonged|rumbling|resonant|long|lasting|extended|extreme(?:ly)?)\b/i.test(
      scene.sound,
    ) || isHugeSound(scene.sound);
  let sourceLimit =
    transientSound.test(scene.sound) && !sustained
      ? Math.max(0.5, Math.min(2, scene.duration * 0.3))
      : Math.max(0.5, scene.duration - Math.min(3, Math.max(1, scene.duration * 0.35)));
  // Echoes need room to be heard: half the scene at most is the source itself.
  if (scene.effect === "echo" || scene.effect === "both")
    sourceLimit = Math.min(sourceLimit, Math.max(0.5, scene.duration * 0.5));
  // An oversized sound is slowed by 1/0.7 afterwards, so ask for less to end up at the right length.
  if (isHugeSound(scene.sound)) sourceLimit = Math.max(0.5, sourceLimit * 0.7);
  return Math.min(requested, sourceLimit);
}

export function speechTempo(scene: Scene, naturalSeconds: number): number {
  if (!scene.duration || naturalSeconds <= scene.duration) return 1;
  // An explicit duration describes the complete scene. Fit the paid performance
  // rather than truncating words or silently making the result much longer.
  // Room reverb is audible during speech, so only a short decay needs reserving.
  const tail =
    scene.effect === "echo" || scene.effect === "both"
      ? Math.min(1, scene.duration * 0.15)
      : scene.effect === "reverb"
        ? Math.min(0.75, scene.duration * 0.1)
        : 0;
  // Never turn an expressive delivery into rushed speech just to satisfy an
  // optimistic duration. The full performance is preserved when 1.25x is not
  // enough; the scene warning then suggests a longer authored duration.
  return Math.min(
    MAX_AUTO_SPEECH_TEMPO,
    Math.max(1, naturalSeconds / Math.max(0.5, scene.duration - tail)),
  );
}
