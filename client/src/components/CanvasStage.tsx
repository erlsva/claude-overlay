/**
 * CanvasStage — DOM-based canvas.
 *
 * Key design decisions:
 * - DOM elements, no canvas library
 * - Left-drag on background = pan OR marquee select
 * - Left-drag on element = move (all selected move together)
 * - Dedicated top-center rotation handle
 * - 8 resize handles: corners + edges; drag past 0 flips via negative scaleX/scaleY
 * - Video: transparent drag overlay captures mousedown before video does
 * - Groups: elements with same groupId are selected/moved together
 * - Double-click text = edit via callback
 * - draggingRef prevents React from overwriting DOM positions for group members mid-drag
 */

import {
  installPreviewFly,
  installDirectUpdate,
  removeDeletedNodes,
  createElementNode,
  updateElementNode,
  syncGroupBoxes,
  type SyncContext,
} from "../canvas/syncElements";
import {
  type CanvasElement,
  type CursorPayload,
  type MediaControlPayload,
  type FlyDirection,
} from "../types";
import { useRef, useCallback, useState, useEffect } from "react";
import { getDvdPosition } from "../canvas/dvdMotion";
import {
  STREAM_W,
  STREAM_H,
  STREAM_OFFSET_X,
  STREAM_OFFSET_Y,
  WORKSPACE_W,
  WORKSPACE_H,
} from "../canvas/config";
import { RefreshCw } from "lucide-react";
import { LiveCursors } from "./LiveCursors";
import { useMarquee } from "../hooks/useMarquee";

// ---------------------------------------------------------------------------
// Main dashboard canvas
// ---------------------------------------------------------------------------
export interface CanvasStageProps {
  elements: CanvasElement[];
  cursors?: Map<string, CursorPayload>;
  selectedIds: Set<string>;
  onSelect: (id: string | null, multi?: boolean) => void;
  onSelectMany: (ids: string[]) => void;
  onElementChange: (id: string, changes: Partial<CanvasElement>) => void;
  onElementDelete: (id: string) => void;
  onCursorMove?: (x: number, y: number) => void;
  onEditText?: (id: string) => void;
  onMediaControl?: (id: string, action: MediaControlPayload["action"], currentTime: number) => void;
  /** Ref populated with a function that applies incoming remote media:control events to this stage */
  mediaControlRef?: React.MutableRefObject<((payload: MediaControlPayload) => void) | null>;
  /** Ref populated with a function for direct DOM position updates, bypassing React state */
  directUpdateRef?: React.MutableRefObject<
    ((id: string, changes: Partial<CanvasElement>) => void) | null
  >;
  previewFlyRef?: React.MutableRefObject<
    | ((
        id: string,
        direction: FlyDirection,
        durationSeconds: number,
        onDone?: () => void,
      ) => (() => void) | null)
    | null
  >;
  showTwitchEmbed?: boolean;
  /** True while the player itself takes the mouse (play, pause, mute) and the canvas is paused. */
  twitchInteractionEnabled?: boolean;
  onTwitchInteractionChange?: (enabled: boolean) => void;
  twitchChannel?: string;
  drawingLayer?: React.ReactNode;
}

