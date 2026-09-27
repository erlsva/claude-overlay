import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
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
import type { TtsPlaybackState } from "../types.js";
import { createQueueGate, QueueCancelled } from "./queue.js";
import { getClip, saveClip, type TtsClip } from "./store.js";
import { deleteUploadedClip, uploadClip } from "./discord.js";

export type TtsJob = {
  id: string;
  createdAt: string;
  status: "queued" | "running" | "complete" | "failed" | "cancelled";
  message: string;
  /** What was asked for, shortened, and who asked: shown in the dashboard's queue. */
  prompt: string;
  sender: string;
  /** True while the request is held back: TTS is paused, or the silence between clips. */
  waiting?: boolean;
  clip?: TtsClip;
  error?: string;
  warning?: string;
};
export const jobs = new Map<string, TtsJob>();
const plans = new Map<
  string,
  { prompt: string; scenes: Scene[]; owner: string; expires: number }
>();
let chain: Promise<unknown> = Promise.resolve();
let previews = 0;
/** The most requests that may be queued or being made at once, so a flood cannot grow the queue for ever. */
export const MAX_QUEUED = 100;
/** Holds requests while TTS is paused, and keeps some silence between clips. */
export const ttsQueue = createQueueGate();
const stateListeners = new Set<() => void>();
/** Calls `listener` whenever the playback state (paused, waiting, gap, what plays) may have changed. */
export function onTtsStateChange(listener: () => void) {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}
const stateChanged = () => {
  for (const listener of [...stateListeners]) listener();
};
ttsQueue.subscribe(stateChanged);
const activeJobCount = () =>
  [...jobs.values()].filter((job) => job.status === "queued" || job.status === "running").length;
/** Requests waiting for their turn: queued, or made and held back before playing. */
export function waitingJobs(): TtsJob[] {
  return [...jobs.values()].filter(
    (job) => job.status === "queued" || (job.status === "running" && job.waiting),
  );
}
let play: ((clip: TtsClip, volume: number) => Promise<void>) | undefined;
export type { TtsPlaybackState };
type PlaybackController = {
  stop: () => boolean;
  pause: () => boolean;
  resume: () => boolean;
  setVolume: (volume: number) => boolean;
  /** What the overlay is doing; the queue's own state is added by getTtsPlaybackState. */
  state: () => Pick<TtsPlaybackState, "active" | "paused" | "clipId" | "prompt" | "sender">;
};
let playbackController: PlaybackController | undefined;
export function setTtsPlayer(player: (clip: TtsClip, volume: number) => Promise<void>) {
  play = player;
}
let overlayOnline: (() => boolean) | undefined;
/** Lets the service refuse paid playback jobs while no overlay is connected. */
export function setTtsOverlayCheck(check: () => boolean) {
  overlayOnline = check;
}
export function setTtsPlaybackController(controller: PlaybackController) {
  playbackController = controller;
}
export function stopTtsPlayback() {
  return playbackController?.stop() ?? false;
}
export function pauseTtsPlayback() {
  return playbackController?.pause() ?? false;
}
export function resumeTtsPlayback() {
  return playbackController?.resume() ?? false;
}
/** One overlay volume for every clip, so chat-triggered and dashboard clips agree and it survives between clips. */
let overlayVolume = 0.25;
export function setTtsPlaybackVolume(volume: number) {
  const changed = overlayVolume !== volume;
  overlayVolume = volume;
  const live = playbackController?.setVolume(volume) ?? false;
  return changed || live;
}
export function getTtsPlaybackState(): TtsPlaybackState {
  return {
    active: false,
    paused: false,
    ...playbackController?.state(),
    held: ttsQueue.isHeld(),
    waiting: waitingJobs().length,
    gapSeconds: ttsQueue.gapSeconds(),
    volume: overlayVolume,
  };
}
/** Pauses (true) or resumes (false) TTS. While paused, requests are accepted and wait. */
export function setTtsHeld(held: boolean) {
  ttsQueue.setHeld(held);
}
/** Lets one waiting request through while paused. False when nothing is waiting. */
export function playNextTts(): boolean {
  return waitingJobs().length > 0 && ttsQueue.playNext();
}
export function setTtsGapSeconds(seconds: number) {
  ttsQueue.setGapSeconds(seconds);
}
/** Takes a waiting request out of the queue. False when it is already being made, or finished. */
export function removeWaitingJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || !waitingJobs().includes(job)) return false;
  job.status = "cancelled";
  job.waiting = false;
  job.message = "Removed from the queue";
  ttsQueue.wake();
  stateChanged();
  return true;
}
/** Removes every waiting request. Returns how many there were. */
export function clearWaitingJobs(): number {
  return waitingJobs().filter((job) => removeWaitingJob(job.id)).length;
}
/**
 * Runs a wait on the queue, showing on the request (and in the dashboard) that it is held back and
 * why. The reason follows the queue: pausing while a clip waits out the silence changes it.
 */
