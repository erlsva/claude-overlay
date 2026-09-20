import { useEffect } from "react";
import type { DrawStroke } from "../../types";
import type { DrawingRefs } from "./useDrawingRefs";
import { renderAction } from "./renderStroke";

/**
 * Bakes newly-committed strokes into the offscreen base layer once and copies it to the visible
 * canvas. If strokes shrank (e.g. cleared) or otherwise diverged, rebuilds from scratch.
 */
export function useCommittedStrokes(
  strokes: DrawStroke[],
  size: { width: number; height: number; offsetX: number; offsetY: number },
  refs: Pick<DrawingRefs, "baseCanvasRef" | "bakedCountRef" | "canvasRef">,
) {
  const { width, height, offsetX, offsetY } = size;
  const { baseCanvasRef, bakedCountRef, canvasRef } = refs;
  useEffect(() => {
    let base = baseCanvasRef.current;
    if (!base) {
      base = document.createElement("canvas");
      baseCanvasRef.current = base;
    }
    if (base.width !== width || base.height !== height) {
      base.width = width;
      base.height = height;
      bakedCountRef.current = 0;
    }
    const ctx = base.getContext("2d")!;
    if (strokes.length < bakedCountRef.current) {
      ctx.clearRect(0, 0, base.width, base.height);
      bakedCountRef.current = 0;
    }
    for (let i = bakedCountRef.current; i < strokes.length; i++) {
      renderAction(ctx, strokes[i], offsetX, offsetY);
    }
    bakedCountRef.current = strokes.length;
    const canvas = canvasRef.current;
    if (canvas) {
      const visibleContext = canvas.getContext("2d")!;
      visibleContext.clearRect(0, 0, canvas.width, canvas.height);
      visibleContext.drawImage(base, 0, 0);
    }
  }, [strokes, width, height, offsetX, offsetY]);
}
