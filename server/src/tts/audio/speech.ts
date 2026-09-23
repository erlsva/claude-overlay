/** Turning a scene's dialogue into finished, loudness-balanced speech. */

import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { sceneIntensity, speechRequest } from "../casting/index.js";
import {
  RATE,
  channelFilter,
  finalWordTiming,
  layerUnderSpeech,
  muffle,
  normalizeLoudness,
  pitchTempoRatio,
  readWav,
  resampleRatio,
  robotize,
  screamTone,
  submerge,
  tameSpikes,
  writeWav,
  type Alignment,
} from "../dsp/index.js";
import type { Scene } from "../scene/index.js";
import { screamLayerPrompt } from "../sound.js";
import { eleven } from "./elevenlabs.js";
import { atempoFilters, decodeToWav, run } from "./ffmpeg.js";
import { errorText, sceneLabel, type RenderJob, type WordTiming } from "./job.js";
import { speechTempo } from "./timing.js";
import {
  MUFFLED_LEVEL_LU,
  SCREAM_LAYER_GAIN,
  SHOUTED_SPEECH_SPIKE_LU,
  SHOUT_LAYER_GAIN,
  SPEECH_TARGET_LUFS,
  muffleScale,
  robotScale,
  screamLayerScale,
  strainDbFor,
  toneAmountFor,
  underwaterScale,
} from "./tuning.js";

export type RenderedSpeech = { samples: Float32Array; timing: WordTiming | null };

/** A sine tone standing in for a voice, so the whole pipeline can be tried without credits. */
async function demoSpeechFile(scene: Scene, file: string) {
  const length = Math.min(8, Math.max(1, scene.dialogue.length / 16));
  const frequency = scene.voice === "voice1" ? 220 : 330;
  await run([
    ...["-f", "lavfi", "-i", `sine=frequency=${frequency}:sample_rate=44100:duration=${length}`],
    ...["-af", "volume=0.2", file],
  ]);
  return { start: Math.max(0, length - 0.3), end: length };
}

type ProviderPayload = {
  audio_base64: string;
  alignment?: Alignment;
  normalized_alignment?: Alignment;
};

