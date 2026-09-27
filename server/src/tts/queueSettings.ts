import { saveTtsQueueSettings } from "../db/index.js";
import { getTtsPlaybackState, ttsQueue } from "./service.js";

/** Saves whether TTS is paused, the silence, and the two overlay switches, exactly as they now are. */
export function persistTtsQueueSettings(): Promise<void> {
  const state = getTtsPlaybackState();
  return saveTtsQueueSettings({
    held: ttsQueue.isHeld(),
    gapSeconds: ttsQueue.gapSeconds(),
    showEmote: state.showEmote,
    showPrompt: state.showPrompt,
  });
}
