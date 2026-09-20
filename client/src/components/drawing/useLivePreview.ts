import { useCallback, useEffect } from "react";
import type { DrawStroke, LiveDrawStroke } from "../../types";
import type { DrawingRefs } from "./useDrawingRefs";
import { SHAPE_TOOLS, renderStroke } from "./renderStroke";

/**
 * Draws the uncommitted strokes (other people's, and the one being drawn now) on the transparent
 * preview canvas. Returns `redrawAll`, which schedules one redraw for the next animation frame.
 */
export function useLivePreview(
  strokes: DrawStroke[],
  liveStrokes: Map<string, LiveDrawStroke> | undefined,
  offset: { offsetX: number; offsetY: number },
  refs: Pick<
    DrawingRefs,
    | "redrawFrameRef"
    | "previewCanvasRef"
    | "toolRef"
    | "livePointsRef"
    | "colorRef"
    | "sizeRef"
    | "opacityRef"
  >,
) {
  const { offsetX, offsetY } = offset;
  const {
    redrawFrameRef,
    previewCanvasRef,
    toolRef,
    livePointsRef,
    colorRef,
    sizeRef,
    opacityRef,
  } = refs;
  const redrawAll = useCallback(() => {
    if (redrawFrameRef.current !== null) return;
    redrawFrameRef.current = window.requestAnimationFrame(() => {
      redrawFrameRef.current = null;
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (liveStrokes) {
        for (const live of liveStrokes.values()) {
          // A transparent preview layer cannot erase pixels from the committed
          // canvas beneath it, so show an understated light trail until the
          // eraser action is committed on mouse-up.
          renderStroke(
            ctx,
            live.eraser ? { ...live, eraser: false, color: "#ffffff", opacity: 0.3 } : live,
            offsetX,
            offsetY,
          );
        }
      }
      const drawingShape = SHAPE_TOOLS.includes(toolRef.current);
      if (livePointsRef.current.length > 0 && !drawingShape) {
        const erasing = toolRef.current === "eraser";
        renderStroke(
          ctx,
          {
            points: livePointsRef.current,
            color: erasing ? "#ffffff" : colorRef.current,
            size: sizeRef.current,
            eraser: false,
            tool: toolRef.current === "fill" ? "pen" : toolRef.current,
            opacity: erasing ? 0.3 : opacityRef.current,
          },
          offsetX,
          offsetY,
        );
      }
    });
  }, [liveStrokes, offsetX, offsetY]);

  useEffect(() => {
    redrawAll();
  }, [strokes, redrawAll]);
  useEffect(
    () => () => {
      if (redrawFrameRef.current !== null) window.cancelAnimationFrame(redrawFrameRef.current);
    },
    [],
  );

  return redrawAll;
}
