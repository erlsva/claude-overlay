import { useCallback, useEffect, useState } from "react";
import { SERVER_URL } from "../config/server";
import { clampFraction } from "../support/waveform";

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

/**
 * Where a clip's audio is: the server answers with a redirect to the store, so the audio itself
 * never passes through this site's server (it has a monthly bandwidth allowance). The same
 * address downloads the clip, because the store sends it as an attachment.
 */
export const clipAudioUrl = (clipId: string) => `${SERVER_URL}/tts/clips/${clipId}/audio`;

/**
 * One clip's audio for its own page. Nothing is downloaded until Play is pressed
 * (`preload="none"`), and pressing it calls `play()` straight from the click, which Safari
 * requires. Seeking, buffering and ranges are the browser's own. The volume is remembered
 * between visits.
 */
export function useClipPlayer(clipId: string, expectedLength: number) {
  const [audio] = useState(() => {
    const element = new Audio();
    element.preload = "none";
    return element;
  });
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(expectedLength);
  const [volume, setVolumeState] = useState(readVolume);
  const [muted, setMuted] = useState(false);

  // Trying again sets the source afresh, which also clears the element's error.
  useEffect(() => {
    setFailed(false);
    setTime(0);
    audio.src = clipAudioUrl(clipId);
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
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
      setBuffering(false);
      setTime(0);
    };
    const handlers: Array<[string, () => void]> = [
      ["timeupdate", sync],
      ["durationchange", sync],
      ["seeked", sync],
      [
        "play",
        () => {
          setPlaying(true);
          setBuffering(audio.readyState < 3);
        },
      ],
      ["waiting", () => setBuffering(true)],
      ["playing", () => setBuffering(false)],
      [
        "pause",
        () => {
          setPlaying(false);
          setBuffering(false);
        },
      ],
      ["ended", finished],
      [
        "error",
        () => {
          if (!audio.getAttribute("src")) return;
          setFailed(true);
          setPlaying(false);
          setBuffering(false);
        },
      ],
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
    failed,
    retry: () => setAttempt((count) => count + 1),
    playing,
    buffering,
    time,
    length,
    volume,
    muted,
    toggle,
    seek,
    setVolume,
    toggleMute,
  };
}
