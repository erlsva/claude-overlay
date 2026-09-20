/** Rendering a whole clip: each scene becomes speech and/or a sound effect, is shaped by its effect, and the scenes are joined. */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { RATE, effectTail, finish, softLimit, tameSpikes, writeWav } from "../dsp/index.js";
import type { Scene } from "../scene/index.js";
import { isSharpSound } from "../sound.js";
import {
  errorText,
  sceneLabel,
  type RenderJob,
  type RenderOptions,
  type WordTiming,
} from "./job.js";
import { renderSound } from "./soundEffect.js";
import { renderSpeech, type RenderedSpeech } from "./speech.js";
import { SHARP_SOUND_SPIKE_LU, SOUND_SPIKE_LU } from "./tuning.js";

/** Applies the scene's echo/reverb to its speech or sound, then lays any sound under the speech. */
function mixScene(
  job: RenderJob,
  scene: Scene,
  index: number,
  speech: RenderedSpeech | null,
  sound: Float32Array | null,
): Float32Array {
  const { opts } = job;
  opts.progress(
    `${sceneLabel(job, index)}: applying ${scene.channel === "intercom" ? "intercom and " : ""}${scene.effect} / ${scene.duration ?? "natural"}s`,
  );
  const timing: WordTiming | null = speech?.timing ?? null;
  let segment: Float32Array;
  try {
    segment = effectTail(speech?.samples || sound!, scene, timing, (natural, requested) => {
      opts.warning?.(
        `Scene ${index + 1} was requested as ${requested}s, but the generated ${speech ? "speech" : "sound"} naturally needed ${natural.toFixed(1)}s. The full audio was kept instead of being discarded${scene.effect !== "none" ? ", leaving less time for the effect decay" : ""}.`,
      );
    });
  } catch (error) {
    throw new Error(
      `Scene ${index + 1} audio processing failed: ${errorText(error, "The scene could not be processed.")}`,
    );
  }
  if (speech && sound) {
    if (!scene.duration && sound.length > segment.length) {
      const expanded = new Float32Array(sound.length);
      expanded.set(segment);
      segment = expanded;
    }
    for (let i = 0; i < Math.min(segment.length, sound.length); i++)
      segment[i] += sound[i] * scene.backgroundVolume;
  }
  // Echoes and a room can stack up beyond the raw sound. Hold a finished sound effect to the
  // same comfort limit as the sound it was built from, then bend any single loud sample: a
  // brief peak is what stabs even when the loudness is fine.
  if (!speech && sound) {
    const limit = isSharpSound(scene.sound) ? SHARP_SOUND_SPIKE_LU : SOUND_SPIKE_LU;
    segment = softLimit(tameSpikes(segment, limit), 0.72, 0.5);
  }
  return finish(segment);
}

async function renderScene(job: RenderJob, scene: Scene, index: number): Promise<Float32Array> {
  if (scene.sound === "__silence__" && !scene.dialogue.trim()) {
    const seconds = scene.duration ?? 1;
    job.opts.progress(`${sceneLabel(job, index)}: adding ${seconds}s pause`);
    return new Float32Array(Math.round(seconds * RATE));
  }
  job.opts.progress(`${sceneLabel(job, index)}: generating dry audio`);
  const speech = scene.dialogue.trim() ? await renderSpeech(job, scene, index) : null;
  const sound = scene.sound.trim() ? await renderSound(job, scene, index, !!speech) : null;
  return mixScene(job, scene, index, speech, sound);
}

/** Renders the scenes in order into one WAV at <dataDir>/clips/<id>.wav and returns its length in seconds. */
export async function renderAudio(opts: RenderOptions) {
  const job: RenderJob = { opts, temp: path.join(opts.dataDir, "work", opts.id) };
  await mkdir(job.temp, { recursive: true });
  const output = path.join(opts.dataDir, "clips", `${opts.id}.wav`);
  let complete = false;
  try {
    const segments: Float32Array[] = [];
    for (const [index, scene] of opts.scenes.entries())
      segments.push(await renderScene(job, scene, index));

    opts.progress("Saving the finished clip");
    const samples = new Float32Array(segments.reduce((sum, s) => sum + s.length, 0));
    let offset = 0;
    for (const segment of segments) {
      samples.set(segment, offset);
      offset += segment.length;
    }
    await writeFile(output, writeWav(samples));
    complete = true;
    return samples.length / RATE;
  } finally {
    await rm(job.temp, { recursive: true, force: true });
    if (!complete) await rm(output, { force: true });
  }
}
