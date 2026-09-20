import { useState, useRef, useEffect } from "react";
import { type SelectedAnimation } from "./types";
import { type ElementEffectAnimation } from "../../types";
import { randomUUID } from "../../utils";
import {
  getFileLabel,
  STREAM_OFFSET_X,
  STREAM_W,
  STREAM_OFFSET_Y,
  STREAM_H,
} from "../../canvas/config";
import type { ElementPanelProps } from "./types";
import type { useLayerSelection } from "./useLayerSelection";
import type { useLayersServices } from "./useLayersServices";

/** Playing a one-off animation on the selected layer. */
export function useLayerAnimation(
  props: ElementPanelProps,
  deps: Pick<ReturnType<typeof useLayerSelection>, "selectedElement"> &
    Pick<ReturnType<typeof useLayersServices>, "toast">,
) {
  const { onElementChange } = props;
  const { selectedElement, toast } = deps;
  const [selectedAnimation, setSelectedAnimation] = useState<SelectedAnimation>("bounce");
  const [animationDuration, setAnimationDuration] = useState(1.2);
  const animationTimersRef = useRef(new Map<string, number>());
  useEffect(
    () => () => {
      for (const timer of animationTimersRef.current.values()) window.clearTimeout(timer);
    },
    [],
  );
  const playSelectedAnimation = () => {
    if (!selectedElement || !["image", "gif", "video"].includes(selectedElement.type)) return;
    const durationMs = Math.round(Math.max(0.2, Math.min(10, animationDuration)) * 1000);
    const existingTimer = animationTimersRef.current.get(selectedElement.id);
    if (existingTimer) window.clearTimeout(existingTimer);
    if (!["slide-lr", "slide-rl", "slide-tb", "slide-bt"].includes(selectedAnimation)) {
      const effectLabels: Record<ElementEffectAnimation, string> = {
        pop: "pop",
        pulse: "spotlight pulse",
        spin: "spin",
        shake: "energetic shake",
        bounce: "bounce",
        float: "gentle float",
        sway: "sway",
        heartbeat: "heartbeat",
      };
      onElementChange(selectedElement.id, {
        effectAnimation: selectedAnimation as ElementEffectAnimation,
        effectId: randomUUID(),
        effectStartedAt: Date.now(),
        effectDurationMs: durationMs,
      });
      toast.success(
        `Playing ${effectLabels[selectedAnimation as ElementEffectAnimation]} on ${selectedElement.displayName || getFileLabel(selectedElement.src) || selectedElement.type}`,
      );
      return;
    }

    const original = {
      x: selectedElement.x,
      y: selectedElement.y,
      visible: selectedElement.visible,
    };
    const horizontal = selectedAnimation === "slide-lr" || selectedAnimation === "slide-rl";
    const forward = selectedAnimation === "slide-lr" || selectedAnimation === "slide-tb";
    const laneX = Math.max(
      STREAM_OFFSET_X,
      Math.min(STREAM_OFFSET_X + STREAM_W - selectedElement.width, selectedElement.x),
    );
    const laneY = Math.max(
      STREAM_OFFSET_Y,
      Math.min(STREAM_OFFSET_Y + STREAM_H - selectedElement.height, selectedElement.y),
    );
    const fromX = horizontal
      ? forward
        ? STREAM_OFFSET_X - selectedElement.width
        : STREAM_OFFSET_X + STREAM_W
      : laneX;
    const toX = horizontal
      ? forward
        ? STREAM_OFFSET_X + STREAM_W
        : STREAM_OFFSET_X - selectedElement.width
      : laneX;
    const fromY = horizontal
      ? laneY
      : forward
        ? STREAM_OFFSET_Y - selectedElement.height
        : STREAM_OFFSET_Y + STREAM_H;
    const toY = horizontal
      ? laneY
      : forward
        ? STREAM_OFFSET_Y + STREAM_H
        : STREAM_OFFSET_Y - selectedElement.height;
    onElementChange(selectedElement.id, {
      visible: true,
      dvdEnabled: false,
      x: fromX,
      y: fromY,
      flyStartedAt: Date.now(),
      flyDurationMs: durationMs,
      flyFromX: fromX,
      flyFromY: fromY,
      flyToX: toX,
      flyToY: toY,
    });
    const timer = window.setTimeout(() => {
      onElementChange(selectedElement.id, {
        ...original,
        flyStartedAt: 0,
        flyDurationMs: 0,
        flyFromX: 0,
        flyFromY: 0,
        flyToX: 0,
        flyToY: 0,
      });
      animationTimersRef.current.delete(selectedElement.id);
    }, durationMs + 50);
    animationTimersRef.current.set(selectedElement.id, timer);
    toast.success("Media slide started on the dashboard and overlay");
  };

  return {
    selectedAnimation,
    setSelectedAnimation,
    animationDuration,
    setAnimationDuration,
    animationTimersRef,
    playSelectedAnimation,
  };
}
