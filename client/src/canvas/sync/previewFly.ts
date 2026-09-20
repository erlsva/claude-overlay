import { STREAM_OFFSET_X, STREAM_W, STREAM_OFFSET_Y, STREAM_H } from "../config";
import type { CanvasElement } from "../../types";
import type { SyncContext } from "./context";

/** Where a fly-across starts and ends for a direction such as "left-to-right-top", in workspace pixels. */
function flightPath(direction: string, element: CanvasElement) {
  const [movement, lane] = direction.split(/-(?=top$|center$|bottom$|left$|right$)/) as [
    string,
    string,
  ];
  const horizontal = movement === "left-to-right" || movement === "right-to-left";
  const laneX =
    lane === "left"
      ? STREAM_OFFSET_X
      : lane === "right"
        ? STREAM_OFFSET_X + STREAM_W - element.width
        : STREAM_OFFSET_X + (STREAM_W - element.width) / 2;
  const laneY =
    lane === "top"
      ? STREAM_OFFSET_Y
      : lane === "bottom"
        ? STREAM_OFFSET_Y + STREAM_H - element.height
        : STREAM_OFFSET_Y + (STREAM_H - element.height) / 2;
  let fromX = laneX;
  let toX = laneX;
  let fromY = laneY;
  let toY = laneY;
  if (horizontal) {
    fromX =
      movement === "left-to-right" ? STREAM_OFFSET_X - element.width : STREAM_OFFSET_X + STREAM_W;
    toX =
      movement === "left-to-right" ? STREAM_OFFSET_X + STREAM_W : STREAM_OFFSET_X - element.width;
  } else {
    fromY =
      movement === "top-to-bottom" ? STREAM_OFFSET_Y - element.height : STREAM_OFFSET_Y + STREAM_H;
    toY =
      movement === "top-to-bottom" ? STREAM_OFFSET_Y + STREAM_H : STREAM_OFFSET_Y - element.height;
  }
  return { fromX, fromY, toX, toY };
}

/** Lets the Studio preview a fly-across on a layer without changing it. */
export function installPreviewFly(ctx: SyncContext) {
  const { nodeMap, elementsRef, previewFlyRef } = ctx;
  if (previewFlyRef) {
    previewFlyRef.current = (id, direction, durationSeconds, onDone) => {
      const node = nodeMap.get(id);
      const element = elementsRef.current.find((item) => item.id === id);
      if (!node || !element) return null;
      const { fromX, fromY, toX, toY } = flightPath(direction, element);
      node.getAnimations().forEach((animation) => animation.cancel());
      const flight = node.animate(
        [
          { left: `${fromX}px`, top: `${fromY}px`, opacity: 1 },
          { left: `${toX}px`, top: `${toY}px`, opacity: 1 },
        ],
        {
          duration: Math.max(1, durationSeconds) * 1000,
          easing: "linear",
        },
      );
      flight.onfinish = () => onDone?.();
      flight.oncancel = () => onDone?.();
      return () => flight.cancel();
    };
  }
}
