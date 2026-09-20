/** The resize and rotation handles drawn around a selected element. */

import { type CanvasElement } from "../types";
import {
  getScale,
  getRotation,
  setScale,
  applyNodeTransform,
  setRotation,
} from "./elementTransforms";
import { RotateCw } from "lucide-react";
import { iconHTML } from "./icons";

// ---------------------------------------------------------------------------
// 8-handle resize with proper flip/stretch
// ---------------------------------------------------------------------------
export type HandlePos = "tl" | "tc" | "tr" | "ml" | "mr" | "bl" | "bc" | "br";

const HANDLE_CURSORS: Record<HandlePos, string> = {
  tl: "nw-resize",
  tc: "n-resize",
  tr: "ne-resize",
  ml: "w-resize",
  mr: "e-resize",
  bl: "sw-resize",
  bc: "s-resize",
  br: "se-resize",
};

const HANDLE_POSITIONS: Record<HandlePos, string> = {
  tl: "top:0;left:0;transform:translate(-50%,-50%)",
  tc: "top:0;left:50%;transform:translate(-50%,-50%)",
  tr: "top:0;right:0;transform:translate(50%,-50%)",
  ml: "top:50%;left:0;transform:translate(-50%,-50%)",
  mr: "top:50%;right:0;transform:translate(50%,-50%)",
  bl: "bottom:0;left:0;transform:translate(-50%,50%)",
  bc: "bottom:0;left:50%;transform:translate(-50%,50%)",
  br: "bottom:0;right:0;transform:translate(50%,50%)",
};

export function addResizeHandle(
  container: HTMLElement,
  pos: HandlePos,
  getZoom: () => number,
  onUpdate: (changes: Partial<CanvasElement>) => void,
  canResize: () => boolean = () => true,
) {
  const btn = document.createElement("div");
  btn.className = `rh rh-${pos}`;
  btn.style.cssText = `
    position:absolute;${HANDLE_POSITIONS[pos]};
    width:10px;height:10px;background:white;border:1.5px solid var(--accent-border);
    border-radius:2px;cursor:${HANDLE_CURSORS[pos]};z-index:20;display:none;touch-action:none;
  `;

  btn.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (!canResize()) return;
    e.stopPropagation();
    e.preventDefault();
    // Keep all resize events targeted at this handle even when the pointer
    // crosses Twitch's cross-origin iframe. Without capture, the iframe eats
    // mousemove/mouseup and leaves the resize interaction stuck.
    btn.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = container.offsetWidth;
    const startH = container.offsetHeight;
    const startScale = getScale(container);
    const startSignX = startScale.x < 0 ? -1 : 1;
    const startSignY = startScale.y < 0 ? -1 : 1;
    const startLeft = parseFloat(container.style.left) || 0;
    const startTop = parseFloat(container.style.top) || 0;
    const startRotation = (getRotation(container) * Math.PI) / 180;
    const cos = Math.cos(startRotation);
    const sin = Math.sin(startRotation);
    const startCenterX = startLeft + startW / 2;
    const startCenterY = startTop + startH / 2;
    let lastEmit = 0;
    let pendingChanges: Partial<CanvasElement> | null = null;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const zoom = getZoom();
      const screenDx = (ev.clientX - startX) / zoom;
      const screenDy = (ev.clientY - startY) / zoom;
      // Resize in the element's own coordinate system. Applying screen-space
      // deltas directly makes a 90°-rotated element resize sideways, and also
      // moves the supposedly fixed opposite handle.
      const dx = screenDx * cos + screenDy * sin;
      const dy = -screenDx * sin + screenDy * cos;

      // All 8 handles: pure resize (change width/height, anchor opposite edge/corner).
      // Scale is always reset to ±1 so any prior stretch is cleared on resize.
      let newW = startW,
        newH = startH;
      let newLeft = startLeft,
        newTop = startTop;
      let newSX = startSignX,
        newSY = startSignY;

      const hasRight = pos === "tr" || pos === "mr" || pos === "br";
      const hasLeft = pos === "tl" || pos === "ml" || pos === "bl";

      if (hasRight) {
        const rightEdge = startLeft + startW + dx;
        if (rightEdge >= startLeft) {
          newW = Math.max(1, rightEdge - startLeft);
          newLeft = startLeft;
          newSX = startSignX;
        } else {
          newW = Math.max(1, startLeft - rightEdge);
          newLeft = rightEdge;
          newSX = -startSignX;
        }
      } else if (hasLeft) {
        const rightEdge = startLeft + startW;
        const leftEdge = startLeft + dx;
        if (leftEdge <= rightEdge) {
          newW = Math.max(1, rightEdge - leftEdge);
          newLeft = leftEdge;
          newSX = startSignX;
        } else {
          newW = Math.max(1, leftEdge - rightEdge);
          newLeft = rightEdge;
          newSX = -startSignX;
        }
      }

      const hasBottom = pos === "bl" || pos === "bc" || pos === "br";
      const hasTop = pos === "tl" || pos === "tc" || pos === "tr";

      if (hasBottom) {
        const bottomEdge = startTop + startH + dy;
        if (bottomEdge >= startTop) {
          newH = Math.max(1, bottomEdge - startTop);
          newTop = startTop;
          newSY = startSignY;
        } else {
          newH = Math.max(1, startTop - bottomEdge);
          newTop = bottomEdge;
          newSY = -startSignY;
        }
      } else if (hasTop) {
        const bottomEdge = startTop + startH;
        const topEdge = startTop + dy;
        if (topEdge <= bottomEdge) {
          newH = Math.max(1, bottomEdge - topEdge);
          newTop = topEdge;
          newSY = startSignY;
        } else {
          newH = Math.max(1, topEdge - bottomEdge);
          newTop = bottomEdge;
          newSY = -startSignY;
        }
      }

      // The calculations above describe the resized box in its unrotated local
      // space. Rotate its center displacement back into workspace coordinates
      // so the opposite edge/corner remains visually anchored.
      const localCenterShiftX = newLeft + newW / 2 - startCenterX;
      const localCenterShiftY = newTop + newH / 2 - startCenterY;
      const centerX = startCenterX + localCenterShiftX * cos - localCenterShiftY * sin;
      const centerY = startCenterY + localCenterShiftX * sin + localCenterShiftY * cos;
      newLeft = centerX - newW / 2;
      newTop = centerY - newH / 2;

      container.style.width = newW + "px";
      container.style.height = newH + "px";
      container.style.left = newLeft + "px";
      container.style.top = newTop + "px";
      setScale(container, newSX, newSY);
      applyNodeTransform(container);
      const changes = {
        x: newLeft,
        y: newTop,
        width: newW,
        height: newH,
        scaleX: newSX,
        scaleY: newSY,
      };
      pendingChanges = changes;
      const now = Date.now();
      if (now - lastEmit > 16) {
        lastEmit = now;
        onUpdate(changes);
        pendingChanges = null;
      }
    };

    let finished = false;
    const finish = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId || finished) return;
      finished = true;
      btn.removeEventListener("pointermove", onMove);
      btn.removeEventListener("pointerup", finish);
      btn.removeEventListener("pointercancel", finish);
      btn.removeEventListener("lostpointercapture", finish);
      if (pendingChanges) onUpdate(pendingChanges);
      if (btn.hasPointerCapture(e.pointerId)) {
        btn.releasePointerCapture(e.pointerId);
      }
    };
    btn.addEventListener("pointermove", onMove);
    btn.addEventListener("pointerup", finish);
    btn.addEventListener("pointercancel", finish);
    btn.addEventListener("lostpointercapture", finish);
  });

  container.appendChild(btn);
  return btn;
}

