import { useState, useRef, useEffect } from "react";
import { type PlaybackState } from "./types";
import { api } from "./api";
import type { TtsPanelProps } from "./types";
import type { useTtsServices } from "./useTtsServices";

/** The overlay volume: follows the server, and sends changes without jumping while dragged. */
export function useTtsVolume(
  props: TtsPanelProps,
  deps: Pick<ReturnType<typeof useTtsServices>, "toast">,
) {
  const { livePlayback } = props;
  const { toast } = deps;
  const [playback, setPlayback] = useState<PlaybackState>({
    enabled: true,
    active: false,
    paused: false,
  });
  const [volume, setVolume] = useState(0.25);
  const volumeSyncTimer = useRef(0);
  // While the slider is being dragged, ignore volumes echoed back from the server.
  const volumeTouchedAt = useRef(0);
  const followServerVolume = (next: { volume?: number }) => {
    if (typeof next.volume !== "number") return;
    if (Date.now() - volumeTouchedAt.current < 1500) return;
    setVolume(next.volume);
  };
  const volumeSyncErrorShown = useRef(false);
  useEffect(() => {
    setPlayback(livePlayback);
    followServerVolume(livePlayback);
  }, [livePlayback]);
  useEffect(
    () => () => {
      window.clearTimeout(volumeSyncTimer.current);
    },
    [],
  );
  const changeVolume = (nextVolume: number) => {
    setVolume(nextVolume);
    volumeTouchedAt.current = Date.now();
    window.clearTimeout(volumeSyncTimer.current);
    volumeSyncTimer.current = window.setTimeout(() => {
      void api<{ changed: boolean; state: PlaybackState }>("/playback", {
        method: "POST",
        body: JSON.stringify({ action: "volume", volume: nextVolume }),
      })
        .then((result) => {
          volumeTouchedAt.current = Date.now();
          setPlayback(result.state);
          volumeSyncErrorShown.current = false;
        })
        .catch((cause) => {
          if (volumeSyncErrorShown.current) return;
          volumeSyncErrorShown.current = true;
          toast.error(
            cause instanceof Error ? cause.message : "Could not update the overlay's TTS volume",
          );
        });
    }, 100);
  };

  return {
    playback,
    setPlayback,
    volume,
    setVolume,
    volumeSyncTimer,
    volumeTouchedAt,
    followServerVolume,
    volumeSyncErrorShown,
    changeVolume,
  };
}
