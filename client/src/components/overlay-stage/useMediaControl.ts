import { useImperativeHandle, type ForwardedRef } from "react";
import type { MediaControlPayload } from "../../types";
import type { OverlayStageHandle } from "./types";
import type { OverlayRefs } from "./useOverlayRefs";

/** Lets the dashboard play, pause and seek the media the overlay is showing. */
export function useMediaControl(
  ref: ForwardedRef<OverlayStageHandle>,
  refs: Pick<OverlayRefs, "mediaElMapRef">,
) {
  useImperativeHandle(ref, () => ({
    applyControl(payload: MediaControlPayload) {
      const media = refs.mediaElMapRef.current.get(payload.id);
      if (!media) return;
      (media as any).__applyingRemote = true;
      if (payload.action !== "play") media.currentTime = payload.currentTime;
      if (payload.action === "play") {
        // Play muted first (always allowed by autoplay policy), then restore volume.
        // This lets the overlay work in browsers without a prior user gesture.
        const wasMuted = media.muted;
        media.muted = true;
        media.currentTime = payload.currentTime;
        media
          .play()
          .then(() => {
            media.muted = wasMuted;
          })
          .catch(() => {})
          .finally(() => {
            (media as any).__applyingRemote = false;
          });
      } else {
        if (payload.action === "pause") media.pause();
        (media as any).__applyingRemote = false;
      }
    },
  }));
}
