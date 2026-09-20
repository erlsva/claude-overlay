/** Running the actions of an automation: showing layers, playing media and sounds, chat and TTS. */

import { randomUUID } from "crypto";
import { getFeatureFlags } from "../db/index.js";
import { flyElement } from "../playback/fly.js";
import { waitForMediaEnd } from "../playback/media.js";
import { presentElement, restorePresentation } from "../playback/presentation.js";
import { expectSoundEnd, forgetSound } from "../playback/soundWaiters.js";
import { io } from "../runtime.js";
import { canvasStore } from "../state/canvasStore.js";
import { submit as submitTts } from "../tts/service.js";
import type { CanvasElement, TriggerStep } from "../types.js";
import { sendEventChatMessage } from "./chat.js";
import { renderEventMessage, type TriggerEventPayload } from "./message.js";

const DEFAULT_SECONDS = 5;
const SOUND_GIVE_UP_MS = 10 * 60 * 1000;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Sends the streamer's chat message when TTS fails, without letting that failure hide the real one. */
async function tellChatTtsFailed(step: TriggerStep, event: TriggerEventPayload) {
  if (!step.ttsErrorMessage) return;
  await sendEventChatMessage({ action: "send-chat", chatMessage: step.ttsErrorMessage }, event);
}

/** Generates and plays TTS for an event; resolves when it has finished playing. */
function runTts(step: TriggerStep, event: TriggerEventPayload): Promise<void> {
  if (!getFeatureFlags().tts)
    return Promise.reject(new Error("TTS is currently disabled by the overlay owner"));
  const sender = String(event.chatter_user_name || event.user_name || event.user_login || "Twitch");
  const prompt = renderEventMessage(step.chatMessage || "{message}", event, 6000);
  try {
    const request = submitTts({ prompt, sender, owner: "trigger", play: true });
    return request.completion.then(async () => {
      if (request.job.status === "failed" || request.job.warning) {
        const failure = new Error(
          request.job.error || request.job.warning || "TTS generation failed",
        );
        try {
          await tellChatTtsFailed(step, event);
        } catch (chatError) {
          console.error("Could not send TTS failure message", chatError);
        }
        throw failure;
      }
    });
  } catch (error) {
    void tellChatTtsFailed(step, event).catch((chatError) =>
      console.error("Could not send TTS failure message", chatError),
    );
    return Promise.reject(error);
  }
}

/** Plays a soundboard clip on the overlay; resolves when the overlay reports it ended. */
function playSound(step: TriggerStep): Promise<void> {
  const sound = canvasStore.sounds.find((item) => item.id === step.targetId);
  if (!sound) return Promise.resolve();
  const playbackId = randomUUID();
  io.to("overlay").emit("sound:play", { ...sound, playbackId });
  return new Promise<void>((resolve) => {
    const giveUp = setTimeout(() => {
      forgetSound(playbackId);
      resolve();
    }, SOUND_GIVE_UP_MS);
    expectSoundEnd(playbackId, () => {
      clearTimeout(giveUp);
      resolve();
    });
  });
}

/** Changes that make a layer visible, hidden or bouncing like a DVD logo. */
function simpleChanges(step: TriggerStep, element: CanvasElement): Partial<CanvasElement> {
  const changes: Partial<CanvasElement> = {};
  if (step.action === "show-element") changes.visible = true;
  if (step.action === "hide-element") changes.visible = false;
  if (step.action === "toggle-element") changes.visible = !element.visible;
  if (step.action === "enable-dvd")
    Object.assign(changes, {
      dvdEnabled: true,
      dvdStartedAt: Date.now(),
      dvdStartX: element.x,
      dvdStartY: element.y,
      dvdVelocityX: 120 + Math.random() * 100,
      dvdVelocityY: (Math.random() > 0.5 ? 1 : -1) * (120 + Math.random() * 100),
    });
  return changes;
}

/** Actions that act on one canvas layer. */
function runElementAction(step: TriggerStep, element: CanvasElement): Promise<void> {
  const seconds = step.durationSeconds ?? DEFAULT_SECONDS;
  if (step.action === "play-media") {
    if (element.type !== "video" && element.type !== "audio") return Promise.resolve();
    presentElement(element, step.placement);
    element.autoVisibility = true;
    io.emit("element:updated", { id: element.id, changes: { autoVisibility: true } });
    io.emit("media:control", { id: element.id, action: "play", currentTime: 0 });
    return waitForMediaEnd(element.id);
  }
  if (step.action === "fly-across") {
    if (!["image", "gif", "video"].includes(element.type)) return Promise.resolve();
    flyElement(element, step.flyDirection, seconds);
    return delay(seconds * 1000);
  }
  if (step.action === "show-temporary") {
    if (!["image", "gif"].includes(element.type)) return Promise.resolve();
    const pending = presentElement(element, step.placement);
    if (pending) pending.timer = setTimeout(() => restorePresentation(element.id), seconds * 1000);
    return delay(seconds * 1000);
  }
  const changes = simpleChanges(step, element);
  Object.assign(element, changes);
  io.emit("element:updated", { id: element.id, changes });
  return Promise.resolve();
}

/** Runs one action; the promise resolves when the action is finished (media ended, time passed). */
export function executeTriggerStep(step: TriggerStep, event: TriggerEventPayload): Promise<void> {
  if (step.action === "tts") return runTts(step, event);
  if (step.action === "refresh-overlay") {
    io.emit("overlay:refresh");
    return Promise.resolve();
  }
  if (step.action === "send-chat") return sendEventChatMessage(step, event);
  if (step.action === "play-sound") return playSound(step);
  const element = canvasStore.canvasState.elements.find((item) => item.id === step.targetId);
  if (!element) return Promise.resolve();
  return runElementAction(step, element);
}

/**
 * Runs a trigger's steps in order. Each step starts straight away unless it asks to wait for
 * the previous one or for a delay. A failing step is reported and does not stop the others.
 */
export async function executeTriggerSteps(
  steps: TriggerStep[],
  event: TriggerEventPayload,
  onError?: (error: unknown) => void,
) {
  let previousCompletion = Promise.resolve();
  for (const step of steps) {
    if (step.timing === "after-previous") await previousCompletion;
    if (step.timing === "delay") await delay((step.delaySeconds ?? 1) * 1000);
    previousCompletion = executeTriggerStep(step, event).catch((error) => {
      console.error("Trigger action failed", error);
      onError?.(error);
    });
  }
}
