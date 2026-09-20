/** Copy and paste of canvas elements between browser tabs. */

import { type CanvasElement } from "../../types";

export function isEditingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.matches("input, textarea, select") || target.isContentEditable)
  );
}

export function validClipboardElement(value: unknown): value is CanvasElement {
  if (!value || typeof value !== "object") return false;
  const element = value as Partial<CanvasElement>;
  return (
    typeof element.id === "string" &&
    ["image", "gif", "video", "audio", "text"].includes(element.type ?? "") &&
    typeof element.src === "string" &&
    typeof element.x === "number" &&
    typeof element.y === "number" &&
    typeof element.width === "number" &&
    typeof element.height === "number"
  );
}
