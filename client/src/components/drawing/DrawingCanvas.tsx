import { useEffect } from "react";
import type { DrawStroke, LiveDrawStroke } from "../../types";
import { attachDrawingInput } from "./drawingInput";
import type { DrawToolMode } from "./renderStroke";
import { useCommittedStrokes } from "./useCommittedStrokes";
import { useDrawingRefs } from "./useDrawingRefs";
import { useLivePreview } from "./useLivePreview";

export type { DrawToolMode } from "./renderStroke";

interface DrawingCanvasProps {
  width: number;
  height: number;
  strokes: DrawStroke[];
  liveStrokes?: Map<string, LiveDrawStroke>;
  drawMode: boolean;
  toolMode: DrawToolMode;
  color: string;
  size: number;
  opacity: number;
  fillTolerance: number;
  onStroke: (stroke: DrawStroke) => void;
  onFillRejected?: () => void;
  onLiveStroke?: (data: Omit<LiveDrawStroke, "userId">) => void;
  offsetX?: number;
  offsetY?: number;
  zIndex?: number;
}

/** The dashboard's drawing layer: committed strokes, live previews and the mouse tools that make new ones. */
export function DrawingCanvas({
  width,
  height,
  strokes,
  liveStrokes,
  drawMode,
  toolMode,
  color,
  size,
  opacity,
  fillTolerance,
  onStroke,
  onFillRejected,
  onLiveStroke,
  offsetX = 0,
  offsetY = 0,
  zIndex = 1,
}: DrawingCanvasProps) {
  const refs = useDrawingRefs({ color, size, toolMode, opacity, fillTolerance });
  useCommittedStrokes(strokes, { width, height, offsetX, offsetY }, refs);
  const redrawAll = useLivePreview(strokes, liveStrokes, { offsetX, offsetY }, refs);

  useEffect(() => {
    const canvas = refs.previewCanvasRef.current;
    if (!canvas || !drawMode) return;
    return attachDrawingInput({
      canvas,
      offsetX,
      offsetY,
      refs,
      redrawAll,
      onStroke,
      onFillRejected,
      onLiveStroke,
    });
  }, [drawMode, onStroke, onFillRejected, onLiveStroke, redrawAll, offsetX, offsetY]);

  const cursor = !drawMode
    ? "default"
    : toolMode === "fill"
      ? "cell"
      : ["pen", "eraser"].includes(toolMode)
        ? "none"
        : "crosshair";

  return (
    <>
      <canvas
        ref={refs.canvasRef}
        width={width}
        height={height}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          pointerEvents: "none",
          // Uploaded layers use timestamp-based z-indices, so drawing mode must
          // sit above them rather than relying on a small fixed layer number.
          zIndex: drawMode ? 2147483646 : zIndex,
        }}
      />
      <canvas
        ref={refs.previewCanvasRef}
        width={width}
        height={height}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          pointerEvents: drawMode ? "all" : "none",
          cursor,
          zIndex: drawMode ? 2147483647 : zIndex + 1,
        }}
      />
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${width} ${height}`}
        style={{
          position: "absolute",
          inset: 0,
          width,
          height,
          overflow: "visible",
          pointerEvents: "none",
          zIndex: 2147483647,
        }}
      >
        <path
          ref={refs.shapePreviewRef}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: "none" }}
        />
      </svg>
      <div
        ref={refs.brushPreviewRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          zIndex: 2147483647,
          display: "none",
          boxSizing: "border-box",
          border: "1px solid",
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          boxShadow: "0 0 0 1px rgba(0,0,0,.65)",
        }}
      />
    </>
  );
}
