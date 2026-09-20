import { useState, useRef, useEffect } from "react";
import { type Clip } from "./types";
import type { useTtsVolume } from "./useTtsVolume";

/** Previewing a saved clip in this browser. */
export function useTtsPreview(deps: Pick<ReturnType<typeof useTtsVolume>, "volume">) {
  const { volume } = deps;
  const [selected, setSelected] = useState<{
    clip: Clip;
    origin: "job" | "library";
    autoPlay?: boolean;
  } | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.volume = volume;
    }
  }, [selected, volume]);
  const previewKey = (clip: Clip, origin: "job" | "library") => `${origin}:${clip.id}`;
  // One button both starts and stops: it reads Stop while that clip is playing.
  const togglePreview = (clip: Clip, origin: "job" | "library") => {
    const audio = previewAudioRef.current;
    if (audio && selected?.clip.id === clip.id && selected.origin === origin) {
      if (audio.paused) {
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
      } else {
        audio.pause();
        audio.currentTime = 0;
      }
      return;
    }
    setPlayingKey(null);
    setSelected({ clip, origin, autoPlay: true });
  };
  const closePreview = () => {
    setPlayingKey(null);
    setSelected(null);
  };

  return {
    selected,
    setSelected,
    playingKey,
    setPlayingKey,
    previewAudioRef,
    previewKey,
    togglePreview,
    closePreview,
  };
}
