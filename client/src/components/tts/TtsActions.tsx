import { api } from "./api";
import { type Plan, type PlaybackState } from "./types";
import { WandSparkles, FileAudio, Play, Pause, Square } from "lucide-react";
import type { TtsContext } from "./context";
import type { TtsPanelProps } from "./types";

/** Review plan, generate, play, and the playback controls. */
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
  const {
    busy,
    canGenerate,
    isToken,
    playback,
    prompt,
    runAction,
    setPlan,
    setPlayback,
    status,
    submit,
    toast,
  } = s;
  return (
    <div className="tts-actions">
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
      <button
        className="ui-button"
        disabled={busy || !prompt.trim() || !canGenerate}
        onClick={() => void submit(false)}
      >
        <FileAudio size={13} /> {isToken ? "Load saved" : "Generate & save"}
      </button>
      <button
        className="ui-button studio-primary"
        disabled={busy || !prompt.trim() || !canGenerate || !overlayConnected || !playback.enabled}
        onClick={() => void submit(true)}
      >
        <Play size={13} fill="currentColor" /> Play on overlay
      </button>
      {playback.active && (
        <>
          <button
            className="ui-button"
            disabled={busy}
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
                      playback.paused ? "Resumed TTS on the overlay" : "Paused TTS on the overlay",
                    )
                  : toast.info("No active TTS playback to control");
              })
            }
          >
            {playback.paused ? <Play size={13} /> : <Pause size={13} />}{" "}
            {playback.paused ? "Resume" : "Pause"}
          </button>
          <button
            className="ui-button tts-stop"
            disabled={busy}
            onClick={() =>
              void runAction(async () => {
                const result = await api<{ stopped: boolean }>("/stop", { method: "POST" });
                result.stopped
                  ? toast.info("Stopped the active TTS on the overlay")
                  : toast.info("No TTS clip is currently playing");
              })
            }
          >
            <Square size={11} fill="currentColor" /> Stop
          </button>
        </>
      )}
    </div>
  );
}
