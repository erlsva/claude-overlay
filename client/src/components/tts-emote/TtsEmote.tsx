import { useEffect, useRef } from "react";
// Placeholder art. To use another picture, change this one import.
import picture from "../../assets/vicksyW.png";
import { poseCss, poseFor, smoothLevel } from "../../support/ttsLevel";

/**
 * A small icon in the corner of the overlay: it shows TTS is on, moves with what is being said (or
 * with the sound effect), and goes grey while TTS is paused. `getLevel` says how loud the clip is
 * right now, from 0 to 1; it is read every frame and moves the picture directly, so nothing in
 * React re-renders 60 times a second.
 */
export function TtsEmote({ held, getLevel }: { held: boolean; getLevel: () => number }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    let frame = 0;
    let level = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // A long gap (the tab was hidden) must not make one giant jump.
      const seconds = Math.min(0.1, (now - last) / 1000);
      last = now;
      level = smoothLevel(level, getLevel(), seconds);
      if (image.current)
        image.current.style.transform = poseCss(poseFor(level < 0.01 ? 0 : level, now / 1000));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getLevel]);

  return (
    <div className={`tts-emote${held ? " tts-emote--paused" : ""}`} aria-hidden="true">
      <img ref={image} src={picture} alt="" draggable={false} />
    </div>
  );
}
