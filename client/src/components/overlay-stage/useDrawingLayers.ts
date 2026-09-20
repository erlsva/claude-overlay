import { useEffect } from "react";
import { STREAM_OFFSET_X, STREAM_OFFSET_Y } from "../../canvas/config";
import type { DrawStroke } from "../../types";
import { renderAction } from "../drawing/renderStroke";
import type { LiveStroke } from "./types";
import type { OverlayRefs } from "./useOverlayRefs";

/** Draws committed strokes and other people's in-progress strokes onto their two canvases. */
export function useDrawingLayers(
  strokes: DrawStroke[],
  liveStrokes: Map<string, LiveStroke> | undefined,
  refs: Pick<
    OverlayRefs,
    "drawBaseCanvasRef" | "drawCanvasRef" | "drawBakedCountRef" | "drawLiveCanvasRef"
  >,
) {
  const { drawBaseCanvasRef, drawCanvasRef, drawBakedCountRef, drawLiveCanvasRef } = refs;
  useEffect(() => {
    let base = drawBaseCanvasRef.current;
    if (!base) {
      base = document.createElement("canvas");
      drawBaseCanvasRef.current = base;
    }
    const canvas = drawCanvasRef.current;
    if (canvas && (base.width !== canvas.width || base.height !== canvas.height)) {
      base.width = canvas.width;
      base.height = canvas.height;
      drawBakedCountRef.current = 0;
    }
    const baseCtx = base.getContext("2d")!;
    if (strokes.length < drawBakedCountRef.current) {
      baseCtx.clearRect(0, 0, base.width, base.height);
      drawBakedCountRef.current = 0;
    }
    for (let i = drawBakedCountRef.current; i < strokes.length; i++) {
      renderAction(baseCtx, strokes[i], STREAM_OFFSET_X, STREAM_OFFSET_Y);
    }
    drawBakedCountRef.current = strokes.length;

    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
  }, [strokes]);

  // Keep in-progress remote strokes on their own transparent layer. This
  // avoids copying the complete 1080p committed drawing for every live shape
  // position received from the dashboard.
  useEffect(() => {
    const canvas = drawLiveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (liveStrokes) {
      for (const live of liveStrokes.values()) {
        renderAction(
          ctx,
          {
            ...live,
            id: `live-${live.userId}`,
            points: live.points,
            eraser: live.eraser,
          } as any,
          STREAM_OFFSET_X,
          STREAM_OFFSET_Y,
        );
      }
    }
  }, [liveStrokes]);
}
