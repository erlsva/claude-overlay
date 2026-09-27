import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { interpretPrompt } from "./interpreter/index.js";
import { generateClip, voices, type GenerateRequest } from "./generate.js";
import { type Scene } from "./scene/index.js";
import type { TtsPlaybackState } from "../types.js";
import { createQueueGate, QueueCancelled } from "./queue.js";
import { deleteClip, getClip, type TtsClip } from "./store.js";
import { deleteUploadedClip, discordStorageConfigured } from "./discord.js";

export type TtsJob = {
  id: string;
  createdAt: string;
  status: "queued" | "running" | "complete" | "failed" | "cancelled";
  message: string;
  /** What was asked for, shortened, and who asked: shown in the dashboard's queue. */
  prompt: string;
  sender: string;
  /** Whether it will play on the overlay once made (false: it is only made and saved). */
  willPlay: boolean;
  /** How far a running request has got: being made, made and waiting for its turn, or playing. */
  stage?: "making" | "ready" | "playing";
  /** Held back right now: TTS is paused, or the silence between clips. */
  waiting?: boolean;
  /** Made for this request, not a replay of a saved clip, so removing the request deletes it. */
  generated?: boolean;
  clip?: TtsClip;
  error?: string;
  warning?: string;
};
export const jobs = new Map<string, TtsJob>();
const plans = new Map<
  string,
  { prompt: string; scenes: Scene[]; owner: string; expires: number }
>();
// Two tracks, each in the order requests came in. Making runs ahead of playing, even while TTS is
// paused, so a paused queue plays the moment it is resumed.
let makeChain: Promise<unknown> = Promise.resolve();
let playChain: Promise<unknown> = Promise.resolve();
let previews = 0;
/** The most requests that may be queued or being made at once, so a flood cannot grow the queue for ever. */
export const MAX_QUEUED = 100;
/**
 * How many made clips may wait for their turn at once. Making pauses at this many, so a flood of
 * requests while TTS is paused spends credits on at most this many clips (plus the one in hand).
 */
export const MAX_READY_AHEAD = 5;
/** Holds made clips while TTS is paused, and keeps some silence between clips. */
export const ttsQueue = createQueueGate();
const stateListeners = new Set<() => void>();
/** Calls `listener` whenever the playback state (paused, waiting, gap, what plays) may have changed. */
export function onTtsStateChange(listener: () => void) {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}
const stateChanged = () => {
  ttsQueue.nudge(); // whatever waits on the queue (making, playing) looks again
  for (const listener of [...stateListeners]) listener();
};
ttsQueue.subscribe(stateChanged);
const activeJobCount = () =>
  [...jobs.values()].filter((job) => job.status === "queued" || job.status === "running").length;
/** Requests that will play but are not playing yet: queued, being made, or made and waiting. */
export function waitingJobs(): TtsJob[] {
  return [...jobs.values()].filter(
    (job) =>
      job.willPlay &&
      (job.status === "queued" || (job.status === "running" && job.stage !== "playing")),
  );
}
const readyCount = () =>
  [...jobs.values()].filter(
    (job) => job.willPlay && job.status === "running" && job.stage === "ready",
  ).length;
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
/** Discord allows only a few webhook requests every couple of seconds. */
const DISCORD_DELETE_SPACING_MS = 450;
let discardChain: Promise<unknown> = Promise.resolve();
/**
 * Deletes the clip that was made for a request that is no longer wanted, so it does not linger in
 * the saved clips or on the public clip page. A replay of a saved clip is never deleted. Removing a
 * whole queue at once queues the deletions one after another, which keeps within Discord's rate
 * limit (and the local file store, which cannot delete two clips at the same moment).
 */
function discardClip(job: TtsJob): Promise<void> {
  const clip = job.clip;
  if (!job.generated || !clip) return Promise.resolve();
  job.clip = undefined;
  job.generated = false;
  const done = discardChain.then(async () => {
    try {
      if (discordStorageConfigured()) {
        await deleteUploadedClip(clip.discordMessageId);
        await sleep(DISCORD_DELETE_SPACING_MS);
      }
    } catch (error) {
      console.error("Could not delete the audio of a removed TTS request", error);
    }
    await deleteClip(clip.id).catch((error) =>
      console.error("Could not delete the record of a removed TTS request", error),
    );
  });
  discardChain = done;
  return done;
}
/** Takes a request out of the queue. False when it is already playing, or finished. */
export function removeWaitingJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || !waitingJobs().includes(job)) return false;
  job.status = "cancelled";
  job.waiting = false;
  job.message = "Removed from the queue";
  ttsQueue.wake();
  stateChanged();
  void discardClip(job); // a clip still being made is deleted when it is done
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
    if (job.status !== "cancelled") job.message = before;
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
let generator: (request: GenerateRequest) => Promise<TtsClip> = generateClip;
/** Lets tests stand in for OpenAI, ElevenLabs and Discord. Call with nothing to put them back. */
export function setTtsGenerator(next?: (request: GenerateRequest) => Promise<TtsClip>) {
  generator = next ?? generateClip;
}

