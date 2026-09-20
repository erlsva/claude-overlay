import { randomUUID } from "crypto";
import type { CanvasStore } from "./canvasStore.js";

const ACTIVITY_LIMIT = 50;

/** What a dashboard needs to show the Studio: scenes, presets, sounds, triggers and the activity feed. */
export function studioState(store: CanvasStore) {
  return {
    scenes: store.scenes,
    presets: store.presets,
    sounds: store.sounds,
    triggers: store.triggers,
    activity: store.activity,
    twitchConnected: store.twitchConnected,
  };
}

/** Adds a line to the activity feed, newest first, keeping only the most recent. */
export function recordActivity(store: CanvasStore, user: string, action: string) {
  store.activity.unshift({ id: randomUUID(), at: new Date().toISOString(), user, action });
  store.activity = store.activity.slice(0, ACTIVITY_LIMIT);
}
