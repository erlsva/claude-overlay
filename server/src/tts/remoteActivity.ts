/**
 * Turning a remote-control request into something the streamer can actually see happen: a line in
 * the dashboard's own Activity feed, named after the token that sent it. This is separate from the
 * server-console logging in `remote.ts` (meant for watching Render's logs while debugging a
 * button's setup) — this is for confirming, from inside the dashboard itself and with no server
 * access needed, that a button reached the server at all and what it did.
 */

import { recordActivity, studioState } from "../state/studio.js";
import { canvasStore } from "../state/canvasStore.js";
import type { AppServer } from "../socket/types.js";

/** The parts of a remote response `describeRemoteAction` reads to write a natural sentence. */
interface RemoteStateSnapshot {
  held: boolean;
  paused?: boolean;
  volume?: number;
  emotes: { enabled: boolean; direction: "left" | "right"; size: number; motion: string };
}

/**
 * A natural-language line for the activity feed, or `undefined` for an action not worth showing
 * there (a read like `status` changes nothing, and a poll fires every few seconds).
 */
export function describeRemoteAction(
  action: string,
  changed: boolean,
  value: number | undefined,
  state: RemoteStateSnapshot,
): string | undefined {
  const pct = (fraction: number | undefined) => Math.round((fraction ?? 0) * 100);
  switch (action) {
    case "pause-tts":
      return changed ? "paused TTS" : "tried to pause TTS, but it was already paused";
    case "resume-tts":
      return changed ? "resumed TTS" : "tried to resume TTS, but it wasn't paused";
    case "toggle-tts":
      return state.held ? "paused TTS" : "resumed TTS";
    case "play-next":
      return changed
        ? "let the next TTS request through"
        : "pressed Play Next, but nothing is waiting";
    case "pause-clip":
      return changed
        ? "paused the TTS clip"
        : "tried to pause the TTS clip, but nothing is playing";
    case "resume-clip":
      return changed
        ? "resumed the TTS clip"
        : "tried to resume the TTS clip, but nothing is paused";
    case "toggle-clip":
      return changed
        ? state.paused
          ? "paused the TTS clip"
          : "resumed the TTS clip"
        : "tried to pause or resume the TTS clip, but nothing is playing";
    case "skip":
      return changed ? "skipped the TTS clip" : "pressed Skip, but nothing was playing";
    case "restart":
      return changed
        ? "replayed the TTS clip from the start"
        : "pressed Play From Start, but nothing was playing";
    case "volume":
      return changed
        ? `set the TTS volume to ${pct(state.volume)}%`
        : `the TTS volume was already ${pct(value)}%`;
    case "volume-up":
      return changed
        ? `raised the TTS volume to ${pct(state.volume)}%`
        : "the TTS volume was already at its maximum";
    case "volume-down":
      return changed
        ? `lowered the TTS volume to ${pct(state.volume)}%`
        : "the TTS volume was already at its minimum";
    case "emotes-on":
      return changed ? "turned the chat emote overlay on" : "the chat emote overlay was already on";
    case "emotes-off":
      return changed
        ? "turned the chat emote overlay off"
        : "the chat emote overlay was already off";
    case "toggle-emotes":
      return state.emotes.enabled
        ? "turned the chat emote overlay on"
        : "turned the chat emote overlay off";
    case "toggle-emote-direction":
      return `changed the chat emote direction to ${state.emotes.direction}`;
    case "emote-size-up":
      return changed
        ? `set the chat emote size to ${state.emotes.size}`
        : "the chat emote size was already at its maximum";
    case "emote-size-down":
      return changed
        ? `set the chat emote size to ${state.emotes.size}`
        : "the chat emote size was already at its minimum";
    case "emote-style-next":
    case "emote-style-previous":
      return `set the chat emote style to "${state.emotes.motion}"`;
    default:
      return undefined;
  }
}

/** Adds the line to the activity feed and tells every dashboard, the same way a Studio edit does. */
export function recordRemoteActivity(io: AppServer, holderName: string, description: string) {
  recordActivity(canvasStore, holderName, description, "remote");
  io.to("dashboard").emit("studio:sync", studioState(canvasStore));
}
