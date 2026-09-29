import { useState } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useToast } from "../ToastProvider";
import { api } from "./api";
import { barLabel } from "./statusText";
import type { PlaybackState } from "./types";

/**
 * TTS's status and its main controls, in the dashboard's top bar on every tab, so pausing TTS,
 * skipping a clip or playing it again from the start never needs the TTS panel open. The live state
 * arrives over the socket (the status and the buttons follow it), so nothing here keeps its own copy.
 */
export function TtsQuickControls({ playback }: { playback: PlaybackState }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  /** Calls a TTS endpoint; only a failure or "nothing to do" needs saying, since the state follows. */
  const run = async (route: string, body: object | undefined, nothing: string) => {
    setBusy(true);
    try {
      const result = await api<{ changed?: boolean; stopped?: boolean }>(route, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (result.changed === false || result.stopped === false) toast.info(nothing);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That TTS control did not work");
    } finally {
      setBusy(false);
    }
  };

  const nothingPlaying = !playback.active;
  return (
    <div className="tts-quick" role="group" aria-label="TTS controls">
      <span
        className={`tts-quick__status${playback.held ? " tts-quick__status--paused" : ""}`}
        title={
          playback.held
            ? "TTS is paused: requests wait in the queue. Resume TTS to play them."
            : "TTS is running."
        }
      >
        <span className="tts-quick__dot" />
        {barLabel(playback)}
      </span>
      <button
        type="button"
        className="tts-quick__button"
        disabled={busy}
        title={
          playback.held
            ? "Resume TTS: play the waiting requests, and let new ones play as they come"
            : "Pause TTS: hold new requests in a queue, including Play on overlay. What is playing now finishes."
        }
        onClick={() =>
          void run("/playback", { action: playback.held ? "release" : "hold" }, "Nothing changed")
        }
      >
        {playback.held ? (
          <Play size={13} fill="currentColor" aria-hidden="true" />
        ) : (
          <Pause size={13} fill="currentColor" aria-hidden="true" />
        )}
        {playback.held ? "Resume TTS" : "Pause TTS"}
      </button>
      <button
        type="button"
        className="tts-quick__button"
        disabled={busy || nothingPlaying}
        title="Skip: cut off the clip that is playing and move on to the next request"
        onClick={() => void run("/stop", undefined, "No TTS clip is playing")}
      >
        <SkipForward size={13} fill="currentColor" aria-hidden="true" />
        Skip
      </button>
      <button
        type="button"
        className="tts-quick__button"
        disabled={busy || nothingPlaying}
        title="Play from start: play the clip on the overlay again from the beginning"
        onClick={() => void run("/playback", { action: "restart" }, "No TTS clip is playing")}
      >
        <RotateCcw size={13} aria-hidden="true" />
        From start
      </button>
    </div>
  );
}
