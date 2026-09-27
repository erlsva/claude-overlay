import { useEffect, useState } from "react";
import {
  Check,
  CircleAlert,
  MessageSquareText,
  Pause,
  PauseCircle,
  Play,
  Smile,
  Timer,
  Volume2,
} from "lucide-react";
import { api } from "./api";
import { type PlaybackState } from "./types";
import { Service } from "./Service";
import { panelStatus, parseGap } from "./statusText";
import type { TtsContext } from "./context";

/** The most silence between clips the panel lets you ask for. The server holds the same limit. */
const MAX_GAP_SECONDS = 30;

/** Whether TTS is paused, the silence between clips, and whether generation is configured. */
export function TtsStatusCard({
  s,
}: {
  s: Pick<TtsContext, "busy" | "playback" | "runAction" | "setPlayback" | "status" | "toast">;
}) {
  const { busy, playback, runAction, setPlayback, status, toast } = s;
  const { title, detail } = panelStatus(playback);
  // The gap is typed as text and sent when you leave the box or press Enter.
  const [gapText, setGapText] = useState(String(playback.gapSeconds));
  useEffect(() => setGapText(String(playback.gapSeconds)), [playback.gapSeconds]);

  const send = (body: object) =>
    api<{ changed: boolean; state: PlaybackState }>("/playback", {
      method: "POST",
      body: JSON.stringify(body),
    });
  const commitGap = () => {
    const seconds = parseGap(gapText, MAX_GAP_SECONDS);
    if (seconds === null) {
      setGapText(String(playback.gapSeconds));
      toast.error(`Enter a whole number of seconds from 0 to ${MAX_GAP_SECONDS}`);
      return;
    }
    if (seconds === playback.gapSeconds) return;
    void runAction(async () => {
      setPlayback((await send({ action: "gap", seconds })).state);
      toast.info(
        seconds === 0 ? "No silence between clips" : `${seconds}s of silence between clips`,
      );
    });
  };

  return (
    <div className="tts-status-card">
      <div className={`tts-status-row${playback.held ? " tts-status-row--paused" : ""}`}>
        <span className="tts-status-row__icon">
          {playback.held ? <PauseCircle size={16} /> : <Volume2 size={16} />}
        </span>
        <span className="tts-status-row__text">
          <strong>{title}</strong>
          <small>{detail}</small>
        </span>
        <button
          type="button"
          className={`ui-button${playback.held ? " studio-primary" : ""}`}
          disabled={busy}
          title={
            playback.held
              ? "Play the requests that are waiting, and let new ones play as they come"
              : "Hold new requests in a queue instead of playing them. What is playing now finishes."
          }
          onClick={() =>
            void runAction(async () => {
              const result = await send({ action: playback.held ? "release" : "hold" });
              setPlayback(result.state);
              toast.info(result.state.held ? "TTS paused" : "TTS resumed");
            })
          }
        >
          {playback.held ? (
            <>
              <Play size={13} fill="currentColor" /> Resume TTS
            </>
          ) : (
            <>
              <Pause size={13} fill="currentColor" /> Pause TTS
            </>
          )}
        </button>
      </div>
      <div className="tts-status-row">
        <span className="tts-status-row__icon">
          <Timer size={16} />
        </span>
        <span className="tts-status-row__text">
          <strong>Silence between clips</strong>
          <small>At least this long between one clip ending and the next starting</small>
        </span>
        <label className="tts-gap">
          <input
            type="text"
            inputMode="numeric"
            value={gapText}
            disabled={busy}
            aria-label="Seconds of silence between clips"
            onChange={(event) => setGapText(event.target.value)}
            onBlur={commitGap}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <span aria-hidden="true">s</span>
        </label>
      </div>
      <div className="tts-status-row">
        <span className="tts-status-row__icon">
          <MessageSquareText size={16} />
        </span>
        <span className="tts-status-row__text">
          <strong>Prompt on the overlay</strong>
          <small>Shows who asked and what was said while a clip plays.</small>
        </span>
        <button
          type="button"
          className="ui-switch"
          role="switch"
          aria-checked={playback.showPrompt}
          aria-label={playback.showPrompt ? "Hide the prompt card" : "Show the prompt card"}
          title={playback.showPrompt ? "Hide the prompt card" : "Show the prompt card"}
          disabled={busy}
          onClick={() =>
            void runAction(async () => {
              const result = await send({ action: "prompt", show: !playback.showPrompt });
              setPlayback(result.state);
              toast.info(result.state.showPrompt ? "Prompt card shown" : "Prompt card hidden");
            })
          }
        />
      </div>
      <div className="tts-status-row">
        <span className="tts-status-row__icon">
          <Smile size={16} />
        </span>
        <span className="tts-status-row__text">
          <strong>Icon on the overlay</strong>
          <small>Shows TTS is on and moves with what is said. Grey while paused.</small>
        </span>
        <button
          type="button"
          className="ui-switch"
          role="switch"
          aria-checked={playback.showEmote}
          aria-label={playback.showEmote ? "Hide the TTS icon" : "Show the TTS icon"}
          title={playback.showEmote ? "Hide the TTS icon" : "Show the TTS icon"}
          disabled={busy}
          onClick={() =>
            void runAction(async () => {
              const result = await send({ action: "emote", show: !playback.showEmote });
              setPlayback(result.state);
              toast.info(result.state.showEmote ? "TTS icon shown" : "TTS icon hidden");
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
