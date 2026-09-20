import { io } from "../runtime.js";
import { canvasStore } from "../state/canvasStore.js";
import { recordActivity, studioState } from "../state/studio.js";

/** Sends the current Studio state (with the activity feed) to every dashboard. */
export function syncStudioToDashboards() {
  io.to("dashboard").emit("studio:sync", studioState(canvasStore));
}

/** Adds a line to the activity feed and refreshes the dashboards. */
export function logActivity(user: string, action: string) {
  recordActivity(canvasStore, user, action);
  syncStudioToDashboards();
}

/** Remembers whether the Twitch chat listener is connected, and tells the dashboards. */
export function setTwitchConnected(connected: boolean) {
  canvasStore.twitchConnected = connected;
  syncStudioToDashboards();
}
