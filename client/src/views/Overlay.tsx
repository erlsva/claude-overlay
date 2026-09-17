import { useEffect, useRef, useCallback } from "react";
import { Pause, Volume2 } from "lucide-react";
import {
  OverlayStage,
  type OverlayStageHandle,
} from "../components/CanvasStage";
import { useSocket } from "../hooks/useSocket";
import type { MediaControlPayload } from "../types";
import { ChatEmoteLayer } from "../components/ChatEmoteLayer";
import TileController from "../components/TileController";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

export function Overlay() {
  const stageRef = useRef<OverlayStageHandle>(null);

  const handleMediaControl = useCallback((payload: MediaControlPayload) => {
    stageRef.current?.applyControl(payload);
  }, []);

  const { elements, cursors, dvdCelebrationSettings, chatEmoteSettings, chatEmoteSpawn, strokes, liveStrokes, notifyMediaEnded, chatChannel, ttsPlayback } = useSocket({
    mode: "overlay",
    onMediaControl: handleMediaControl,
  });

  useEffect(() => {
    const id = setInterval(
      () => fetch(`${SERVER_URL}/ping`).catch(() => {}),
      10 * 60 * 1000,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <TileController channel={chatChannel} />
      <OverlayStage ref={stageRef} elements={elements} cursors={cursors} dvdCelebrationSettings={dvdCelebrationSettings} strokes={strokes} liveStrokes={liveStrokes} onMediaEnded={notifyMediaEnded} />
      <ChatEmoteLayer spawn={chatEmoteSpawn} settings={chatEmoteSettings} />
      {ttsPlayback.active && (
        <div className={`overlay-tts-status ${ttsPlayback.paused ? "overlay-tts-status--paused" : ""}`} role="status" aria-live="polite">
          <span className="overlay-tts-status__icon">
            {ttsPlayback.paused ? <Pause size={18} /> : <Volume2 size={18} />}
          </span>
          <span>
            <strong>{ttsPlayback.paused ? "TTS PAUSED" : "TTS PLAYING"}</strong>
            {ttsPlayback.active && <small>{ttsPlayback.sender ? `${ttsPlayback.sender} · ` : ""}{ttsPlayback.prompt}</small>}
          </span>
        </div>
      )}
    </>
  );
}
