import { useCallback, useEffect, useState } from "react";
import { SERVER_URL } from "../config/server";
import { clampFraction, peaksFrom } from "../support/waveform";

const VOLUME_KEY = "tts_public_volume";
const DEFAULT_VOLUME = 0.5;

function readVolume(): number {
  try {
    const stored = localStorage.getItem(VOLUME_KEY);
    const value = stored === null ? NaN : Number(stored);
    if (Number.isFinite(value) && value >= 0 && value <= 1) return value;
  } catch {
    // Storage can be blocked; the volume then just starts at the default each visit.
  }
  return DEFAULT_VOLUME;
}

/** The waveform of the audio, or null when the browser cannot decode it (the player then still plays). */
async function decodePeaks(bytes: ArrayBuffer): Promise<number[] | null> {
  if (typeof OfflineAudioContext === "undefined") return null;
  try {
    const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes);
    return peaksFrom(decoded.getChannelData(0));
  } catch {
    return null;
  }
}

/**
 * One clip's audio for its own page. The file is fetched when the page opens and played from
 * memory, so Play starts at once (and inside the click, which Safari requires), seeking is exact,
 * and the same bytes give the waveform. The volume is remembered between visits.
 */
export function useClipPlayer(clipId: string, expectedLength: number) {
  const [audio] = useState(() => new Audio());
  const [load, setLoad] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(expectedLength);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [volume, setVolumeState] = useState(readVolume);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let url = "";
    setLoad("loading");
    setPeaks(null);
    setTime(0);
    (async () => {
      const response = await fetch(`${SERVER_URL}/tts/clips/${clipId}/file`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`The server answered ${response.status}`);
      const bytes = await response.arrayBuffer();
      url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
      audio.src = url;
      setLoad("ready");
      // The bars fill in when the decode finishes; playing does not wait for it.
      void decodePeaks(bytes.slice(0)).then((decoded) => {
        if (decoded && !controller.signal.aborted) setPeaks(decoded);
      });
    })().catch(() => {
      if (!controller.signal.aborted) setLoad("failed");
    });
    return () => {
      controller.abort();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (url) URL.revokeObjectURL(url);
    };
  }, [audio, clipId, attempt]);

  useEffect(() => {
    const sync = () => {
      setTime(audio.currentTime);
      if (Number.isFinite(audio.duration) && audio.duration > 0) setLength(audio.duration);
    };
    const finished = () => {
      audio.currentTime = 0;
      setPlaying(false);
      setTime(0);
    };
    const handlers: Array<[string, () => void]> = [
      ["timeupdate", sync],
      ["durationchange", sync],
      ["seeked", sync],
      ["play", () => setPlaying(true)],
      ["pause", () => setPlaying(false)],
      ["ended", finished],
      ["error", () => audio.getAttribute("src") && setLoad("failed")],
    ];
    for (const [name, handler] of handlers) audio.addEventListener(name, handler);
    return () => {
      for (const [name, handler] of handlers) audio.removeEventListener(name, handler);
    };
  }, [audio]);

  // `timeupdate` only fires a few times a second; while playing, read the clock every frame so the
  // bar moves smoothly.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      setTime(audio.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [audio, playing]);

  useEffect(() => {
    audio.volume = volume;
    audio.muted = muted;
  }, [audio, volume, muted]);

  const toggle = useCallback(() => {
    if (audio.paused) audio.play().catch(() => undefined);
    else audio.pause();
  }, [audio]);

  const seek = useCallback(
    (fraction: number) => {
      const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : length;
      audio.currentTime = clampFraction(fraction) * total;
      setTime(audio.currentTime);
    },
    [audio, length],
  );

  const setVolume = useCallback((next: number) => {
    const value = clampFraction(next);
    setVolumeState(value);
    setMuted(false);
    try {
      localStorage.setItem(VOLUME_KEY, String(value));
    } catch {
      // Not remembered this time; nothing else depends on it.
    }
  }, []);

  const toggleMute = useCallback(() => {
    // With the slider at zero, muting or un-muting changes nothing you can hear, so the button
    // brings the sound back instead.
    if (volume === 0) setVolume(DEFAULT_VOLUME);
    else setMuted((current) => !current);
  }, [volume, setVolume]);

  return {
    load,
    retry: () => setAttempt((count) => count + 1),
    playing,
    time,
    length,
    peaks,
    volume,
    muted,
    toggle,
    seek,
    setVolume,
    toggleMute,
  };
}