export function addRotationHandle(
  container: HTMLElement,
  onUpdate: (changes: Partial<CanvasElement>) => void,
  canRotate: () => boolean = () => true,
  onStart?: () => void,
  onEnd?: () => void,
  getPivot?: () => { x: number; y: number } | null,
  onGroupRotate?: (deltaDegrees: number) => void,
) {
  const handle = document.createElement("div");
  handle.className = "rh rotation-handle";
  handle.title = "Drag to rotate · Hold Shift to snap to 15° increments";
  handle.setAttribute("role", "button");
  handle.setAttribute("aria-label", "Rotate element");
  handle.style.cssText =
    "position:absolute;top:-38px;left:50%;transform:translateX(-50%);" +
    "width:18px;height:18px;display:none;align-items:center;justify-content:center;" +
    "box-sizing:border-box;border:1.5px solid var(--accent-border);border-radius:50%;" +
    "background:#fff;color:#303038;cursor:grab;z-index:22;touch-action:none;" +
    "box-shadow:0 1px 4px rgba(0,0,0,.45);";
  handle.innerHTML = iconHTML(RotateCw, 11);

  const connector = document.createElement("span");
  connector.style.cssText =
    "position:absolute;left:50%;top:16px;width:1.5px;height:22px;" +
    "transform:translateX(-50%);background:var(--accent-border);pointer-events:none;z-index:-1;";
  handle.appendChild(connector);

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !canRotate()) return;
    event.preventDefault();
    event.stopPropagation();
    handle.style.cursor = "grabbing";
    handle.setPointerCapture(event.pointerId);
    onStart?.();

    const rect = container.getBoundingClientRect();
    const pivot = getPivot?.();
    const centerX = pivot?.x ?? rect.left + rect.width / 2;
    const centerY = pivot?.y ?? rect.top + rect.height / 2;
    const startRotation = getRotation(container);
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    let pending: Partial<CanvasElement> | null = null;
    let lastEmit = 0;

    const move = (moveEvent: PointerEvent) => {
      const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      let rotation = startRotation + ((angle - startAngle) * 180) / Math.PI;
      if (moveEvent.shiftKey) rotation = Math.round(rotation / 15) * 15;
      const delta = rotation - startRotation;
      if (onGroupRotate && pivot) {
        onGroupRotate(delta);
      } else {
        setRotation(container, rotation);
        applyNodeTransform(container);
        pending = { rotation };
      }
      const now = Date.now();
      if (pending && now - lastEmit >= 16) {
        lastEmit = now;
        onUpdate(pending);
        pending = null;
      }
    };
    const finish = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      handle.style.cursor = "grab";
      if (pending) onUpdate(pending);
      onEnd?.();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  });

  container.appendChild(handle);
  return handle;
}
