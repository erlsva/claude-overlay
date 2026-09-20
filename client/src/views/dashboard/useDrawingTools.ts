import { useState, useCallback } from "react";
import { type DrawToolMode, renderAction } from "../../components/drawing/renderStroke";
import { WORKSPACE_W, WORKSPACE_H } from "../../canvas/config";
import { SERVER_URL } from "../../config/server";
import { authHeaders } from "../../hooks/useAuth";
import { randomUUID } from "../../utils";
import type { useDashboardSocket } from "./useDashboardSocket";
import type { useDashboardServices } from "./useDashboardServices";

/** The drawing tool settings, and turning a drawing into an image layer. */
export function useDrawingTools(
  deps: Pick<ReturnType<typeof useDashboardSocket>, "addElement" | "clearStrokes" | "strokes"> &
    Pick<ReturnType<typeof useDashboardServices>, "toast">,
) {
  const { addElement, clearStrokes, strokes, toast } = deps;
  const [drawMode, setDrawMode] = useState(false);
  const [drawColor, setDrawColor] = useState("#ff4444");
  const [drawSize, setDrawSize] = useState(6);
  const [drawOpacity, setDrawOpacity] = useState(1);
  const [fillTolerance, setFillTolerance] = useState(64);
  const [toolMode, setToolMode] = useState<DrawToolMode>("pen");
  const handleSaveDrawingAsElement = useCallback(async () => {
    if (strokes.length === 0) return;
    try {
      // Render the complete drawing first so fills and erased areas are included
      // when calculating the final transparent PNG bounds.
      const source = document.createElement("canvas");
      source.width = WORKSPACE_W;
      source.height = WORKSPACE_H;
      const sourceCtx = source.getContext("2d", { willReadFrequently: true })!;
      for (const action of strokes) renderAction(sourceCtx, action);

      const pixels = sourceCtx.getImageData(0, 0, WORKSPACE_W, WORKSPACE_H).data;
      let minX = WORKSPACE_W,
        minY = WORKSPACE_H,
        maxX = -1,
        maxY = -1;
      for (let y = 0; y < WORKSPACE_H; y++) {
        for (let x = 0; x < WORKSPACE_W; x++) {
          if (pixels[(y * WORKSPACE_W + x) * 4 + 3] === 0) continue;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < minX || maxY < minY) return;

      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const cropped = document.createElement("canvas");
      cropped.width = width;
      cropped.height = height;
      cropped.getContext("2d")!.drawImage(source, minX, minY, width, height, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) =>
        cropped.toBlob(
          (result) => (result ? resolve(result) : reject(new Error("PNG conversion failed"))),
          "image/png",
        ),
      );
      const body = new FormData();
      body.append("file", blob, `drawing-${Date.now()}.png`);
      const response = await fetch(`${SERVER_URL}/upload`, {
        method: "POST",
        body,
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(`Drawing upload failed (${response.status})`);
      const { url } = await response.json();

      addElement({
        id: randomUUID(),
        type: "image",
        src: `${SERVER_URL}${url}`,
        x: minX,
        y: minY,
        width,
        height,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        zIndex: Date.now(),
      });
      clearStrokes();
      toast.success("Drawing saved as a canvas element");
    } catch (error) {
      console.error("Could not convert drawing to an element:", error);
      toast.error("Could not save the drawing as an element. Your drawing was kept.");
      // Keep the strokes intact so a temporary upload failure never destroys work.
    }
  }, [strokes, addElement, clearStrokes, toast]);

  return {
    drawMode,
    setDrawMode,
    drawColor,
    setDrawColor,
    drawSize,
    setDrawSize,
    drawOpacity,
    setDrawOpacity,
    fillTolerance,
    setFillTolerance,
    toolMode,
    setToolMode,
    handleSaveDrawingAsElement,
  };
}