export function CanvasStage({
  elements,
  cursors = new Map(),
  selectedIds,
  onSelect,
  onSelectMany,
  onElementChange,
  onElementDelete,
  onCursorMove,
  onEditText,
  onMediaControl,
  mediaControlRef,
  directUpdateRef,
  previewFlyRef,
  showTwitchEmbed = false,
  twitchInteractionEnabled = false,
  onTwitchInteractionChange,
  twitchChannel = "",
  drawingLayer,
}: CanvasStageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const nodeMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const mediaElMapRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const dashboardAudioContextRef = useRef<AudioContext | null>(null);
  const dashboardSilencedVideosRef = useRef<WeakSet<HTMLVideoElement>>(new WeakSet());
  const volumeCommitTimersRef = useRef<Map<string, number>>(new Map());
  const groupBoxMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const twitchEmbedRef = useRef<HTMLDivElement>(null);
  const interactionChangeRef = useRef(onTwitchInteractionChange);
  interactionChangeRef.current = onTwitchInteractionChange;
  const setTwitchInteractionEnabled = useCallback(
    (enabled: boolean) => interactionChangeRef.current?.(enabled),
    [],
  );
  const [twitchNeedsReconnect, setTwitchNeedsReconnect] = useState(false);
  const [twitchPlayerGeneration, setTwitchPlayerGeneration] = useState(0);
  const snapXGuideRef = useRef<HTMLDivElement>(null);
  const snapYGuideRef = useRef<HTMLDivElement>(null);
  const twitchInitedRef = useRef(false);
  const twitchPlayerRef = useRef<any>(null);
  const twitchHasPlayedRef = useRef(false);
  const twitchSessionRef = useRef(0);
  const twitchNeedsReconnectRef = useRef(false);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const [panState, setPanState] = useState({ x: 0, y: 0 });
  const [zoomState, setZoomState] = useState(1);

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

  useEffect(() => {
    twitchNeedsReconnectRef.current = twitchNeedsReconnect;
  }, [twitchNeedsReconnect]);

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
      if ((e.code === "Delete" || e.code === "Backspace") && !inInput) {
        selectedIdsRef.current.forEach((id) => onElementDelete(id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onElementDelete]);

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

  useMarquee(wrapperRef, workspaceRef, panRef, zoomRef, elements, onSelectMany, () =>
    onSelect(null),
  );

  // Sync DOM elements
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const nodeMap = nodeMapRef.current;
    const ctx: SyncContext = {
      workspace,
      elements,
      selectedIds,
      nodeMap,
      mediaElMap: mediaElMapRef.current,
      nodeMapRef,
      mediaElMapRef,
      groupBoxMapRef,
      elementsRef,
      selectedIdsRef,
      draggingRef,
      dashboardAudioContextRef,
      dashboardSilencedVideosRef,
      volumeCommitTimersRef,
      snapXGuideRef,
      snapYGuideRef,
      getZoom,
      onMediaControl,
      onElementChange,
      onElementDelete,
      onSelect,
      onEditText,
      previewFlyRef,
      directUpdateRef,
    };
    installPreviewFly(ctx);
    installDirectUpdate(ctx);
    removeDeletedNodes(ctx);
    for (const el of elements) {
      // Audio uploads previously inherited the old 16:9 video-player box.
      // Compact those legacy elements once while preserving user-resized ones.
      if (el.type === "audio" && el.width === 400 && el.height === 225) {
        onElementChange(el.id, { width: 360, height: 86 });
      }
      const node = nodeMap.get(el.id) ?? createElementNode(ctx, el);
      updateElementNode(ctx, el, node);
    }
    syncGroupBoxes(ctx);
  }, [
    elements,
    selectedIds,
    onSelect,
    onElementChange,
    onElementDelete,
    onEditText,
    getZoom,
    onMediaControl,
  ]);

  useEffect(
    () => () => {
      volumeCommitTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      volumeCommitTimersRef.current.clear();
      void dashboardAudioContextRef.current?.close();
      dashboardAudioContextRef.current = null;
    },
    [],
  );

  // Expose applyControl for incoming remote media:control events
  useEffect(() => {
    if (!mediaControlRef) return;
    mediaControlRef.current = (payload) => {
      const media = mediaElMapRef.current.get(payload.id);
      if (!media) return;
      (media as any).__applyingRemote = true;
      (media as any).__remoteSeekTarget = payload.currentTime;
      media.currentTime = payload.currentTime;
      if (payload.action === "play") {
        media
          .play()
          .catch(() => {})
          .finally(() => {
            (media as any).__applyingRemote = false;
          });
      } else {
        if (payload.action === "pause") media.pause();
        (media as any).__applyingRemote = false;
      }
    };
  }, [mediaControlRef]);

  const reconnectTwitchPlayer = useCallback(() => {
    if (!showTwitchEmbed || !twitchChannel) return;

    // Invalidate events from the old player before removing its iframe.
    twitchSessionRef.current += 1;
    setTwitchInteractionEnabled(false);
    twitchNeedsReconnectRef.current = false;
    setTwitchNeedsReconnect(false);
    twitchHasPlayedRef.current = false;
    twitchPlayerRef.current = null;
    twitchInitedRef.current = false;
    twitchEmbedRef.current?.querySelector("#twitch-player-container")?.replaceChildren();
    setTwitchPlayerGeneration((generation) => generation + 1);
  }, [showTwitchEmbed, twitchChannel]);

  // Twitch.Player — initialize once, then switch channels in the same player.
  useEffect(() => {
    const div = twitchEmbedRef.current;
    if (!div || !twitchChannel) return;

    if (!showTwitchEmbed) {
      div.style.display = "none";
      return;
    }

    div.style.display = "block";

    if (twitchInitedRef.current) {
      setTwitchInteractionEnabled(false);
      twitchPlayerRef.current?.setChannel(twitchChannel);
      return;
    }
    const Twitch = (window as any).Twitch;
    if (!Twitch?.Player) return;
    twitchInitedRef.current = true;
    const session = ++twitchSessionRef.current;

    const player = new Twitch.Player("twitch-player-container", {
      width: "100%",
      height: "100%",
      channel: twitchChannel,
      parent: [window.location.hostname],
      muted: true,
      autoplay: true,
    });
    twitchPlayerRef.current = player;
    player.addEventListener(Twitch.Player.PLAYING, () => {
      if (session !== twitchSessionRef.current) return;
      twitchHasPlayedRef.current = true;
      twitchNeedsReconnectRef.current = false;
      setTwitchNeedsReconnect(false);
      setTwitchInteractionEnabled(false);
    });
    player.addEventListener(Twitch.Player.PAUSE, () => {
      if (session !== twitchSessionRef.current) return;
      if (twitchHasPlayedRef.current) {
        twitchNeedsReconnectRef.current = true;
        setTwitchNeedsReconnect(true);
      }
    });
  }, [showTwitchEmbed, twitchChannel, twitchPlayerGeneration]);

  // Twitch may reject play() after a background-tab visibility pause. Rebuild
  // only its player when the tab returns instead of refreshing the dashboard.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && twitchNeedsReconnectRef.current)
        reconnectTwitchPlayer();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reconnectTwitchPlayer]);

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

  return (
    <div
      ref={wrapperRef}
      data-media-drop-target
      className="canvas-stage-drop-target"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "var(--bg-app)",
        userSelect: "none",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={workspaceRef}
        id="viewport"
        style={{
          position: "absolute",
          transformOrigin: "0 0",
          width: WORKSPACE_W,
          height: WORKSPACE_H,
          background: "var(--bg-panel)",
        }}
      >
        {/* Twitch.Player container — inside workspace so zoom/pan applies automatically */}
        <div
          ref={twitchEmbedRef}
          className="canvas-interaction-surface"
          style={{
            position: "absolute",
            left: STREAM_OFFSET_X,
            top: STREAM_OFFSET_Y,
            width: STREAM_W,
            height: STREAM_H,
            display: showTwitchEmbed ? "block" : "none",
            overflow: "hidden",
          }}
        >
          <div
            id="twitch-player-container"
            style={{
              width: "100%",
              height: "100%",
              pointerEvents: twitchInteractionEnabled ? "auto" : "none",
            }}
          />
        </div>
        <div
          className="viewport-rect"
          style={{
            position: "absolute",
            left: STREAM_OFFSET_X,
            top: STREAM_OFFSET_Y - 22,
            fontSize: 11,
            color: "var(--accent-border)",
            fontFamily: "Inter,sans-serif",
            userSelect: "none",
            whiteSpace: "nowrap",
            zIndex: 1,
          }}
        >
          1920 × 1080 — stream viewport
        </div>
        <div
          className="viewport-rect"
          style={{
            position: "absolute",
            left: STREAM_OFFSET_X,
            top: STREAM_OFFSET_Y,
            width: STREAM_W,
            height: STREAM_H,
            background: "transparent",
            outline: "2px solid var(--accent-border)",
            boxSizing: "border-box",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
        <div
          ref={snapXGuideRef}
          style={{
            position: "absolute",
            top: STREAM_OFFSET_Y,
            height: STREAM_H,
            width: 2,
            background: "#f97316",
            boxShadow: "0 0 6px rgba(249,115,22,0.8)",
            pointerEvents: "none",
            display: "none",
            zIndex: 2147483647,
          }}
        />
        <div
          ref={snapYGuideRef}
          style={{
            position: "absolute",
            left: STREAM_OFFSET_X,
            width: STREAM_W,
            height: 2,
            background: "#f97316",
            boxShadow: "0 0 6px rgba(249,115,22,0.8)",
            pointerEvents: "none",
            display: "none",
            zIndex: 2147483647,
          }}
        />
        {drawingLayer}
      </div>
      <LiveCursors cursors={cursors} pan={panState} zoom={zoomState} />
      <div
        style={{
          position: "absolute",
          bottom: 12,
          // Leave a full button-width gap for Diagnostics and Help.
          right: 98,
          display: "flex",
          gap: 6,
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {showTwitchEmbed && twitchNeedsReconnect && (
            <button
              className="ui-button"
              onClick={reconnectTwitchPlayer}
              title="Reload only the Twitch player after it was paused by browser visibility rules"
              style={{
                background: "var(--accent-solid)",
                color: "var(--accent-contrast)",
                fontSize: 11,
                pointerEvents: "all",
                padding: "3px 8px",
                borderRadius: 4,
                border: "1px solid var(--accent-border)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                whiteSpace: "nowrap",
              }}
            >
              <RefreshCw size={12} /> Reconnect stream
            </button>
          )}
          <button
            className="ui-button canvas-fit-button"
            onClick={resetView}
            title="Reset zoom and center the 1920×1080 stream area"
            style={{
              background: "rgba(0,0,0,0.7)",
              color: "var(--text-secondary)",
              fontSize: 11,
              pointerEvents: "all",
              padding: "0 10px",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {Math.round(zoomState * 100)}% · Fit
          </button>
        </div>
      </div>
    </div>
  );
}
