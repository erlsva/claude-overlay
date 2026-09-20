import { useEffect } from "react";
import { getDvdPosition } from "../../canvas/dvdMotion";
import type { useStageRefs } from "./useStageRefs";

/** Animating layers that bounce around like a DVD logo. */
export function useDvdMotion(
  deps: Pick<ReturnType<typeof useStageRefs>, "draggingRef" | "elementsRef" | "nodeMapRef">,
) {
  const { draggingRef, elementsRef, nodeMapRef } = deps;
  useEffect(() => {
    let frame = 0;
    const animateMovingElements = () => {
      const now = Date.now();
      for (const element of elementsRef.current) {
        if (draggingRef.current.has(element.id)) continue;
        const node = nodeMapRef.current.get(element.id);
        if (!node) continue;
        if (
          element.flyStartedAt &&
          element.flyDurationMs &&
          element.flyFromX !== undefined &&
          element.flyFromY !== undefined &&
          element.flyToX !== undefined &&
          element.flyToY !== undefined
        ) {
          const progress = Math.max(
            0,
            Math.min(1, (now - element.flyStartedAt) / element.flyDurationMs),
          );
          node.style.left = `${element.flyFromX + (element.flyToX - element.flyFromX) * progress}px`;
          node.style.top = `${element.flyFromY + (element.flyToY - element.flyFromY) * progress}px`;
        } else if (element.dvdEnabled) {
          const position = getDvdPosition(element, now);
          node.style.left = `${position.x}px`;
          node.style.top = `${position.y}px`;
        }
      }
      frame = requestAnimationFrame(animateMovingElements);
    };
    frame = requestAnimationFrame(animateMovingElements);
    return () => cancelAnimationFrame(frame);
  }, []);

  return {};
}
