import type { DrawStroke } from "../../types";
import { floodFill, hexToRGBA, withOpacity } from "./floodFill";

/** Tools that are drawn from where the mouse went down to where it is now, instead of following it. */
export const SHAPE_TOOLS = ["line", "arrow", "rectangle", "ellipse"];

export type DrawToolMode = "pen" | "eraser" | "fill" | "line" | "arrow" | "rectangle" | "ellipse";

/** How big the two arrow-head strokes are for a given line width. */
export function arrowHeadLength(size: number) {
  return Math.max(10, Math.min(30, size * 3));
}

// ---------------------------------------------------------------------------
// Render a single action (stroke or fill) onto a canvas context
// ---------------------------------------------------------------------------

export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Pick<DrawStroke, "points" | "color" | "size" | "eraser" | "tool" | "opacity">,
  offsetX = 0,
  offsetY = 0,
) {
  const { points, color, size, eraser } = stroke;
  if (points.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
  ctx.globalAlpha = stroke.opacity ?? 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const tool = stroke.tool ?? (eraser ? "eraser" : "pen");
  if (SHAPE_TOOLS.includes(tool) && points.length >= 2) {
    const [start, end] = [points[0], points[points.length - 1]];
    const x1 = start[0] - offsetX,
      y1 = start[1] - offsetY;
    const x2 = end[0] - offsetX,
      y2 = end[1] - offsetY;
    ctx.beginPath();
    if (tool === "rectangle") {
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    } else if (tool === "ellipse") {
      ctx.ellipse(
        (x1 + x2) / 2,
        (y1 + y2) / 2,
        Math.abs(x2 - x1) / 2,
        Math.abs(y2 - y1) / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    } else {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      if (tool === "arrow") {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = arrowHeadLength(size);
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - head * Math.cos(angle - Math.PI / 6),
          y2 - head * Math.sin(angle - Math.PI / 6),
        );
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - head * Math.cos(angle + Math.PI / 6),
          y2 - head * Math.sin(angle + Math.PI / 6),
        );
      }
      ctx.stroke();
    }
  } else if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0][0] - offsetX, points[0][1] - offsetY, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(points[0][0] - offsetX, points[0][1] - offsetY);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0] - offsetX, points[i][1] - offsetY);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function renderAction(
  ctx: CanvasRenderingContext2D,
  action: DrawStroke,
  offsetX = 0,
  offsetY = 0,
) {
  if (action.fillX !== undefined && action.fillY !== undefined) {
    floodFill(
      ctx,
      action.fillX - offsetX,
      action.fillY - offsetY,
      withOpacity(hexToRGBA(action.color), action.opacity ?? 1),
      action.fillTolerance ?? 64,
    );
  } else {
    renderStroke(ctx, action, offsetX, offsetY);
  }
}
