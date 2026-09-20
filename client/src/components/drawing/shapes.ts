import { arrowHeadLength } from "./renderStroke";

type Point = [number, number];

/** With Shift held: rectangles and ellipses become squares and circles, lines snap to 45°. */
export function constrainShapePoint(tool: string, point: Point, start: Point): Point {
  if (tool === "rectangle" || tool === "ellipse") {
    const dx = point[0] - start[0];
    const dy = point[1] - start[1];
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return [start[0] + Math.sign(dx || 1) * side, start[1] + Math.sign(dy || 1) * side];
  }
  if (tool === "line" || tool === "arrow") {
    const dx = point[0] - start[0];
    const dy = point[1] - start[1];
    const length = Math.hypot(dx, dy);
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return [start[0] + Math.cos(angle) * length, start[1] + Math.sin(angle) * length];
  }
  return point;
}

/** The SVG path shown while a shape is being dragged out, in canvas-local coordinates. */
export function shapePreviewPath(
  tool: string,
  start: Point,
  end: Point,
  size: number,
  offsetX: number,
  offsetY: number,
) {
  const x1 = start[0] - offsetX,
    y1 = start[1] - offsetY;
  const x2 = end[0] - offsetX,
    y2 = end[1] - offsetY;
  let d = "";
  if (tool === "rectangle") {
    d = `M ${x1} ${y1} H ${x2} V ${y2} H ${x1} Z`;
  } else if (tool === "ellipse") {
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    d =
      rx > 0 && ry > 0
        ? `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`
        : "";
  } else {
    d = `M ${x1} ${y1} L ${x2} ${y2}`;
    if (tool === "arrow") {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = arrowHeadLength(size);
      d += ` M ${x2} ${y2} L ${x2 - head * Math.cos(angle - Math.PI / 6)} ${y2 - head * Math.sin(angle - Math.PI / 6)}`;
      d += ` M ${x2} ${y2} L ${x2 - head * Math.cos(angle + Math.PI / 6)} ${y2 - head * Math.sin(angle + Math.PI / 6)}`;
    }
  }
  return d;
}