/** How a request ended when it did not simply finish: removed from the queue, or failed. */
async function settleFailure(job: TtsJob, error: unknown) {
  if (error instanceof QueueCancelled) {
    job.status = "cancelled";
    job.message = "Removed from the queue";
    await discardClip(job);
    return;
  }
  job.status = "failed";
  job.error = error instanceof Error ? error.message : "TTS failed";
  job.message = "TTS failed";
}

/** The playing track: waits for the clip, for pausing to end and for the silence, then plays it. */
async function playWhenReady(
  job: TtsJob,
  made: Promise<TtsClip>,
  addWarning: (message: string) => void,
) {
  const gateJob = { cancelled: () => job.status === "cancelled" };
  let playbackFailed = false;
  try {
    const clip = await made;
    // Held here while TTS is paused, and until there has been enough silence since the last clip.
    // Time spent making the clip counts as silence.
    await waitOn(
      job,
      () => (ttsQueue.isHeld() ? "Made, waiting for TTS to be resumed" : "Waiting between clips"),
      ttsQueue.playWouldWait(),
      () => ttsQueue.beforePlay(gateJob),
    );
    job.stage = "playing";
    job.message = "Playing on overlay";
    stateChanged();
    try {
      if (!play) throw new Error("Overlay playback is unavailable.");
      await play(clip, overlayVolume);
    } catch (error) {
      playbackFailed = true;
      addWarning(error instanceof Error ? error.message : "Overlay playback failed.");
    } finally {
      ttsQueue.clipEnded();
    }
    job.status = "complete";
    job.message = playbackFailed
      ? "Clip saved; overlay playback was unavailable"
      : "Playback finished";
  } catch (error) {
    await settleFailure(job, error);
  } finally {
    stateChanged();
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
    willPlay: input.play,
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
  const addWarning = (message: string) => {
    job.warning = [job.warning, message].filter(Boolean).join(" ");
  };
  const gateJob = { cancelled: () => job.status === "cancelled" };

  // The making track: one clip at a time, ahead of playing and even while TTS is paused.
  const made = makeChain.then(async () => {
    if (job.status === "cancelled") throw new QueueCancelled(); // removed while it waited
    // Only so many made clips may wait for their turn: that bounds the credits spent on ones that
    // are then removed.
    if (input.play) await ttsQueue.waitUntil(gateJob, () => readyCount() < MAX_READY_AHEAD);
    job.status = "running";
    job.stage = "making";
    stateChanged();
    const token = replayId(input.prompt);
    let clip: TtsClip;
    if (token) {
      job.message = "Loading saved clip";
      const savedClip = await getClip(token);
      if (!savedClip) throw new Error("TTS token not found.");
      // The audio remains attributable in storage, while the live overlay
      // correctly identifies the person who chose to replay it now.
      clip = attributeReplay(savedClip, input.sender);
    } else {
      clip = await generator({
        prompt: input.prompt,
        sender: input.sender,
        prepared,
        progress: (message) => {
          if (job.status !== "cancelled") job.message = message;
        },
        warning: addWarning,
      });
      job.generated = true;
    }
    job.clip = clip;
    if (gateJob.cancelled()) {
      await discardClip(job); // removed while it was being made
      throw new QueueCancelled();
    }
    job.stage = "ready";
    job.message = "Made, waiting for its turn";
    stateChanged();
    return clip;
  });
  makeChain = made.then(
    () => {},
    () => {},
  );

  if (!input.play) {
    // Just make and save it: there is nothing to play.
    const completion = made.then(
      () => {
        job.status = "complete";
        job.message = "Clip saved";
        stateChanged();
      },
      async (error) => {
        await settleFailure(job, error);
        stateChanged();
      },
    );
    return { job, completion };
  }
  // The playing track: in the order requests came in, held by pausing and the silence between clips.
  const completion = playChain.then(() => playWhenReady(job, made, addWarning));
  playChain = completion.catch(() => {});
  return { job, completion };
}
