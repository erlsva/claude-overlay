import { useEffect, useState } from "react";
import type { CanvasElement, DvdCelebrationSettings } from "../../types";
import { playCornerSound, spawnConfetti } from "./celebration";
import type { OverlayRefs } from "./useOverlayRefs";

/** The corner-hit counter, and the confetti and sound played when a bouncing element hits a corner. */
export function useCornerCelebration(
  elements: CanvasElement[],
  refs: Pick<
    OverlayRefs,
    | "hadActiveDvdRef"
    | "cornerParticlesRef"
    | "cornerAudioContextRef"
    | "customCornerAudioRef"
    | "dvdCelebrationSettingsRef"
  >,
) {
  const {
    hadActiveDvdRef,
    cornerParticlesRef,
    cornerAudioContextRef,
    customCornerAudioRef,
    dvdCelebrationSettingsRef,
  } = refs;
  const [cornerHitCount, setCornerHitCount] = useState(0);
  const hasActiveDvd = elements.some(
    (element) => element.dvdEnabled && element.visible && element.type !== "audio",
  );

  useEffect(() => {
    if (!hasActiveDvd && hadActiveDvdRef.current) {
      setCornerHitCount(0);
    }
    hadActiveDvdRef.current = hasActiveDvd;
  }, [hasActiveDvd]);

  const spawnCornerCelebration = (cornerX: number, cornerY: number) => {
    const settings: DvdCelebrationSettings = dvdCelebrationSettingsRef.current;
    setCornerHitCount((count) => count + 1);
    spawnConfetti(cornerParticlesRef.current, cornerX, cornerY);
    playCornerSound(settings, { cornerAudioContextRef, customCornerAudioRef });
  };

  return { cornerHitCount, hasActiveDvd, spawnCornerCelebration };
}
