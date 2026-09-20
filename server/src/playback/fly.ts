import { STREAM_H, STREAM_OFFSET_X, STREAM_OFFSET_Y, STREAM_W } from "../config/canvas.js";
import { io } from "../runtime.js";
import type { CanvasElement, FlyDirection } from "../types.js";
import { presentElement, restorePresentation } from "./presentation.js";

/** Where a fly-across starts and ends, as top-left positions of the element. */
function flyPath(direction: FlyDirection, width: number, height: number) {
  const [movement, lane] = direction.split(/-(?=top$|center$|bottom$|left$|right$)/) as [
    string,
    string,
  ];
  const laneX =
    lane === "left"
      ? STREAM_OFFSET_X
      : lane === "right"
        ? STREAM_OFFSET_X + STREAM_W - width
        : STREAM_OFFSET_X + (STREAM_W - width) / 2;
  const laneY =
    lane === "top"
      ? STREAM_OFFSET_Y
      : lane === "bottom"
        ? STREAM_OFFSET_Y + STREAM_H - height
        : STREAM_OFFSET_Y + (STREAM_H - height) / 2;
  let fromX = laneX;
  let toX = laneX;
  let fromY = laneY;
  let toY = laneY;
  if (movement === "left-to-right" || movement === "right-to-left") {
    fromX = movement === "left-to-right" ? STREAM_OFFSET_X - width : STREAM_OFFSET_X + STREAM_W;
    toX = movement === "left-to-right" ? STREAM_OFFSET_X + STREAM_W : STREAM_OFFSET_X - width;
  } else {
    fromY = movement === "top-to-bottom" ? STREAM_OFFSET_Y - height : STREAM_OFFSET_Y + STREAM_H;
    toY = movement === "top-to-bottom" ? STREAM_OFFSET_Y + STREAM_H : STREAM_OFFSET_Y - height;
  }
  return { fromX, fromY, toX, toY };
}

/** Sends an element flying across the stream, then puts it back as it was. */
export function flyElement(
  element: CanvasElement,
  direction: FlyDirection = "left-to-right-bottom",
  durationSeconds = 5,
) {
  const pending = presentElement(element, "current", false);
  const width = pending?.changes.width ?? element.width;
  const height = pending?.changes.height ?? element.height;
  const { fromX, fromY, toX, toY } = flyPath(direction, width, height);
  const durationMs = Math.max(1, durationSeconds) * 1000;
  const changes: Partial<CanvasElement> = {
    visible: true,
    dvdEnabled: false,
    rotation: 0,
    x: fromX,
    y: fromY,
    flyStartedAt: Date.now(),
    flyDurationMs: durationMs,
    flyFromX: fromX,
    flyFromY: fromY,
    flyToX: toX,
    flyToY: toY,
  };
  Object.assign(element, changes);
  io.emit("element:updated", { id: element.id, changes });
  if (element.type === "video") {
    io.emit("media:control", { id: element.id, action: "play", currentTime: 0 });
  }
  if (pending) {
    pending.timer = setTimeout(() => {
      if (element.type === "video") {
        io.emit("media:control", { id: element.id, action: "pause", currentTime: 0 });
      }
      restorePresentation(element.id);
    }, durationMs);
  }
}
