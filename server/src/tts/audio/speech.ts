/** Turning a scene's dialogue into finished, loudness-balanced speech. */

import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { sceneIntensity, speechRequest } from "../casting.js";
import {
  RATE,
  channelFilter,
  finalWordTiming,
  layerUnderSpeech,
  muffle,
  normalizeLoudness,
  readWav,
  screamTone,
  tameSpikes,
  type Alignment,
} from "../dsp/index.js";
import type { Scene } from "../shared/scene.js";
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
  screamLayerScale,
  strainDbFor,
  toneAmountFor,
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
  const fitted = await fitToDuration(
    job,
    scene,
    index,
    decoded,
    readWav(await readFile(decoded)),
    generatedTiming,
  );

  const intensity = sceneIntensity(scene);
  let samples = normalizeLoudness(
    screamTone(fitted.samples, toneAmountFor(intensity)),
    SPEECH_TARGET_LUFS,
  );
  samples = await addScreamLayer(job, scene, index, samples);
  if (scene.muffled && muffleScale() > 0) {
    samples = tameSpikes(
      normalizeLoudness(muffle(samples, muffleScale()), SPEECH_TARGET_LUFS - MUFFLED_LEVEL_LU),
      SHOUTED_SPEECH_SPIKE_LU,
    );
  }
  return { samples, timing: fitted.timing };
}