/** Asks ElevenLabs to speak the scene and saves the mp3; returns where the last word sits. */
async function elevenSpeechFile(job: RenderJob, scene: Scene, index: number, file: string) {
  const { opts } = job;
  const voiceId = opts.casting?.find((c) => c.scene === index)?.voiceId || opts.voices[scene.voice];
  if (!voiceId) throw new Error("No voice could be selected for this scene.");
  let response: Response;
  try {
    response = await eleven(
      `text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
      opts.key,
      speechRequest(scene),
    );
  } catch (error) {
    throw new Error(
      `Scene ${index + 1} speech generation failed: ${errorText(error, "ElevenLabs request failed.")}`,
    );
  }
  const payload = (await response.json()) as ProviderPayload;
  if (!payload.audio_base64) throw new Error("ElevenLabs returned no speech audio.");
  await writeFile(file, Buffer.from(payload.audio_base64, "base64"));
  return finalWordTiming(payload.normalized_alignment) || finalWordTiming(payload.alignment);
}

/**
 * chipmunk/slowmo: resamples the decoded speech by a fixed pitch+tempo ratio, like a tape
 * played at the wrong speed. Applied before duration-fitting, so the fit (if any) works on
 * the already-warped length; the alignment timing is scaled the same way so echo/reverb still
 * lands on the true end of the (now faster or slower) words.
 */
async function warpedSpeech(
  job: RenderJob,
  index: number,
  decoded: string,
  samples: Float32Array,
  timing: WordTiming | null,
  scene: Scene,
): Promise<{ path: string; samples: Float32Array; timing: WordTiming | null }> {
  const ratio = pitchTempoRatio(scene.voiceEffect);
  if (!ratio) return { path: decoded, samples, timing };
  const warped = resampleRatio(samples, ratio);
  const warpedPath = path.join(job.temp, `${index}-speech-warped.wav`);
  await writeFile(warpedPath, writeWav(warped));
  return {
    path: warpedPath,
    samples: warped,
    timing: timing && { start: timing.start / ratio, end: timing.end / ratio },
  };
}

/**
 * When the scene has a stated duration and the speech runs longer, speed it up (never more
 * than 1.25x) instead of cutting words. The decoded file is measured, not the provider's
 * timings, because those can finish before the real waveform does.
 */
async function fitToDuration(
  job: RenderJob,
  scene: Scene,
  index: number,
  decoded: string,
  speech: Float32Array,
  timing: WordTiming | null,
): Promise<RenderedSpeech> {
  const tempo = scene.speechRate ?? speechTempo(scene, speech.length / RATE);
  if (!timing || Math.abs(tempo - 1) <= 0.001) return { samples: speech, timing };
  const fitted = path.join(job.temp, `${index}-speech-fitted.wav`);
  await decodeToWav(decoded, fitted, atempoFilters(tempo).join(","));
  return {
    samples: readWav(await readFile(fitted)),
    timing: { start: timing.start / tempo, end: timing.end / tempo },
  };
}

/**
 * Optional (TTS_SCREAM_LAYER): a generated wordless scream mixed under the voice. If it fails
 * the voice alone is used, since it has already been paid for.
 */
async function addScreamLayer(
  job: RenderJob,
  scene: Scene,
  index: number,
  speech: Float32Array,
): Promise<Float32Array> {
  const intensity = sceneIntensity(scene);
  const layerScale = screamLayerScale();
  if (job.opts.mode !== "elevenlabs" || intensity === "normal" || layerScale <= 0) return speech;
  try {
    job.opts.progress(
      `${sceneLabel(job, index)}: adding ${intensity === "scream" ? "scream" : "shout"} texture`,
    );
    const layerRaw = path.join(job.temp, `${index}-layer.mp3`);
    const layerDecoded = path.join(job.temp, `${index}-layer.wav`);
    const seconds = Math.min(30, Math.max(0.5, Math.ceil((speech.length / RATE) * 10) / 10));
    const response = await eleven("sound-generation", job.opts.key, {
      text: screamLayerPrompt(scene.character, intensity),
      duration_seconds: seconds,
      model_id: "eleven_text_to_sound_v2",
      prompt_influence: 0.7,
    });
    await writeFile(layerRaw, Buffer.from(await response.arrayBuffer()));
    // Keep only the body of the scream, so it thickens the voice instead of adding a shriek on top.
    await decodeToWav(layerRaw, layerDecoded, "aresample=44100,highpass=f=180,lowpass=f=4000");
    const gain = (intensity === "scream" ? SCREAM_LAYER_GAIN : SHOUT_LAYER_GAIN) * layerScale;
    const layered = normalizeLoudness(
      layerUnderSpeech(speech, readWav(await readFile(layerDecoded)), gain),
      SPEECH_TARGET_LUFS,
    );
    return tameSpikes(layered, SHOUTED_SPEECH_SPIKE_LU);
  } catch (error) {
    job.opts.warning?.(
      `Scene ${index + 1}: the ${intensity} texture could not be added (${errorText(error, "request failed")}), so the voice alone was used.`,
    );
    return speech;
  }
}

export async function renderSpeech(
  job: RenderJob,
  scene: Scene,
  index: number,
): Promise<RenderedSpeech> {
  const raw = path.join(job.temp, `${index}-speech.mp3`);
  const decoded = path.join(job.temp, `${index}-speech.wav`);
  const generatedTiming =
    job.opts.mode === "demo"
      ? await demoSpeechFile(scene, raw)
      : await elevenSpeechFile(job, scene, index, raw);

  const pinned = !!job.opts.casting?.find((c) => c.scene === index)?.pinned;
  await decodeToWav(
    raw,
    decoded,
    channelFilter(scene, { pitchShift: !pinned, strainDb: strainDbFor(sceneIntensity(scene)) }),
  );
  const warped = await warpedSpeech(
    job,
    index,
    decoded,
    readWav(await readFile(decoded)),
    generatedTiming,
    scene,
  );
  const fitted = await fitToDuration(job, scene, index, warped.path, warped.samples, warped.timing);

  const intensity = sceneIntensity(scene);
  let samples = normalizeLoudness(
    screamTone(fitted.samples, toneAmountFor(intensity)),
    SPEECH_TARGET_LUFS,
  );
  samples = await addScreamLayer(job, scene, index, samples);
  if (scene.voiceEffect === "robot") samples = robotize(samples, robotScale());
  if (scene.voiceEffect === "underwater") samples = submerge(samples, underwaterScale());
  if (scene.muffled && muffleScale() > 0) {
    samples = tameSpikes(
      normalizeLoudness(muffle(samples, muffleScale()), SPEECH_TARGET_LUFS - MUFFLED_LEVEL_LU),
      SHOUTED_SPEECH_SPIKE_LU,
    );
  }
  return { samples, timing: fitted.timing };
}
