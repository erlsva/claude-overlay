/** The OBS overlay: renders the canvas elements with no editing, animating with requestAnimationFrame. */

import { forwardRef, useEffect } from "react";
import { STREAM_OFFSET_X, STREAM_OFFSET_Y, STREAM_W, STREAM_H } from "../../canvas/config";
import { LiveCursors } from "../LiveCursors";
import { CornerHitCounter } from "./CornerHitCounter";
import { syncOverlayElements } from "./syncOverlayElements";
import type { OverlayStageHandle, OverlayStageProps } from "./types";
import { useCornerCelebration } from "./useCornerCelebration";
import { useCornerParticles } from "./useCornerParticles";
import { useDrawingLayers } from "./useDrawingLayers";
import { useMediaControl } from "./useMediaControl";
import { useMovingElements } from "./useMovingElements";
import { useOverlayRefs } from "./useOverlayRefs";

export type { OverlayStageHandle } from "./types";

const fullSizeLayer = { position: "absolute", inset: 0, pointerEvents: "none" } as const;

export const OverlayStage = forwardRef<OverlayStageHandle, OverlayStageProps>(function OverlayStage(
  {
    elements,
    cursors = new Map(),
    dvdCelebrationSettings = {
      volume: 0.25,
      soundUrl: null,
      counterPosition: "top-right",
    },
    strokes = [],
    liveStrokes,
    onMediaEnded,
  },
  ref,
) {
  const refs = useOverlayRefs(elements, dvdCelebrationSettings);
  const { cornerHitCount, hasActiveDvd, spawnCornerCelebration } = useCornerCelebration(
    elements,
    refs,
  );
  useMovingElements(refs, spawnCornerCelebration);
  useCornerParticles(refs);
  useDrawingLayers(strokes, liveStrokes, refs);
  useMediaControl(ref, refs);

  useEffect(() => {
    const viewport = refs.viewportRef.current;
    if (!viewport) return;
    syncOverlayElements(elements, {
      viewport,
      audioContainer: refs.audioContainerRef.current,
      refs,
      onMediaEnded,
    });
  }, [elements]);

  return (
    <div
      style={{
        width: STREAM_W,
        height: STREAM_H,
        overflow: "hidden",
        background: "transparent",
        position: "relative",
      }}
    >
      <div ref={refs.viewportRef} style={fullSizeLayer} />
      <canvas
        ref={refs.drawCanvasRef}
        width={STREAM_W}
        height={STREAM_H}
        style={{ ...fullSizeLayer, zIndex: 999 }}
      />
      <canvas
        ref={refs.drawLiveCanvasRef}
        width={STREAM_W}
        height={STREAM_H}
        style={{ ...fullSizeLayer, zIndex: 1000 }}
      />
      <LiveCursors
        cursors={cursors}
        pan={{ x: -STREAM_OFFSET_X, y: -STREAM_OFFSET_Y }}
        zoom={1}
        large
      />
      {hasActiveDvd && (
        <CornerHitCounter
          counterPosition={dvdCelebrationSettings.counterPosition}
          hitCount={cornerHitCount}
        />
      )}
      <canvas
        ref={refs.cornerFxCanvasRef}
        width={STREAM_W}
        height={STREAM_H}
        style={{ ...fullSizeLayer, zIndex: 2000 }}
      />
      {/* Hidden audio container */}
      <div ref={refs.audioContainerRef} style={{ display: "none" }} />
    </div>
  );
});