async function waitOn<T>(
  job: TtsJob,
  reason: () => string,
  wouldWait: boolean,
  wait: () => Promise<T>,
): Promise<T> {
  if (!wouldWait) return wait();
  const before = job.message;
  job.waiting = true;
  job.message = reason();
  const stopFollowing = ttsQueue.subscribe(() => (job.message = reason()));
  stateChanged();
  try {
    return await wait();
  } finally {
    stopFollowing();
    job.waiting = false;
    job.message = before;
    stateChanged();
  }
}
export function replayId(text: string) {
  return text
    .trim()
    .match(/^\(?TTS:([a-f0-9]{32})\)?$/i)?.[1]
    .toLowerCase();
}
export function attributeReplay(clip: TtsClip, sender: string): TtsClip {
  return { ...clip, sender: sender.slice(0, 100) };
}
async function voices() {
  const data = (await (await eleven("voices", process.env.ELEVENLABS_API_KEY || "")).json()) as {
    voices: AccountVoice[];
  };
  return data.voices;
}
export async function preview(prompt: string, owner: string) {
  z.string().trim().min(1).max(6000).parse(prompt);
  if (previews >= 2) throw new Error("Two previews are already running. Please wait.");
  previews++;
  try {
    const plan = await interpretPrompt(prompt, process.env.OPENAI_API_KEY || "", await voices());
    for (const [id, p] of plans) if (p.expires < Date.now()) plans.delete(id);
    if (plans.size >= 100) plans.delete(plans.keys().next().value!);
    const planId = randomUUID();
    plans.set(planId, {
      prompt,
      scenes: plan.scenes,
      owner,
      expires: Date.now() + 15 * 60 * 1000,
    });
    return { planId, ...plan };
  } finally {
    previews--;
  }
}
export function submit(input: {
  prompt: string;
  sender: string;
  owner: string;
  planId?: string;
  play: boolean;
}) {
  z.string().trim().min(1).max(6000).parse(input.prompt);
  // Nothing can play without an open overlay, so refuse before any credits are spent.
  if (input.play && overlayOnline && !overlayOnline())
    throw new Error(
      "The overlay is not open, so nothing would play. Open the overlay and try again. No credits were spent.",
    );
  if (activeJobCount() >= MAX_QUEUED)
    throw new Error(
      `The TTS queue is full (${MAX_QUEUED} waiting). Skip or clear some, then try again.`,
    );
  let prepared: Scene[] | undefined;
  if (input.planId) {
    const p = plans.get(input.planId);
    if (!p || p.owner !== input.owner || p.prompt !== input.prompt || p.expires < Date.now())
      throw new Error("Preview expired or prompt changed. Preview again.");
    prepared = p.scenes;
  }
  const job: TtsJob = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "queued",
    message: "Waiting in TTS queue",
    prompt: input.prompt.slice(0, 300),
    sender: input.sender.slice(0, 100),
  };
  jobs.set(job.id, job);
  stateChanged();
  if (jobs.size > 100)
    for (const [id, j] of jobs) {
      if (j.status === "complete" || j.status === "failed") {
        jobs.delete(id);
        break;
      }
    }
  const completion = chain.then(async () => {
    if (job.status === "cancelled") return; // removed while waiting for its turn
    job.status = "running";
    stateChanged();
    let temp: string | undefined;
    let playbackFailed = false;
    let manual = false;
    const gateJob = { cancelled: () => job.status === "cancelled" };
    const addWarning = (message: string) => {
      job.warning = [job.warning, message].filter(Boolean).join(" ");
    };
    try {
      // Nothing is made (and no credits are spent) while TTS is paused: the request waits here.
      if (input.play)
        manual = await waitOn(
          job,
          () => "Waiting for TTS to be resumed",
          ttsQueue.turnWouldWait(),
          () => ttsQueue.turn(gateJob),
        );
      const token = replayId(input.prompt);
      let clip: TtsClip | undefined;
      if (token) {
        job.message = "Loading saved clip";
        const savedClip = await getClip(token);
        if (!savedClip) throw new Error("TTS token not found.");
        // The audio remains attributable in storage, while the live overlay
        // correctly identifies the person who chose to replay it now.
        clip = attributeReplay(savedClip, input.sender);
      } else {
        if (
          !process.env.OPENAI_API_KEY ||
          !process.env.ELEVENLABS_API_KEY ||
          !process.env.DISCORD_TTS_WEBHOOK_URL
        )
          throw new Error("Configure OpenAI, ElevenLabs and Discord TTS server keys first.");
        // Confirm persistent storage is available before spending generation credits.
        await getClip("storage-check");
        job.message = "Interpreting performance";
        const catalog = await voices();
        const scenes = scenesSchema.parse(
          prepared ||
            (await interpretPrompt(input.prompt, process.env.OPENAI_API_KEY, catalog)).scenes,
        );
        temp = await mkdtemp(path.join(os.tmpdir(), "overlay-tts-"));
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
          progress: (message) => {
            job.message = message;
          },
          warning: addWarning,
        });
        job.message = "Encoding and saving to Discord";
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
          prompt: input.prompt,
          sender: input.sender.slice(0, 100),
          createdAt: new Date().toISOString(),
          duration,
        };
        const bytes = await readFile(mp3);
        // The waveform is only decoration for the public clip page, so a failure here must never
        // lose the clip; it is simply left out (and can be filled in later).
        const peaks = await peaksOfMp3(bytes).catch(() => undefined);
        const discordMessageId = await uploadClip(bytes, metadata);
        clip = { ...metadata, discordMessageId, ...(peaks ? { peaks } : {}) };
        try {
          await saveClip(clip);
        } catch (error) {
          await deleteUploadedClip(discordMessageId).catch(() => {});
          throw error;
        }
      }
      job.clip = clip;
      if (input.play) {
        // Held here if TTS was paused while this was being made, and until there has been enough
        // silence since the last clip. Time spent making the clip counts as silence.
        await waitOn(
          job,
          () =>
            ttsQueue.isHeld() ? "Made, waiting for TTS to be resumed" : "Waiting between clips",
          ttsQueue.playWouldWait(),
          () => ttsQueue.beforePlay(gateJob, manual),
        );
        job.message = "Playing on overlay";
        try {
          if (!play) throw new Error("Overlay playback is unavailable.");
          await play(clip, overlayVolume);
        } catch (error) {
          playbackFailed = true;
          addWarning(error instanceof Error ? error.message : "Overlay playback failed.");
        } finally {
          ttsQueue.clipEnded();
        }
      }
      job.status = "complete";
      job.message = input.play
        ? playbackFailed
          ? "Clip saved; overlay playback was unavailable"
          : "Playback finished"
        : "Clip saved";
    } catch (e) {
      if (e instanceof QueueCancelled) {
        job.status = "cancelled";
        job.message = "Removed from the queue";
      } else {
        job.status = "failed";
        job.error = e instanceof Error ? e.message : "TTS failed";
        job.message = "TTS failed";
      }
    } finally {
      stateChanged();
      if (temp) await rm(temp, { recursive: true, force: true });
    }
  });
  chain = completion.catch(() => {});
  return { job, completion };
}
