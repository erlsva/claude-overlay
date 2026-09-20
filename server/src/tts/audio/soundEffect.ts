/** Turning a scene's sound description into a finished, loudness-balanced sound effect. */

import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { muffle, normalizeLoudness, readWav, tameSpikes } from "../dsp/index.js";
import type { Scene } from "../scene/index.js";
import { buildSoundPrompt, isSharpSound, soundDecodeFilter } from "../sound.js";
import { eleven } from "./elevenlabs.js";
import { decodeToWav, run } from "./ffmpeg.js";
import { errorText, type RenderJob } from "./job.js";
import { activeSoundDuration } from "./timing.js";
import {
  MUFFLED_LEVEL_LU,
  SHARP_SOUND_SPIKE_LU,
  SOUND_ONLY_TARGET_LUFS,
  SOUND_SPIKE_LU,
  SPEECH_TARGET_LUFS,
  muffleScale,
} from "./tuning.js";

/** Pink noise standing in for a sound effect, so the pipeline can be tried without credits. */
async function demoSoundFile(seconds: number, file: string) {
  await run([
    ...["-f", "lavfi", "-i", `anoisesrc=color=pink:sample_rate=44100:duration=${seconds}`],
    ...["-af", "volume=0.12", file],
  ]);
}

async function elevenSoundFile(
  job: RenderJob,
  scene: Scene,
  index: number,
  seconds: number,
  file: string,
) {
  let response: Response;
  try {
    response = await eleven("sound-generation", job.opts.key, {
      text: buildSoundPrompt(scene.sound),
      duration_seconds: seconds,
      model_id: "eleven_text_to_sound_v2",
      prompt_influence: 0.6,
    });
  } catch (error) {
    throw new Error(
      `Scene ${index + 1} sound generation failed: ${errorText(error, "ElevenLabs request failed.")}`,
    );
  }
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
}

export async function renderSound(
  job: RenderJob,
  scene: Scene,
  index: number,
  hasSpeech: boolean,
): Promise<Float32Array> {
  const raw = path.join(job.temp, `${index}-sound.mp3`);
  const decoded = path.join(job.temp, `${index}-sound.wav`);
  // Standalone echo needs a dry burst and room for its repeats, not eight seconds of pre-echoed noise.
  const seconds = activeSoundDuration(scene, hasSpeech);
  if (job.opts.mode === "demo") await demoSoundFile(seconds, raw);
  else await elevenSoundFile(job, scene, index, seconds, raw);
  await decodeToWav(raw, decoded, soundDecodeFilter(scene.sound));

  // Sharp effects keep extra headroom: their spikes, not their average, are what hurts.
  const sharp = isSharpSound(scene.sound);
  let sound = normalizeLoudness(
    readWav(await readFile(decoded)),
    (hasSpeech ? SPEECH_TARGET_LUFS : SOUND_ONLY_TARGET_LUFS) - (sharp ? 2 : 0),
    24,
    sharp ? 0.45 : 0.6,
  );
  sound = tameSpikes(sound, sharp ? SHARP_SOUND_SPIKE_LU : SOUND_SPIKE_LU);
  if (scene.muffled && !hasSpeech && muffleScale() > 0) {
    sound = normalizeLoudness(
      muffle(sound, muffleScale()),
      SOUND_ONLY_TARGET_LUFS - MUFFLED_LEVEL_LU,
      24,
      0.5,
    );
  }
  return sound;
}
