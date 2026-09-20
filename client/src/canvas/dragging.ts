/** Moving elements by dragging, and snapping them to the stream edges. */

import { type CanvasElement } from "../types";
import { STREAM_OFFSET_X, STREAM_W, STREAM_OFFSET_Y, STREAM_H } from "./config";

// ---------------------------------------------------------------------------
// makeDraggable — move
// ---------------------------------------------------------------------------
export function makeDraggable(
  el: HTMLElement,
  getZoom: () => number,
  onUpdate: (changes: Partial<CanvasElement>) => void,
  onGroupDrag: (dx: number, dy: number, final: boolean) => void,
  onDblClick: (() => void) | null,
  options: {
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onSnapGuides?: (guideX?: number, guideY?: number) => void;
    canInteract?: () => boolean;
  } = {},
) {
  el.addEventListener(
    "mousedown",
    (e) => {
      if (options.canInteract && !options.canInteract()) return;
      if ((e.target as HTMLElement).classList.contains("rh")) return;
      const eventTarget = e.target as HTMLElement;
      const targetVideo = eventTarget.closest("video");
      if (eventTarget.closest("button, input, audio, .rh")) return;
      // Native video controls live in the bottom strip. Leave that area fully
      // interactive; the rest of the video supports click-to-play or
      // movement-threshold dragging.
      if (targetVideo) {
        const videoRect = targetVideo.getBoundingClientRect();
        if (e.clientY >= videoRect.bottom - Math.min(48, videoRect.height * 0.3)) return;
      }

      if (e.button !== 0) return;

      if (!targetVideo) e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseFloat(el.style.left) || 0;
      const startTop = parseFloat(el.style.top) || 0;
      let didDrag = false;
      let dragLastEmit = 0;
      let dragPending: Partial<CanvasElement> | null = null;
      let lastDx = 0;
      let lastDy = 0;

      const onMove = (ev: MouseEvent) => {
        const zoom = getZoom();
        const dx = (ev.clientX - startX) / zoom;
        const dy = (ev.clientY - startY) / zoom;
        if (!didDrag && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
          didDrag = true;
          ev.preventDefault();
          options.onDragStart?.();
        }
        if (!didDrag) return;

        const snapped = ev.altKey
          ? {
              x: startLeft + dx,
              y: startTop + dy,
              guideX: undefined,
              guideY: undefined,
            }
          : snapToStream(startLeft + dx, startTop + dy, el.offsetWidth, el.offsetHeight, 10 / zoom);
        lastDx = snapped.x - startLeft;
        lastDy = snapped.y - startTop;
        el.style.left = snapped.x + "px";
        el.style.top = snapped.y + "px";
        options.onSnapGuides?.(snapped.guideX, snapped.guideY);
        const ch = { x: snapped.x, y: snapped.y };
        dragPending = ch;
        const now = Date.now();
        // The DOM already moves every pointer event. State/socket updates only
        // need a modest cadence; flooding them creates an echo backlog that can
        // continue moving grouped elements after the pointer is released.
        if (now - dragLastEmit > 50) {
          dragLastEmit = now;
          onUpdate(ch);
          dragPending = null;
        }
        onGroupDrag(lastDx, lastDy, false);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);

        if (didDrag) {
          if (dragPending) {
            onUpdate(dragPending);
            dragPending = null;
          }
          onGroupDrag(lastDx, lastDy, true);
          options.onSnapGuides?.();
          options.onDragEnd?.();

          // Prevent video from toggling play/pause on drag release
          const video = el.querySelector("video");
          if (video) {
            const suppressVideo = (ev2: Event) => {
              ev2.stopImmediatePropagation();
              ev2.preventDefault();
              video.removeEventListener("click", suppressVideo, true);
            };
            video.addEventListener("click", suppressVideo, true);
          }
          // Also suppress on the container level
          const suppressEl = (ev2: MouseEvent) => {
            ev2.stopPropagation();
            el.removeEventListener("click", suppressEl, true);
          };
          el.addEventListener("click", suppressEl, true);
        }
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    true,
  );

  if (onDblClick) {
    el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      onDblClick();
    });
  }

  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

function snapToStream(x: number, y: number, width: number, height: number, threshold: number) {
  const left = STREAM_OFFSET_X;
  const right = STREAM_OFFSET_X + STREAM_W;
  const centerX = STREAM_OFFSET_X + STREAM_W / 2;
  const top = STREAM_OFFSET_Y;
  const bottom = STREAM_OFFSET_Y + STREAM_H;
  const centerY = STREAM_OFFSET_Y + STREAM_H / 2;
  let snappedX = x;
  let snappedY = y;
  let guideX: number | undefined;
  let guideY: number | undefined;

  // Stream guides are contextual to the visible output, not the surrounding
  // workspace. Keep edge snapping available while an element is entering the
  // stream, but disable every stream guide once its box is fully outside.
  const nearOrInsideStream =
    x + width >= left - threshold &&
    x <= right + threshold &&
    y + height >= top - threshold &&
    y <= bottom + threshold;
  if (!nearOrInsideStream) {
    return { x, y, guideX, guideY };
  }

  const xCandidates = [
    { distance: Math.abs(x - left), value: left, guide: left },
    {
      distance: Math.abs(x + width / 2 - centerX),
      value: centerX - width / 2,
      guide: centerX,
    },
    {
      distance: Math.abs(x + width - right),
      value: right - width,
      guide: right,
    },
  ].sort((a, b) => a.distance - b.distance);
  if (xCandidates[0].distance <= threshold) {
    snappedX = xCandidates[0].value;
    guideX = xCandidates[0].guide;
  }

  const yCandidates = [
    { distance: Math.abs(y - top), value: top, guide: top },
    {
      distance: Math.abs(y + height / 2 - centerY),
      value: centerY - height / 2,
      guide: centerY,
    },
    {
      distance: Math.abs(y + height - bottom),
      value: bottom - height,
      guide: bottom,
    },
  ].sort((a, b) => a.distance - b.distance);
  if (yCandidates[0].distance <= threshold) {
    snappedY = yCandidates[0].value;
    guideY = yCandidates[0].guide;
  }

  return { x: snappedX, y: snappedY, guideX, guideY };
}
