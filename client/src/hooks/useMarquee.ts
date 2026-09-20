import { type CanvasElement } from "../types";
import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Marquee selection
// ---------------------------------------------------------------------------
export function useMarquee(
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  workspaceRef: React.RefObject<HTMLDivElement | null>,
  panRef: React.MutableRefObject<{ x: number; y: number }>,
  zoomRef: React.MutableRefObject<number>,
  elements: CanvasElement[],
  onSelectMany: (ids: string[]) => void,
  onClearSelect: () => void,
) {
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const workspace = workspaceRef.current;
    if (!wrapper || !workspace) return;

    const marquee = document.createElement("div");
    marquee.style.cssText =
      "position:absolute;border:1.5px dashed var(--accent-border);background:rgba(var(--accent-rgb),0.08);display:none;z-index:500;box-sizing:border-box;";
    wrapper.appendChild(marquee);

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (
        target !== workspace &&
        !target.classList.contains("viewport-rect") &&
        !target.classList.contains("canvas-interaction-surface")
      )
        return;

      const rect = wrapper.getBoundingClientRect();
      const startScreenX = e.clientX - rect.left;
      const startScreenY = e.clientY - rect.top;
      let didMove = false;

      const onMove = (ev: MouseEvent) => {
        const curX = ev.clientX - rect.left;
        const curY = ev.clientY - rect.top;
        const dx = curX - startScreenX;
        const dy = curY - startScreenY;
        if (!didMove && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        didMove = true;
        const x = Math.min(startScreenX, curX);
        const y = Math.min(startScreenY, curY);
        marquee.style.cssText = marquee.style.cssText.replace(/display:[^;]+/, "");
        Object.assign(marquee.style, {
          display: "block",
          left: x + "px",
          top: y + "px",
          width: Math.abs(dx) + "px",
          height: Math.abs(dy) + "px",
        });
      };

      const onUp = (ev: MouseEvent) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        marquee.style.display = "none";

        if (!didMove) {
          onClearSelect();
          return;
        }

        const curX = ev.clientX - rect.left;
        const curY = ev.clientY - rect.top;
        const sx = Math.min(startScreenX, curX);
        const sy = Math.min(startScreenY, curY);
        const sw = Math.abs(curX - startScreenX);
        const sh = Math.abs(curY - startScreenY);

        const z = zoomRef.current;
        const p = panRef.current;
        const wx = (sx - p.x) / z;
        const wy = (sy - p.y) / z;
        const ww = sw / z;
        const wh = sh / z;

        const hit: string[] = [];
        for (const el of elements) {
          if (!el.visible) continue;
          const overlap = !(
            el.x > wx + ww ||
            el.x + el.width < wx ||
            el.y > wy + wh ||
            el.y + el.height < wy
          );
          if (overlap) hit.push(el.id);
        }
        if (hit.length > 0) onSelectMany(hit);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };

    wrapper.addEventListener("mousedown", onDown);
    return () => {
      wrapper.removeEventListener("mousedown", onDown);
      marquee.remove();
    };
  }, [elements, onSelectMany, onClearSelect]);
}
