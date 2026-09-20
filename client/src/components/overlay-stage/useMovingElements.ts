import { useEffect } from "react";
import { STREAM_OFFSET_X, STREAM_OFFSET_Y, STREAM_W, STREAM_H } from "../../canvas/config";
import { getDvdPosition } from "../../canvas/dvdMotion";
import type { CanvasElement } from "../../types";
import type { DvdBounceState } from "./types";
import type { OverlayRefs } from "./useOverlayRefs";

type MovementRefs = Pick<
  OverlayRefs,
  | "nodeMapRef"
  | "posMapRef"
  | "targetMapRef"
  | "flyingRef"
  | "dvdBounceStateRef"
  | "overlayElementsRef"
>;

/** True while an element is on a fly-across, which the server describes with these fields. */
export function isFlying(element: CanvasElement) {
  return Boolean(
    element.flyStartedAt &&
    element.flyDurationMs &&
    element.flyFromX !== undefined &&
    element.flyFromY !== undefined &&
    element.flyToX !== undefined &&
    element.flyToY !== undefined,
  );
}

/** Puts a flying element where it should be at `now` on its straight line from start to end. */
function moveFlyingElement(
  element: CanvasElement,
  node: HTMLElement,
  now: number,
  refs: MovementRefs,
) {
  const progress = Math.max(0, Math.min(1, (now - element.flyStartedAt!) / element.flyDurationMs!));
  const x = element.flyFromX! + (element.flyToX! - element.flyFromX!) * progress - STREAM_OFFSET_X;
  const y = element.flyFromY! + (element.flyToY! - element.flyFromY!) * progress - STREAM_OFFSET_Y;
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  const current = refs.posMapRef.current.get(element.id);
  if (current) Object.assign(current, { x, y, rotation: 0 });
  refs.targetMapRef.current.set(element.id, { x, y, rotation: 0 });
  refs.flyingRef.current.add(element.id);
}

/**
 * Notes when a bouncing element reverses direction. Axis reflections can land on adjacent
 * animation frames, so two reversals within 50 ms count as one genuine corner collision.
 * Returns the corner that was hit, if any.
 */
function detectCornerHit(previous: DvdBounceState, x: number, y: number, now: number) {
  const dx = x - previous.x;
  const dy = y - previous.y;
  const bouncedX = previous.dx !== 0 && dx !== 0 && Math.sign(previous.dx) !== Math.sign(dx);
  const bouncedY = previous.dy !== 0 && dy !== 0 && Math.sign(previous.dy) !== Math.sign(dy);
  if (bouncedX) {
    previous.lastXBounce = now;
    previous.lastXEdge = previous.dx > 0 ? "right" : "left";
  }
  if (bouncedY) {
    previous.lastYBounce = now;
    previous.lastYEdge = previous.dy > 0 ? "bottom" : "top";
  }
  previous.x = x;
  previous.y = y;
  previous.dx = dx;
  previous.dy = dy;

  if (
    (bouncedX || bouncedY) &&
    Math.abs(previous.lastXBounce - previous.lastYBounce) <= 50 &&
    now - previous.lastCelebration > 1500
  ) {
    previous.lastCelebration = now;
    return {
      x: previous.lastXEdge === "left" ? 0 : STREAM_W,
      y: previous.lastYEdge === "top" ? 0 : STREAM_H,
    };
  }
  return null;
}

/** Moves a bouncing element along its path and reports the corner it hit, if any. */
function moveDvdElement(
  element: CanvasElement,
  node: HTMLElement,
  now: number,
  refs: MovementRefs,
  onCornerHit: (cornerX: number, cornerY: number) => void,
) {
  const position = getDvdPosition(element, now);
  const x = position.x - STREAM_OFFSET_X;
  const y = position.y - STREAM_OFFSET_Y;
  const previous = refs.dvdBounceStateRef.current.get(element.id);
  if (previous) {
    const corner = detectCornerHit(previous, x, y, now);
    if (corner) onCornerHit(corner.x, corner.y);
  } else {
    refs.dvdBounceStateRef.current.set(element.id, {
      x,
      y,
      dx: 0,
      dy: 0,
      lastXBounce: -Infinity,
      lastYBounce: Infinity,
      lastXEdge: "left",
      lastYEdge: "top",
      lastCelebration: -Infinity,
    });
  }
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  const current = refs.posMapRef.current.get(element.id);
  if (current) {
    current.x = x;
    current.y = y;
  }
}

/** Every animation frame: moves flying and bouncing elements and celebrates corner hits. */
export function useMovingElements(
  refs: MovementRefs,
  onCornerHit: (cornerX: number, cornerY: number) => void,
) {
  const { nodeMapRef, dvdBounceStateRef, overlayElementsRef } = refs;
  useEffect(() => {
    let frame = 0;
    const animateMovingElements = () => {
      const now = Date.now();
      for (const element of overlayElementsRef.current) {
        if (!element.visible || element.type === "audio") continue;
        const node = nodeMapRef.current.get(element.id);
        if (!node) continue;
        if (isFlying(element)) {
          moveFlyingElement(element, node, now, refs);
          continue;
        }
        if (!element.dvdEnabled) continue;
        moveDvdElement(element, node, now, refs, onCornerHit);
      }
      const activeIds = new Set(
        overlayElementsRef.current
          .filter((element) => element.dvdEnabled && element.visible)
          .map((element) => element.id),
      );
      for (const id of dvdBounceStateRef.current.keys()) {
        if (!activeIds.has(id)) dvdBounceStateRef.current.delete(id);
      }
      frame = requestAnimationFrame(animateMovingElements);
    };
    frame = requestAnimationFrame(animateMovingElements);
    return () => cancelAnimationFrame(frame);
  }, []);
}
