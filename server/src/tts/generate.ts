/**
 * Making a new clip from a prompt: the paid part (OpenAI to plan it, ElevenLabs to voice it), then
 * encoding, storing and saving it. The queue in service.ts decides when this runs.
 */
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { interpretPrompt } from "./interpreter/index.js";
import {
  eleven,
  FINAL_SOUND_EFFECT_FILTER,
  FINAL_TTS_FILTER,
  peaksOfMp3,
  renderAudio,
  run,
} from "./audio/index.js";
import { castScenes, type AccountVoice } from "./casting/index.js";
import { scenesSchema, type Scene } from "./scene/index.js";
import { getClip, saveClip, type TtsClip } from "./store.js";
import { deleteUploadedClip, uploadClip } from "./discord.js";

export async function voices() {
  const data = (await (await eleven("voices", process.env.ELEVENLABS_API_KEY || "")).json()) as {
    voices: AccountVoice[];
  };
  return data.voices;
}

export type GenerateRequest = {
  prompt: string;
  sender: string;
  prepared?: Scene[];
  progress: (message: string) => void;
  warning: (message: string) => void;
};

/** Makes a clip from a prompt with OpenAI and ElevenLabs, and saves it. */
export async function generateClip(request: GenerateRequest): Promise<TtsClip> {
  if (
    !process.env.OPENAI_API_KEY ||
    !process.env.ELEVENLABS_API_KEY ||
    !process.env.DISCORD_TTS_WEBHOOK_URL
  )
    throw new Error("Configure OpenAI, ElevenLabs and Discord TTS server keys first.");
  // Confirm persistent storage is available before spending generation credits.
  await getClip("storage-check");
  request.progress("Interpreting performance");
  const catalog = await voices();
  const scenes = scenesSchema.parse(
    request.prepared ||
      (await interpretPrompt(request.prompt, process.env.OPENAI_API_KEY, catalog)).scenes,
  );
  const temp = await mkdtemp(path.join(os.tmpdir(), "overlay-tts-"));
  try {
    await mkdir(path.join(temp, "clips"));
    const id = randomUUID().replaceAll("-", "");
    const duration = await renderAudio({
      id,
      scenes,
      mode: "elevenlabs",
      key: process.env.ELEVENLABS_API_KEY,
      voices: {},
      casting: castScenes(scenes, catalog),
      dataDir: temp,
      progress: request.progress,
      warning: request.warning,
    });
    request.progress("Encoding and saving to Discord");
    const mp3 = path.join(temp, `${id}.mp3`);
    const containsSpeech = scenes.some((scene) => scene.dialogue.trim());
    await run([
      "-i",
      path.join(temp, "clips", `${id}.wav`),
      "-af",
      containsSpeech ? FINAL_TTS_FILTER : FINAL_SOUND_EFFECT_FILTER,
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "128k",
      mp3,
    ]);
    const metadata = {
      id,
      token: `(TTS:${id})`,
      prompt: request.prompt,
      sender: request.sender.slice(0, 100),
      createdAt: new Date().toISOString(),
      duration,
    };
    const bytes = await readFile(mp3);
    // The waveform is only decoration for the public clip page, so a failure here must never
    // lose the clip; it is simply left out (and can be filled in later).
    const peaks = await peaksOfMp3(bytes).catch(() => undefined);
    const discordMessageId = await uploadClip(bytes, metadata);
    const clip = { ...metadata, discordMessageId, ...(peaks ? { peaks } : {}) };
    try {
      await saveClip(clip);
    } catch (error) {
      await deleteUploadedClip(discordMessageId).catch(() => {});
      throw error;
    }
    return clip;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
