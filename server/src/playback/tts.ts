/**
 * Playing generated TTS on the overlay: one clip at a time, with pause, resume, stop and volume
 * for the dashboard. The TTS service asks for a clip to be played and waits until it ends.
 */

import { randomUUID } from "crypto";
import { publicServerUrl } from "../config/env.js";
import { activeOverlays, io } from "../runtime.js";
import {
  getTtsPlaybackState,
  setTtsOverlayCheck,
  setTtsPlaybackController,
  setTtsPlayer,
} from "../tts/service.js";
import { endSound, expectSoundEnd, forgetSound } from "./soundWaiters.js";

/** How long past the clip's own length to wait for the overlay to report it finished. */
const GRACE_MS = 15_000;
/** Pausing never leaves less than this to wait for the rest of the clip. */
const MIN_REMAINING_MS = 1_000;

interface ActivePlayback {
  clipId: string;
  playbackId: string;
  prompt: string;
  sender: string;
  paused: boolean;
  volume: number;
  pause: () => void;
  resume: () => void;
  setVolume: (volume: number) => void;
}

type Clip = Parameters<Parameters<typeof setTtsPlayer>[0]>[0];

let playbackEnabled = true;
let active: ActivePlayback | undefined;

const emitStatus = () => io.emit("tts:status", getTtsPlaybackState());

/** Tells the overlay to stop the clip and releases whoever waits for it to end. */
function stopOnOverlay(playback: ActivePlayback) {
  io.to("overlay").emit("sound:stop", { id: playback.clipId });
  endSound(playback.playbackId);
}

/** Plays one clip on the overlay; resolves when it ends, rejects if it fails. */
async function playClip(clip: Clip, volume: number) {
  if (!playbackEnabled) throw new Error("TTS playback is turned off.");
  if (!activeOverlays.size)
    throw new Error("The overlay is offline. Replay the saved clip once the overlay is open.");
  if (active) stopOnOverlay(active);
  const playbackId = randomUUID();

  await new Promise<void>((resolve, reject) => {
    let finished = false;
    let timer: NodeJS.Timeout | undefined;
    let remainingMs = Math.ceil(clip.duration * 1000) + GRACE_MS;
    let timerStartedAt = Date.now();
    const isCurrent = () => active?.playbackId === playbackId;

    const finish = (error?: string) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      forgetSound(playbackId);
      if (isCurrent()) active = undefined;
      emitStatus();
      error ? reject(new Error(error)) : resolve();
    };
    const schedule = () => {
      timerStartedAt = Date.now();
      timer = setTimeout(finish, remainingMs);
    };
    const pause = () => {
      if (!isCurrent() || active!.paused) return;
      remainingMs = Math.max(MIN_REMAINING_MS, remainingMs - (Date.now() - timerStartedAt));
      if (timer) clearTimeout(timer);
      active!.paused = true;
      io.to("overlay").emit("sound:pause", { id: clip.id });
      emitStatus();
    };
    const resume = () => {
      if (!isCurrent() || !active!.paused) return;
      active!.paused = false;
      io.to("overlay").emit("sound:resume", { id: clip.id });
      schedule();
      emitStatus();
    };
    const setVolume = (nextVolume: number) => {
      if (!isCurrent()) return;
      active!.volume = nextVolume;
      io.to("overlay").emit("sound:volume", { id: clip.id, volume: nextVolume });
    };

    active = {
      clipId: clip.id,
      playbackId,
      prompt: clip.prompt,
      sender: clip.sender,
      paused: false,
      volume,
      pause,
      resume,
      setVolume,
    };
    expectSoundEnd(playbackId, finish);
    schedule();
    io.to("overlay").emit("sound:play", {
      id: clip.id,
      name: clip.prompt.slice(0, 80),
      url: `${publicServerUrl()}/tts/clips/${clip.id}/audio`,
      volume,
      playbackId,
    });
    emitStatus();
  });
}

/** Connects the TTS service to the overlay: what plays a clip, and how the dashboard controls it. */
export function installTtsPlayback() {
  setTtsOverlayCheck(() => activeOverlays.size > 0);
  setTtsPlayer(playClip);
  setTtsPlaybackController({
    state: () => ({
      enabled: playbackEnabled,
      active: !!active,
      paused: active?.paused ?? false,
      ...(active ? { clipId: active.clipId, prompt: active.prompt, sender: active.sender } : {}),
    }),
    stop: () => {
      if (!active) return false;
      stopOnOverlay(active);
      return true;
    },
    pause: () => {
      if (!active || active.paused) return false;
      active.pause();
      return true;
    },
    resume: () => {
      if (!active || !active.paused) return false;
      active.resume();
      return true;
    },
    setVolume: (volume) => {
      if (!active || active.volume === volume) return false;
      active.setVolume(volume);
      emitStatus();
      return true;
    },
    setEnabled: (enabled) => {
      playbackEnabled = enabled;
      if (!enabled && active) stopOnOverlay(active);
      emitStatus();
      return getTtsPlaybackState();
    },
  });
}
