import { useRef, useState, useCallback, useEffect } from "react";
import { STREAM_W, STREAM_H, STREAM_OFFSET_X, STREAM_OFFSET_Y } from "../../canvas/config";
import type { CanvasStageProps } from "./types";
import type { useStageRefs } from "./useStageRefs";

/** Panning and zooming the workspace, the keyboard shortcuts for it, and sharing the cursor position. */
export function useStageViewport(
  props: CanvasStageProps,
  deps: Pick<ReturnType<typeof useStageRefs>, "selectedIdsRef" | "workspaceRef" | "wrapperRef">,
) {
  const { onElementDelete, onCursorMove, twitchInteractionEnabled = false } = props;
  const { selectedIdsRef, workspaceRef, wrapperRef } = deps;
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const [panState, setPanState] = useState({ x: 0, y: 0 });
  const [zoomState, setZoomState] = useState(1);
  const getZoom = useCallback(() => zoomRef.current, []);
  const applyTransform = useCallback(() => {
    const p = panRef.current,
      z = zoomRef.current;
    if (workspaceRef.current)
      workspaceRef.current.style.transform = `translate(${p.x}px, ${p.y}px) scale(${z})`;
    setPanState({ ...p });
    setZoomState(z);
  }, []);
  // Fit stream viewport on mount
  const initialized = useRef(false);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const obs = new ResizeObserver(() => {
      if (initialized.current) return;
      const w = wrapper.clientWidth,
        h = wrapper.clientHeight;
      if (!w || !h) return;
      initialized.current = true;
      const fit = Math.min(w / STREAM_W, h / STREAM_H) * 0.82;
      panRef.current = {
        x: (w - STREAM_W * fit) / 2 - STREAM_OFFSET_X * fit,
        y: (h - STREAM_H * fit) / 2 - STREAM_OFFSET_Y * fit,
      };
      zoomRef.current = fit;
      applyTransform();
    });
    obs.observe(wrapper);
    return () => {
      obs.disconnect();
      initialized.current = false; // reset for React strict-mode remount
    };
  }, [applyTransform]);
  // Scroll to zoom
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = wrapper.getBoundingClientRect();
      const px = e.clientX - rect.left,
        py = e.clientY - rect.top;
      const oldZ = zoomRef.current;
      const ptX = (px - panRef.current.x) / oldZ;
      const ptY = (py - panRef.current.y) / oldZ;
      const newZ = Math.min(4, Math.max(0.04, oldZ * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
      panRef.current = { x: px - ptX * newZ, y: py - ptY * newZ };
      zoomRef.current = newZ;
      applyTransform();
    };
    wrapper.addEventListener("wheel", onWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", onWheel);
  }, [applyTransform]);
  // Middle-mouse pan
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let panning = false;
    const down = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      panning = true;
    };
    const move = (e: MouseEvent) => {
      if (!panning) return;
      panRef.current = {
        x: panRef.current.x + e.movementX,
        y: panRef.current.y + e.movementY,
      };
      applyTransform();
    };
    const up = (e: MouseEvent) => {
      if (e.button === 1) panning = false;
    };
    wrapper.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      wrapper.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [applyTransform]);
  // Keyboard delete
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      // Editing is paused while the stream player is in use.
      if (
        (e.code === "Delete" || e.code === "Backspace") &&
        !inInput &&
        !twitchInteractionEnabled
      ) {
        selectedIdsRef.current.forEach((id) => onElementDelete(id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onElementDelete, twitchInteractionEnabled]);
  // Cursor broadcast
  useEffect(() => {
    if (!onCursorMove) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let lastEmit = 0;
    const onMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastEmit < 33) return; // ~30fps
      lastEmit = now;
      const rect = wrapper.getBoundingClientRect();
      onCursorMove(
        (e.clientX - rect.left - panRef.current.x) / zoomRef.current,
        (e.clientY - rect.top - panRef.current.y) / zoomRef.current,
      );
    };
    wrapper.addEventListener("mousemove", onMove);
    return () => wrapper.removeEventListener("mousemove", onMove);
  }, [onCursorMove]);
  const resetView = useCallback(() => {
    const w = wrapperRef.current?.clientWidth ?? 800;
    const h = wrapperRef.current?.clientHeight ?? 600;
    const fit = Math.min(w / STREAM_W, h / STREAM_H) * 0.82;
    panRef.current = {
      x: (w - STREAM_W * fit) / 2 - STREAM_OFFSET_X * fit,
      y: (h - STREAM_H * fit) / 2 - STREAM_OFFSET_Y * fit,
    };
    zoomRef.current = fit;
    applyTransform();
  }, [applyTransform]);

  return {
    panRef,
    zoomRef,
    panState,
    setPanState,
    zoomState,
    setZoomState,
    getZoom,
    applyTransform,
    initialized,
    resetView,
  };
}
