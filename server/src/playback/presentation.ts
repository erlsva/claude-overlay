/**
 * Showing an element for a moment: an automation may reveal, move or resize a layer, and later
 * puts it back exactly as it was. `presentationRestores` remembers how each layer was.
 */

import { STREAM_H, STREAM_OFFSET_X, STREAM_OFFSET_Y, STREAM_W } from "../config/canvas.js";
import { io } from "../runtime.js";
import { canvasStore } from "../state/canvasStore.js";
import type { CanvasElement, TriggerPlacement } from "../types.js";

interface PresentationRestore {
  changes: Partial<CanvasElement>;
  timer?: NodeJS.Timeout;
}

const presentationRestores = new Map<string, PresentationRestore>();

/** How an element looked before it was presented, so it can be put back. */
function snapshot(element: CanvasElement): Partial<CanvasElement> {
  return {
    visible: element.visible,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    dvdEnabled: element.dvdEnabled ?? false,
    autoVisibility: element.autoVisibility ?? false,
    flyStartedAt: 0,
    flyDurationMs: 0,
  };
}

/** Where a corner or edge placement puts an element: flush against the corner, 40px in from an edge. */
function edgePlacement(placement: string, width: number, height: number) {
  const horizontal = placement.endsWith("left")
    ? "left"
    : placement.endsWith("right")
      ? "right"
      : "center";
  const vertical = placement.startsWith("top")
    ? "top"
    : placement.startsWith("bottom")
      ? "bottom"
      : "center";
  const isCorner = horizontal !== "center" && vertical !== "center";
  const margin = isCorner ? 0 : 40;
  const x =
    horizontal === "left"
      ? STREAM_OFFSET_X + margin
      : horizontal === "right"
        ? STREAM_OFFSET_X + STREAM_W - width - margin
        : STREAM_OFFSET_X + (STREAM_W - width) / 2;
  const y =
    vertical === "top"
      ? STREAM_OFFSET_Y + margin
      : vertical === "bottom"
        ? STREAM_OFFSET_Y + STREAM_H - height - margin
        : STREAM_OFFSET_Y + (STREAM_H - height) / 2;
  return { x, y };
}

/** The changes a placement makes to an element, given its original size. */
function placementChanges(
  placement: TriggerPlacement,
  width: number,
  height: number,
): Partial<CanvasElement> {
  if (placement === "current") return {};
  if (placement === "random") {
    return {
      x: STREAM_OFFSET_X + Math.random() * Math.max(0, STREAM_W - width),
      y: STREAM_OFFSET_Y + Math.random() * Math.max(0, STREAM_H - height),
      rotation: 0,
    };
  }
  if (placement === "fit" || placement === "fill") {
    const factor =
      placement === "fit"
        ? Math.min(STREAM_W / width, STREAM_H / height)
        : Math.max(STREAM_W / width, STREAM_H / height);
    const fittedWidth = width * factor;
    const fittedHeight = height * factor;
    return {
      width: fittedWidth,
      height: fittedHeight,
      x: STREAM_OFFSET_X + (STREAM_W - fittedWidth) / 2,
      y: STREAM_OFFSET_Y + (STREAM_H - fittedHeight) / 2,
      rotation: 0,
    };
  }
  return { ...edgePlacement(placement, width, height), rotation: 0 };
}

/** Makes an element visible (and placed), remembering how to undo it. Returns that memory. */
export function presentElement(
  element: CanvasElement,
  placement: TriggerPlacement = "current",
  emitUpdate = true,
) {
  let pending = presentationRestores.get(element.id);
  if (!pending) {
    pending = { changes: snapshot(element) };
    presentationRestores.set(element.id, pending);
  } else if (pending.timer) {
    clearTimeout(pending.timer);
    delete pending.timer;
  }

  const originalWidth = pending.changes.width ?? element.width;
  const originalHeight = pending.changes.height ?? element.height;
  const changes: Partial<CanvasElement> = {
    visible: true,
    dvdEnabled: false,
    ...placementChanges(placement, originalWidth, originalHeight),
  };
  Object.assign(element, changes);
  if (emitUpdate) io.emit("element:updated", { id: element.id, changes });
  return pending;
}

/** Puts an element back the way it was before it was presented. */
export function restorePresentation(id: string) {
  const pending = presentationRestores.get(id);
  if (!pending) return;
  if (pending.timer) clearTimeout(pending.timer);
  presentationRestores.delete(id);
  const element = canvasStore.canvasState.elements.find((candidate) => candidate.id === id);
  if (!element) return;
  Object.assign(element, pending.changes);
  io.emit("element:updated", { id, changes: pending.changes });
}
