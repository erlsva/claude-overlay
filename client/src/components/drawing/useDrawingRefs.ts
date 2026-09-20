import { useEffect, useRef } from "react";
import type { DrawToolMode } from "./renderStroke";

/** The canvases and the latest tool settings the drawing handlers read without re-subscribing. */
export function useDrawingRefs(settings: {
  color: string;
  size: number;
  toolMode: DrawToolMode;
  opacity: number;
  fillTolerance: number;
}) {
  const { color, size, toolMode, opacity, fillTolerance } = settings;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const shapePreviewRef = useRef<SVGPathElement>(null);
  // Offscreen canvas holding all *committed* strokes/fills already baked in.
  // Avoids ever re-running an expensive flood fill on every redraw.
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bakedCountRef = useRef(0);
  const livePointsRef = useRef<Array<[number, number]>>([]);
  const isDrawingRef = useRef(false);
  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  const toolRef = useRef(toolMode);
  const opacityRef = useRef(opacity);
  const fillToleranceRef = useRef(fillTolerance);
  const brushPreviewRef = useRef<HTMLDivElement>(null);
  const lastLiveEmitRef = useRef(0);
  const redrawFrameRef = useRef<number | null>(null);

  useEffect(() => {
    colorRef.current = color;
  }, [color]);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);
  useEffect(() => {
    toolRef.current = toolMode;
  }, [toolMode]);
  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);
  useEffect(() => {
    fillToleranceRef.current = fillTolerance;
  }, [fillTolerance]);

  return {
    canvasRef,
    previewCanvasRef,
    shapePreviewRef,
    baseCanvasRef,
    bakedCountRef,
    livePointsRef,
    isDrawingRef,
    colorRef,
    sizeRef,
    toolRef,
    opacityRef,
    fillToleranceRef,
    brushPreviewRef,
    lastLiveEmitRef,
    redrawFrameRef,
  };
}

export type DrawingRefs = ReturnType<typeof useDrawingRefs>;
