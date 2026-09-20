import { useRef, useEffect } from "react";
import type { CanvasStageProps } from "./types";

/** The DOM nodes and registries the stage keeps for its elements, and refs that mirror props for use inside callbacks. */
export function useStageRefs(props: CanvasStageProps) {
  const { elements, selectedIds } = props;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const nodeMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const mediaElMapRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const dashboardAudioContextRef = useRef<AudioContext | null>(null);
  const dashboardSilencedVideosRef = useRef<WeakSet<HTMLVideoElement>>(new WeakSet());
  const volumeCommitTimersRef = useRef<Map<string, number>>(new Map());
  const groupBoxMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const snapXGuideRef = useRef<HTMLDivElement>(null);
  const snapYGuideRef = useRef<HTMLDivElement>(null);
  // Track which elements are actively being dragged so we don't reset their DOM position
  const draggingRef = useRef<Set<string>>(new Set());
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);
  const elementsRef = useRef(elements);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  return {
    wrapperRef,
    workspaceRef,
    nodeMapRef,
    mediaElMapRef,
    dashboardAudioContextRef,
    dashboardSilencedVideosRef,
    volumeCommitTimersRef,
    groupBoxMapRef,
    snapXGuideRef,
    snapYGuideRef,
    draggingRef,
    selectedIdsRef,
    elementsRef,
  };
}
