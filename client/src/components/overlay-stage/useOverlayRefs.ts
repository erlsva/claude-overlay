import { useEffect, useRef } from "react";
import type { CanvasElement, DvdCelebrationSettings } from "../../types";
import type { CornerParticle, DvdBounceState, NodePosition } from "./types";

/** Everything the overlay keeps between renders: the DOM nodes it manages and the state its animations share. */
export function useOverlayRefs(
  elements: CanvasElement[],
  dvdCelebrationSettings: DvdCelebrationSettings,
) {
  const hadActiveDvdRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const nodeMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const posMapRef = useRef<Map<string, NodePosition>>(new Map());
  const targetMapRef = useRef<Map<string, NodePosition>>(new Map());
  const animatingRef = useRef<Set<string>>(new Set());
  const flyingRef = useRef<Set<string>>(new Set());
  // Stores the actual HTMLMediaElement for each element id (video or hidden audio)
  const mediaElMapRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  // Container for hidden audio elements
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawLiveCanvasRef = useRef<HTMLCanvasElement>(null);
  const cornerFxCanvasRef = useRef<HTMLCanvasElement>(null);
  const cornerParticlesRef = useRef<CornerParticle[]>([]);
  const cornerAudioContextRef = useRef<AudioContext | null>(null);
  const customCornerAudioRef = useRef<HTMLAudioElement | null>(null);
  const dvdCelebrationSettingsRef = useRef(dvdCelebrationSettings);
  const dvdBounceStateRef = useRef<Map<string, DvdBounceState>>(new Map());
  // Offscreen layer holding committed strokes/fills already baked in, so an
  // expensive flood fill is never re-run just because a live stroke updated.
  const drawBaseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawBakedCountRef = useRef(0);
  const overlayElementsRef = useRef(elements);
  useEffect(() => {
    dvdCelebrationSettingsRef.current = dvdCelebrationSettings;
  }, [dvdCelebrationSettings]);
  useEffect(() => {
    overlayElementsRef.current = elements;
  }, [elements]);
  return {
    hadActiveDvdRef,
    viewportRef,
    nodeMapRef,
    posMapRef,
    targetMapRef,
    animatingRef,
    flyingRef,
    mediaElMapRef,
    audioContainerRef,
    drawCanvasRef,
    drawLiveCanvasRef,
    cornerFxCanvasRef,
    cornerParticlesRef,
    cornerAudioContextRef,
    customCornerAudioRef,
    dvdCelebrationSettingsRef,
    dvdBounceStateRef,
    drawBaseCanvasRef,
    drawBakedCountRef,
    overlayElementsRef,
  };
}

export type OverlayRefs = ReturnType<typeof useOverlayRefs>;
