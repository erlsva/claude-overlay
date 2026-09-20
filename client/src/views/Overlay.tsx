import { useEffect, useRef, useCallback, useState } from "react";
import { Pause, Volume2 } from "lucide-react";
import { OverlayStage, type OverlayStageHandle } from "../components/overlay-stage/OverlayStage";
import { useSocket } from "../hooks/useSocket";
import type { MediaControlPayload } from "../types";
import { ChatEmoteLayer } from "../components/chat-emotes/ChatEmoteLayer";
import TileController from "../components/TileController";
import { isMirrorMode, silencePage } from "../audio/silence";
import { SERVER_URL } from "../config/server";

// The dashboard embeds the overlay as a silent live preview (?mirror=1).
const IS_MIRROR = isMirrorMode();
if (IS_MIRROR) silencePage();

export function Overlay() {
  const stageRef = useRef<OverlayStageHandle>(null);

  const handleMediaControl = useCallback((payload: MediaControlPayload) => {
    stageRef.current?.applyControl(payload);
  }, []);

  const {
    elements,
    cursors,
    dvdCelebrationSettings,
    chatEmoteSettings,
    chatEmoteSpawn,
    strokes,
    liveStrokes,
    notifyMediaEnded,
    chatChannel,
    ttsPlayback,
  } = useSocket({
    mode: IS_MIRROR ? "mirror" : "overlay",
    onMediaControl: handleMediaControl,
  });
  const [displayedTts, setDisplayedTts] = useState(ttsPlayback);
  const [ttsLeaving, setTtsLeaving] = useState(false);
  const ttsExitTimer = useRef(0);

  useEffect(() => {
    window.clearTimeout(ttsExitTimer.current);
    if (ttsPlayback.active) {
      setDisplayedTts(ttsPlayback);
      setTtsLeaving(false);
      return;
    }
    if (displayedTts.active) {
      setTtsLeaving(true);
      ttsExitTimer.current = window.setTimeout(() => {
        setDisplayedTts(ttsPlayback);
        setTtsLeaving(false);
      }, 260);
    }
    return () => window.clearTimeout(ttsExitTimer.current);
  }, [displayedTts.active, ttsPlayback]);

  useEffect(() => {
    if (IS_MIRROR) return;
    const id = setInterval(() => fetch(`${SERVER_URL}/ping`).catch(() => {}), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <TileController channel={chatChannel} />
      <OverlayStage
        ref={stageRef}
        elements={elements}
        cursors={cursors}
        dvdCelebrationSettings={dvdCelebrationSettings}
        strokes={strokes}
        liveStrokes={liveStrokes}
        onMediaEnded={IS_MIRROR ? undefined : notifyMediaEnded}
      />
      <ChatEmoteLayer spawn={chatEmoteSpawn} settings={chatEmoteSettings} />
      {displayedTts.active && (
        <div
          className={`overlay-tts-status ${displayedTts.paused ? "overlay-tts-status--paused" : ""}${ttsLeaving ? " overlay-tts-status--leaving" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span className="overlay-tts-status__icon">
            {displayedTts.paused ? <Pause size={22} /> : <Volume2 size={22} />}
          </span>
          <span>
            <strong>{displayedTts.paused ? "TTS PAUSED" : "TTS PLAYING"}</strong>
            <small>
              {displayedTts.sender ? `${displayedTts.sender} · ` : ""}
              {displayedTts.prompt}
            </small>
          </span>
        </div>
      )}
    </>
  );
}
