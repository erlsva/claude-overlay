import { Volume2, VolumeX, Check, CircleAlert } from "lucide-react";
import { api } from "./api";
import { type PlaybackState } from "./types";
import { Service } from "./Service";
import type { TtsContext } from "./context";

/** Whether playback is on, and whether generation is configured. */
export function TtsStatusCard({
  s,
}: {
  s: Pick<TtsContext, "busy" | "playback" | "runAction" | "setPlayback" | "status" | "toast">;
}) {
  const { busy, playback, runAction, setPlayback, status, toast } = s;
  return (
    <div className="tts-status-card">
      <div className="tts-status-row">
        <span className="tts-status-row__icon">
          {playback.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </span>
        <span className="tts-status-row__text">
          <strong>{playback.enabled ? "Overlay playback on" : "Overlay playback off"}</strong>
          <small>
            {playback.active
              ? playback.paused
                ? "Paused on overlay"
                : "Playing on overlay"
              : "No active playback"}
          </small>
        </span>
        <button
          type="button"
          className="ui-switch"
          role="switch"
          aria-checked={playback.enabled}
          disabled={busy}
          aria-label={playback.enabled ? "Turn TTS playback off" : "Turn TTS playback on"}
          title={playback.enabled ? "Turn TTS playback off" : "Turn TTS playback on"}
          onClick={() =>
            void runAction(async () => {
              const result = await api<{ state: PlaybackState }>("/playback", {
                method: "POST",
                body: JSON.stringify({ action: "enable", enabled: !playback.enabled }),
              });
              setPlayback(result.state);
              toast.info(
                result.state.enabled ? "TTS playback turned on" : "TTS playback turned off",
              );
            })
          }
        />
      </div>
      <div
        className={`tts-status-row ${status?.configured ? "tts-status-row--ok" : status ? "tts-status-row--warn" : ""}`}
      >
        <span className="tts-status-row__icon">
          {status?.configured ? <Check size={16} /> : <CircleAlert size={16} />}
        </span>
        <span className="tts-status-row__text">
          <strong>
            {status?.configured
              ? "Generation ready"
              : status
                ? "Setup incomplete"
                : "Checking TTS services…"}
          </strong>
          {status && !status.configured && <small>{status.storageProvider}</small>}
        </span>
      </div>
      {status && !status.configured && (
        <div className="tts-service-grid">
          <Service name="OpenAI" ready={status.services.openai} />
          <Service name="ElevenLabs" ready={status.services.elevenlabs} />
          <Service name="FFmpeg" ready={status.services.ffmpeg} />
          <Service name="Neon" ready={status.services.metadata} />
          <Service name="Audio archive" ready={status.services.audioStorage} />
        </div>
      )}
    </div>
  );
}
