import type { DrawStroke, LiveDrawStroke } from "../../types";
import { randomUUID } from "../../utils";
import { floodFill, hexToRGBA, withOpacity } from "./floodFill";
import { SHAPE_TOOLS } from "./renderStroke";
import { constrainShapePoint, shapePreviewPath } from "./shapes";
import type { DrawingRefs } from "./useDrawingRefs";

export interface DrawingInputEnv {
  canvas: HTMLCanvasElement;
  offsetX: number;
  offsetY: number;
  refs: DrawingRefs;
  redrawAll: () => void;
  onStroke: (stroke: DrawStroke) => void;
  onFillRejected?: () => void;
  onLiveStroke?: (data: Omit<LiveDrawStroke, "userId">) => void;
}

/**
 * Wires the mouse to the drawing canvas: pen, eraser, shapes and fill. Returns a function that
 * removes the listeners again.
 */
export function attachDrawingInput(env: DrawingInputEnv): () => void {
  const { canvas, offsetX, offsetY, refs, redrawAll, onStroke, onFillRejected, onLiveStroke } = env;
  const {
    canvasRef,
    shapePreviewRef,
    livePointsRef,
    isDrawingRef,
    colorRef,
    sizeRef,
    toolRef,
    opacityRef,
    fillToleranceRef,
    brushPreviewRef,
    lastLiveEmitRef,
  } = refs;

  const getPoint = (e: MouseEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return [(e.clientX - rect.left) * scaleX + offsetX, (e.clientY - rect.top) * scaleY + offsetY];
  };

  const shapePoint = (event: MouseEvent): [number, number] => {
    const point = getPoint(event);
    const start = livePointsRef.current[0];
    if (!start || !event.shiftKey) return point;
    return constrainShapePoint(toolRef.current, point, start);
  };

  const updateShapePreview = () => {
    const path = shapePreviewRef.current;
    const [start, end] = livePointsRef.current;
    if (!path || !start || !end) return;
    path.setAttribute(
      "d",
      shapePreviewPath(toolRef.current, start, end, sizeRef.current, offsetX, offsetY),
    );
    path.setAttribute("stroke", colorRef.current);
    path.setAttribute("stroke-width", String(sizeRef.current));
    path.setAttribute("opacity", String(opacityRef.current));
    path.style.display = "block";
  };

  const hideShapePreview = () => {
    const path = shapePreviewRef.current;
    if (!path) return;
    path.style.display = "none";
    path.removeAttribute("d");
  };

  /** Paint-bucket click: fill locally at once, then share it as a draw action. */
  const fillAt = (e: MouseEvent) => {
    const [wx, wy] = getPoint(e);
    const committedCanvas = canvasRef.current;
    if (!committedCanvas) return;
    const ctx = committedCanvas.getContext("2d")!;
    const filled = floodFill(
      ctx,
      wx - offsetX,
      wy - offsetY,
      withOpacity(hexToRGBA(colorRef.current), opacityRef.current),
      fillToleranceRef.current,
      true,
    );
    if (!filled) {
      onFillRejected?.();
      return;
    }
    // Emit as a draw action so other clients + overlay can replay
    onStroke({
      id: randomUUID(),
      points: [],
      color: colorRef.current,
      size: 0,
      eraser: false,
      fillX: wx,
      fillY: wy,
      tool: "fill",
      opacity: opacityRef.current,
      fillTolerance: fillToleranceRef.current,
    });
  };

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (toolRef.current === "fill") {
      fillAt(e);
      return;
    }

    isDrawingRef.current = true;
    livePointsRef.current = [getPoint(e)];
    if (!SHAPE_TOOLS.includes(toolRef.current)) redrawAll();
  };

  const onMove = (e: MouseEvent) => {
    if (!isDrawingRef.current) return;
    const isShape = SHAPE_TOOLS.includes(toolRef.current);
    const point = isShape ? shapePoint(e) : getPoint(e);
    if (isShape) livePointsRef.current = [livePointsRef.current[0], point];
    else livePointsRef.current.push(point);
    if (isShape) updateShapePreview();
    else redrawAll();
    const now = Date.now();
    // Shape previews are lightweight SVG locally, so they can be sent at
    // display-frame cadence. A 50 ms interval made the OBS overlay visibly
    // advance in 20 fps steps even though the dashboard itself was smooth.
    const broadcastInterval = isShape ? 16 : 32;
    if (onLiveStroke && now - lastLiveEmitRef.current > broadcastInterval) {
      lastLiveEmitRef.current = now;
      onLiveStroke({
        points: livePointsRef.current,
        color: colorRef.current,
        size: sizeRef.current,
        eraser: toolRef.current === "eraser",
        tool: toolRef.current === "fill" ? "pen" : toolRef.current,
        opacity: opacityRef.current,
      });
    }
  };

  const onUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const pts = livePointsRef.current;
    livePointsRef.current = [];
    hideShapePreview();
    if (pts.length > 0) {
      onStroke({
        id: randomUUID(),
        points: pts,
        color: colorRef.current,
        size: sizeRef.current,
        eraser: toolRef.current === "eraser",
        tool: toolRef.current,
        opacity: opacityRef.current,
      });
    } else {
      onLiveStroke?.({ points: [], color: "", size: 0, eraser: false });
      redrawAll();
    }
  };

  /** The circle that follows the cursor to show the pen or eraser size. */
  const updatePreview = (event: MouseEvent) => {
    const preview = brushPreviewRef.current;
    if (!preview) return;
    if (!["pen", "eraser"].includes(toolRef.current)) {
      preview.style.display = "none";
      return;
    }
    const [x, y] = getPoint(event);
    preview.style.display = "block";
    preview.style.left = `${x - offsetX}px`;
    preview.style.top = `${y - offsetY}px`;
    preview.style.width = `${sizeRef.current}px`;
    preview.style.height = `${sizeRef.current}px`;
    preview.style.borderColor = toolRef.current === "eraser" ? "#ffffff" : colorRef.current;
    preview.style.opacity = String(Math.max(0.35, opacityRef.current));
  };
  const hidePreview = () => {
    if (brushPreviewRef.current) brushPreviewRef.current.style.display = "none";
  };

  canvas.addEventListener("mousedown", onDown);
  canvas.addEventListener("mousemove", updatePreview);
  canvas.addEventListener("mouseleave", hidePreview);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  return () => {
    canvas.removeEventListener("mousedown", onDown);
    canvas.removeEventListener("mousemove", updatePreview);
    canvas.removeEventListener("mouseleave", hidePreview);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
}
