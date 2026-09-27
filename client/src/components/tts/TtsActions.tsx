import { api } from "./api";
import { type PlaybackState } from "./types";
import { FileAudio, Play, Pause, RotateCcw, SkipForward } from "lucide-react";
import type { TtsContext } from "./context";
import type { TtsPanelProps } from "./types";

/**
 * Generate and play, and the controls for the clip on the overlay. The clip controls are always
 * shown so they are easy to find, and are greyed out while nothing is playing.
 */
export function TtsActions({
  props,
  s,
}: {
  props: TtsPanelProps;
  s: Pick<
    TtsContext,
    | "busy"
    | "canGenerate"
    | "isToken"
    | "playback"
    | "prompt"
    | "runAction"
    | "setPlan"
    | "setPlayback"
    | "status"
    | "submit"
    | "toast"
  >;
}) {
  const { overlayConnected } = props;
  // Review plan is switched off for now (see the comment below), so `setPlan` and `status` are not
  // used here. They are still passed in, ready for when it comes back.
  const { busy, canGenerate, isToken, playback, prompt, runAction, setPlayback, submit, toast } = s;
  const nothingPlaying = !playback.active;
  return (
    <div className="tts-actions">
      {/*
        Review plan is switched off for now. It asked OpenAI to lay out the scenes before any
        ElevenLabs credits were spent, and showed the plan in the panel. To bring it back, restore
        this button, add `WandSparkles` to the lucide-react import, import `type Plan` from
        "./types", destructure `setPlan` and `status` above, and give the "Play on overlay"
        button `grid-column: 1 / -1` again in 08-tts-composer.css.

      <button
        className="ui-button"
        disabled={busy || !prompt.trim() || isToken || !status?.configured}
        onClick={() =>
          void runAction(async () => {
            const next = await api<Plan>("/preview", {
              method: "POST",
              body: JSON.stringify({ prompt }),
            });
            setPlan(next);
            toast.success(
              `Scene plan ready with ${next.scenes.length} ${next.scenes.length === 1 ? "scene" : "scenes"}`,
            );
          })
        }
        title="Use OpenAI to review the scene structure before spending ElevenLabs generation credits"
      >
        <WandSparkles size={13} /> Review plan
      </button>
      */}
      <button
        className="ui-button"
        disabled={busy || !prompt.trim() || !canGenerate}
        onClick={() => void submit(false)}
      >
        <FileAudio size={13} /> {isToken ? "Load saved" : "Generate & save"}
      </button>
      <button
        className="ui-button studio-primary"
        disabled={busy || !prompt.trim() || !canGenerate || !overlayConnected}
        onClick={() => void submit(true)}
      >
        <Play size={13} fill="currentColor" /> Play on overlay
      </button>
      <button
        className="ui-button"
        disabled={busy || nothingPlaying}
        title="Pause or continue the clip that is on the overlay, from where it is"
        onClick={() =>
          void runAction(async () => {
            const action = playback.paused ? "resume" : "pause";
            const result = await api<{ changed: boolean; state: PlaybackState }>("/playback", {
              method: "POST",
              body: JSON.stringify({ action }),
            });
            setPlayback(result.state);
            result.changed
              ? toast.info(
                  playback.paused
                    ? "Resumed the clip on the overlay"
                    : "Paused the clip on the overlay",
                )
              : toast.info("No active TTS playback to control");
          })
        }
      >
        {playback.paused ? <Play size={13} /> : <Pause size={13} />}{" "}
        {playback.paused ? "Resume clip" : "Pause clip"}
      </button>
      <button
        className="ui-button tts-stop"
        disabled={busy || nothingPlaying}
        onClick={() =>
          void runAction(async () => {
            const result = await api<{ stopped: boolean }>("/stop", { method: "POST" });
            result.stopped
              ? toast.info("Skipped the clip that was playing")
              : toast.info("No TTS clip is currently playing");
          })
        }
        title="Cut off the clip that is playing and move on to the next request"
      >
        <SkipForward size={12} fill="currentColor" /> Skip
      </button>
      <button
        className="ui-button tts-restart"
        disabled={busy || nothingPlaying}
        title="Play the clip that is on the overlay again from the beginning, even if it is paused part-way"
        onClick={() =>
          void runAction(async () => {
            const result = await api<{ changed: boolean; state: PlaybackState }>("/playback", {
              method: "POST",
              body: JSON.stringify({ action: "restart" }),
            });
            setPlayback(result.state);
            toast.info(
              result.changed
                ? "Playing the clip again from the start"
                : "No TTS clip is currently playing",
            );
          })
        }
      >
        <RotateCcw size={13} /> Play from start
      </button>
    </div>
  );
}
