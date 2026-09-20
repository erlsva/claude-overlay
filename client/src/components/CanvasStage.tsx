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
  getFileLabel,
  WORKSPACE_W,
  WORKSPACE_H,
} from "../canvas/config";
import {
  setRotation,
  applyNodeTransform,
  getScale,
  setScale,
  getRotation,
} from "../canvas/elementTransforms";
import { X, RefreshCw } from "lucide-react";
import { LiveCursors } from "./LiveCursors";
import { useMarquee } from "../hooks/useMarquee";
import { createMediaElement } from "../canvas/mediaElement";
import { type HandlePos, addResizeHandle, addRotationHandle } from "../canvas/handles";
import { iconHTML } from "../canvas/icons";
import { makeDraggable } from "../canvas/dragging";
import { playRequestedEffect } from "../canvas/effects";
import { applyTextStyles } from "../canvas/textStyle";

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
    const mediaElMap = mediaElMapRef.current;
    const presentIds = new Set(elements.map((e) => e.id));

    if (previewFlyRef) {
      previewFlyRef.current = (id, direction, durationSeconds, onDone) => {
        const node = nodeMap.get(id);
        const element = elementsRef.current.find((item) => item.id === id);
        if (!node || !element) return null;
        const [movement, lane] = direction.split(/-(?=top$|center$|bottom$|left$|right$)/) as [
          string,
          string,
        ];
        const horizontal = movement === "left-to-right" || movement === "right-to-left";
        const laneX =
          lane === "left"
            ? STREAM_OFFSET_X
            : lane === "right"
              ? STREAM_OFFSET_X + STREAM_W - element.width
              : STREAM_OFFSET_X + (STREAM_W - element.width) / 2;
        const laneY =
          lane === "top"
            ? STREAM_OFFSET_Y
            : lane === "bottom"
              ? STREAM_OFFSET_Y + STREAM_H - element.height
              : STREAM_OFFSET_Y + (STREAM_H - element.height) / 2;
        let fromX = laneX;
        let toX = laneX;
        let fromY = laneY;
        let toY = laneY;
        if (horizontal) {
          fromX =
            movement === "left-to-right"
              ? STREAM_OFFSET_X - element.width
              : STREAM_OFFSET_X + STREAM_W;
          toX =
            movement === "left-to-right"
              ? STREAM_OFFSET_X + STREAM_W
              : STREAM_OFFSET_X - element.width;
        } else {
          fromY =
            movement === "top-to-bottom"
              ? STREAM_OFFSET_Y - element.height
              : STREAM_OFFSET_Y + STREAM_H;
          toY =
            movement === "top-to-bottom"
              ? STREAM_OFFSET_Y + STREAM_H
              : STREAM_OFFSET_Y - element.height;
        }
        node.getAnimations().forEach((animation) => animation.cancel());
        const flight = node.animate(
          [
            { left: `${fromX}px`, top: `${fromY}px`, opacity: 1 },
            { left: `${toX}px`, top: `${toY}px`, opacity: 1 },
          ],
          {
            duration: Math.max(1, durationSeconds) * 1000,
            easing: "linear",
          },
        );
        flight.onfinish = () => onDone?.();
        flight.oncancel = () => onDone?.();
        return () => flight.cancel();
      };
    }

    if (directUpdateRef) {
      directUpdateRef.current = (id: string, changes: Partial<CanvasElement>) => {
        const n = nodeMap.get(id);
        if (!n || draggingRef.current.has(id)) return;
        if (changes.x != null) n.style.left = changes.x + "px";
        if (changes.y != null) n.style.top = changes.y + "px";
        if (changes.width != null) n.style.width = changes.width + "px";
        if (changes.height != null) n.style.height = changes.height + "px";
        if (changes.rotation != null) {
          setRotation(n, changes.rotation);
          applyNodeTransform(n);
        }
        if (changes.scaleX != null || changes.scaleY != null) {
          const currentScale = getScale(n);
          setScale(n, changes.scaleX ?? currentScale.x, changes.scaleY ?? currentScale.y);
          applyNodeTransform(n);
        }
        // Mark node so the DOM sync effect skips geometry this frame
        (n as any).__directUpdatedAt = Date.now();
      };
    }

    // Remove deleted nodes
    for (const [id, node] of nodeMap) {
      if (!presentIds.has(id)) {
        const media = mediaElMap.get(id);
        if (media) {
          media.pause();
          if (media.parentNode) media.parentNode.removeChild(media);
          mediaElMap.delete(id);
        }
        node.remove();
        nodeMap.delete(id);
      }
    }

    for (const el of elements) {
      // Audio uploads previously inherited the old 16:9 video-player box.
      // Compact those legacy elements once while preserving user-resized ones.
      if (el.type === "audio" && el.width === 400 && el.height === 225) {
        onElementChange(el.id, { width: 360, height: 86 });
      }
      let node = nodeMap.get(el.id);

      if (!node) {
        node = document.createElement("div");
        node.dataset.id = el.id;
        node.style.cssText =
          "position:absolute;cursor:move;transform-origin:center center;box-sizing:border-box;";

        const content = createMediaElement(el, {
          onMediaEvent: onMediaControl
            ? (action, currentTime) => onMediaControl(el.id, action, currentTime)
            : undefined,
          onMediaReady: (media) => {
            mediaElMap.set(el.id, media);
            if (
              media instanceof HTMLVideoElement &&
              !dashboardSilencedVideosRef.current.has(media)
            ) {
              try {
                const context = dashboardAudioContextRef.current ?? new AudioContext();
                dashboardAudioContextRef.current = context;
                const source = context.createMediaElementSource(media);
                const silentOutput = context.createGain();
                silentOutput.gain.value = 0;
                source.connect(silentOutput).connect(context.destination);
                dashboardSilencedVideosRef.current.add(media);
              } catch (error) {
                // Very old/restricted browsers may reject Web Audio routing.
                // Keep the dashboard silent even in that fallback case.
                media.muted = true;
                console.warn("Could not route dashboard video through silent output", error);
              }
            }
          },
          onVolumeChange: (vol) => {
            const existing = volumeCommitTimersRef.current.get(el.id);
            if (existing !== undefined) window.clearTimeout(existing);
            volumeCommitTimersRef.current.set(
              el.id,
              window.setTimeout(() => {
                volumeCommitTimersRef.current.delete(el.id);
                onElementChange(el.id, { mediaVolume: vol });
              }, 100),
            );
          },
          onVisibilityChange: (visible) => {
            const current = elementsRef.current.find((element) => element.id === el.id);
            if (current?.autoVisibility) {
              onElementChange(el.id, { visible });
            }
          },
        });
        content.classList.add("element-content");
        node.appendChild(content);

        // Selection border
        const selBorder = document.createElement("div");
        selBorder.className = "sel-border";
        selBorder.style.cssText =
          "position:absolute;inset:-2px;pointer-events:none;border:2px solid var(--accent-border);display:none;border-radius:1px;";
        node.appendChild(selBorder);

        // 8 resize handles
        const handlePos: HandlePos[] = ["tl", "tc", "tr", "ml", "mr", "bl", "bc", "br"];
        for (const pos of handlePos) {
          addResizeHandle(
            node,
            pos,
            getZoom,
            (changes) => {
              const current = elementsRef.current.find((element) => element.id === el.id);
              if (current?.dvdEnabled) {
                const position = getDvdPosition(current);
                onElementChange(el.id, {
                  ...changes,
                  dvdEnabled: false,
                  x: changes.x ?? position.x,
                  y: changes.y ?? position.y,
                });
                return;
              }
              onElementChange(el.id, changes);
            },
            () => !elementsRef.current.find((element) => element.id === el.id)?.locked,
          );
        }

        // Delete button
        const deleteBtn = document.createElement("button");
        deleteBtn.innerHTML = iconHTML(X, 11);
        deleteBtn.style.cssText =
          "position:absolute;top:-25px;right:-25px;background:#dc2626;color:white;border:1px solid #f87171;cursor:pointer;width:20px;height:20px;z-index:30;border-radius:50%;display:none;align-items:center;justify-content:center;padding:0;line-height:0;box-sizing:border-box;box-shadow:0 2px 8px rgba(0,0,0,.45);";
        deleteBtn.className = "delete-btn";
        deleteBtn.title = "Permanently delete this element";
        deleteBtn.setAttribute("aria-label", "Delete element");
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          if (elementsRef.current.find((element) => element.id === el.id)?.locked) return;
          onElementDelete(el.id);
        };
        node.appendChild(deleteBtn);

        // Click to select
        node.addEventListener(
          "click",
          (e) => {
            if (node!.dataset.justDragged) {
              delete node!.dataset.justDragged;
              return;
            }
            if ((e.target as HTMLElement).closest("button, input, audio, .rh")) return;
            onSelect(el.id, e.shiftKey || e.metaKey || e.ctrlKey);
          },
          true,
        );

        // Capture the drag cohort once so selection or socket echoes cannot
        // change which elements move halfway through a gesture.
        let activeDragIds = new Set<string>();
        const onDragStart = () => {
          const thisEl = elementsRef.current.find((e) => e.id === el.id);
          const selected = selectedIdsRef.current;
          activeDragIds = new Set([el.id]);
          if (selected.has(el.id)) selected.forEach((id) => activeDragIds.add(id));
          if (thisEl?.groupId) {
            for (const member of elementsRef.current) {
              if (member.groupId === thisEl.groupId) activeDragIds.add(member.id);
            }
          }
          activeDragIds.forEach((id) => draggingRef.current.add(id));
          if (thisEl?.dvdEnabled) {
            const position = getDvdPosition(thisEl);
            onElementChange(el.id, {
              dvdEnabled: false,
              x: position.x,
              y: position.y,
            });
          }
        };
        const onDragEnd = () => {
          activeDragIds.clear();
          draggingRef.current.clear();
        };

        addRotationHandle(
          node,
          (changes) => onElementChange(el.id, changes),
          () => !elementsRef.current.find((element) => element.id === el.id)?.locked,
          () => draggingRef.current.add(el.id),
          () => draggingRef.current.delete(el.id),
        );

        let groupDragLastEmit = 0;
        makeDraggable(
          node,
          getZoom,
          (changes) => onElementChange(el.id, changes),
          (dx, dy, final) => {
            if (activeDragIds.size <= 1) return;
            const activeGroupIds = new Set(
              elementsRef.current
                .filter((item) => activeDragIds.has(item.id) && item.groupId)
                .map((item) => item.groupId!),
            );
            for (const groupId of activeGroupIds) {
              const groupBox = groupBoxMapRef.current.get(groupId);
              if (!groupBox) continue;
              if (!groupBox.dataset.dragStartLeft) {
                groupBox.dataset.dragStartLeft = String(parseFloat(groupBox.style.left) || 0);
                groupBox.dataset.dragStartTop = String(parseFloat(groupBox.style.top) || 0);
              }
              groupBox.style.left = `${Number(groupBox.dataset.dragStartLeft) + dx}px`;
              groupBox.style.top = `${Number(groupBox.dataset.dragStartTop) + dy}px`;
              if (final) {
                delete groupBox.dataset.dragStartLeft;
                delete groupBox.dataset.dragStartTop;
              }
            }
            for (const other of elementsRef.current) {
              if (other.id === el.id || !activeDragIds.has(other.id) || other.locked) continue;
              const otherNode = nodeMapRef.current.get(other.id);
              if (!otherNode) continue;
              const startLeft = parseFloat(otherNode.dataset.startLeft ?? String(other.x));
              const startTop = parseFloat(otherNode.dataset.startTop ?? String(other.y));
              if (!otherNode.dataset.startLeft) {
                otherNode.dataset.startLeft = String(other.x);
                otherNode.dataset.startTop = String(other.y);
              }
              const nx = startLeft + dx;
              const ny = startTop + dy;
              otherNode.style.left = nx + "px";
              otherNode.style.top = ny + "px";
              const now = Date.now();
              if (final || now - groupDragLastEmit >= 50) {
                onElementChange(other.id, { x: nx, y: ny });
              }
              if (final) {
                delete otherNode.dataset.startLeft;
                delete otherNode.dataset.startTop;
              }
            }
            if (final || Date.now() - groupDragLastEmit >= 50) {
              groupDragLastEmit = Date.now();
            }
          },
          el.type === "text" ? () => onEditText?.(el.id) : null,
          {
            onDragStart,
            onDragEnd: () => {
              node!.dataset.justDragged = "true";
              onDragEnd();
            },
            canInteract: () => !elementsRef.current.find((element) => element.id === el.id)?.locked,
            onSnapGuides: (guideX, guideY) => {
              const xGuide = snapXGuideRef.current;
              const yGuide = snapYGuideRef.current;
              if (xGuide) {
                xGuide.style.display = guideX === undefined ? "none" : "block";
                if (guideX !== undefined) xGuide.style.left = `${guideX}px`;
              }
              if (yGuide) {
                yGuide.style.display = guideY === undefined ? "none" : "block";
                if (guideY !== undefined) yGuide.style.top = `${guideY}px`;
              }
            },
          },
        );

        workspace.appendChild(node);
        nodeMap.set(el.id, node);
      }

      // Update attrs — skip geometry if node is being dragged or was just direct-updated
      const sx = el.scaleX ?? 1,
        sy = el.scaleY ?? 1,
        rot = el.rotation ?? 0;
      const recentlyDirect = ((node as any).__directUpdatedAt ?? 0) > Date.now() - 200;
      if (!draggingRef.current.has(el.id) && !recentlyDirect) {
        node.style.left = el.x + "px";
        node.style.top = el.y + "px";
        node.style.width = el.width + "px";
        node.style.height = el.height + "px";
      } else if (!recentlyDirect) {
        node.style.width = el.width + "px";
        node.style.height = el.height + "px";
      }
      node.style.opacity = el.visible ? String(el.opacity ?? 1) : "0.2";
      node.style.cursor = el.locked ? "not-allowed" : "move";
      node.style.zIndex = String(el.zIndex);
      if (!recentlyDirect) {
        setScale(node, sx, sy);
        setRotation(node, rot);
        applyNodeTransform(node);
      }
      playRequestedEffect(node, el);

      // Update text content live
      if (el.type === "text") {
        const span = node.querySelector<HTMLSpanElement>("span");
        if (span) applyTextStyles(span, el.src);
      } else {
        const mediaName = node.querySelector<HTMLElement>(".media-name");
        if (mediaName) {
          const label = el.displayName || getFileLabel(el.src) || el.type;
          mediaName.textContent = label;
          mediaName.parentElement!.title = `${label} · Drag to move · Use the round handle above the selection to rotate`;
        }
      }

      // Sync volume from element state to media element + slider UI
      if (el.type === "video" || el.type === "audio") {
        const vol = el.mediaVolume ?? 0.25;
        const media = mediaElMapRef.current.get(el.id);
        if (media && Math.abs(media.volume - vol) > 0.001) {
          (media as any).__remoteVolumeTarget = vol;
          media.volume = vol;
        }
        const slider = node.querySelector<HTMLInputElement>("input[type=range][title='Volume']");
        if (slider && Math.abs(parseFloat(slider.value) - vol) > 0.001) slider.value = String(vol);
      }

      // Group indicator — dashed outline per element
      node.style.outline = el.groupId ? "1px dashed rgba(var(--accent-rgb),0.35)" : "none";

      // Selection UI
      const isSelected = selectedIds.has(el.id);
      node.querySelector<HTMLElement>(".sel-border")!.style.display = isSelected ? "block" : "none";
      node.querySelector<HTMLElement>(".delete-btn")!.style.display =
        isSelected && !el.locked ? "flex" : "none";
      for (const h of node.querySelectorAll<HTMLElement>(".rh")) {
        h.style.display =
          isSelected && !el.locked
            ? h.classList.contains("rotation-handle")
              ? "flex"
              : "block"
            : "none";
      }
    }

    // Group bounding boxes
    const groupBoxMap = groupBoxMapRef.current;
    const activeGroups = new Map<string, CanvasElement[]>();
    for (const el of elements) {
      if (!el.groupId) continue;
      const arr = activeGroups.get(el.groupId) ?? [];
      arr.push(el);
      activeGroups.set(el.groupId, arr);
    }

    // Remove stale group boxes
    for (const [gid, box] of groupBoxMap) {
      if (!activeGroups.has(gid)) {
        box.remove();
        groupBoxMap.delete(gid);
      }
    }

    // Update/create group boxes
    const PAD = 10;
    for (const [gid, members] of activeGroups) {
      if (members.length < 2) continue;
      const corners = members.flatMap((member) => {
        const memberNode = nodeMap.get(member.id);
        const x = memberNode ? parseFloat(memberNode.style.left) || member.x : member.x;
        const y = memberNode ? parseFloat(memberNode.style.top) || member.y : member.y;
        const width = memberNode?.offsetWidth || member.width;
        const height = memberNode?.offsetHeight || member.height;
        const rotation = memberNode ? getRotation(memberNode) : (member.rotation ?? 0);
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        const angle = (rotation * Math.PI) / 180;
        const memberCos = Math.cos(angle);
        const memberSin = Math.sin(angle);
        return [
          [-width / 2, -height / 2],
          [width / 2, -height / 2],
          [width / 2, height / 2],
          [-width / 2, height / 2],
        ].map(([cornerX, cornerY]) => ({
          x: centerX + cornerX * memberCos - cornerY * memberSin,
          y: centerY + cornerX * memberSin + cornerY * memberCos,
        }));
      });
      const minX = Math.min(...corners.map((corner) => corner.x)) - PAD;
      const minY = Math.min(...corners.map((corner) => corner.y)) - PAD;
      const maxX = Math.max(...corners.map((corner) => corner.x)) + PAD;
      const maxY = Math.max(...corners.map((corner) => corner.y)) + PAD;

      let box = groupBoxMap.get(gid);
      if (!box) {
        box = document.createElement("div");
        box.style.cssText =
          "position:absolute;border:1.5px dashed rgba(var(--accent-rgb),0.45);background:rgba(var(--accent-rgb),0.04);pointer-events:none;border-radius:4px;";
        let rotationState: {
          pivotX: number;
          pivotY: number;
          members: Array<{
            id: string;
            centerX: number;
            centerY: number;
            width: number;
            height: number;
            rotation: number;
          }>;
        } | null = null;
        const rotationHandle = addRotationHandle(
          box,
          () => {},
          () =>
            elementsRef.current.filter((item) => item.groupId === gid).some((item) => !item.locked),
          () => {
            const currentMembers = elementsRef.current.filter(
              (item) => item.groupId === gid && !item.locked,
            );
            if (currentMembers.length < 2) return;
            const left = parseFloat(box!.style.left) || 0;
            const top = parseFloat(box!.style.top) || 0;
            const width = parseFloat(box!.style.width) || 0;
            const height = parseFloat(box!.style.height) || 0;
            rotationState = {
              pivotX: left + width / 2,
              pivotY: top + height / 2,
              members: currentMembers.map((member) => {
                draggingRef.current.add(member.id);
                return {
                  id: member.id,
                  centerX: member.x + member.width / 2,
                  centerY: member.y + member.height / 2,
                  width: member.width,
                  height: member.height,
                  rotation: member.rotation ?? 0,
                };
              }),
            };
          },
          () => {
            rotationState = null;
            draggingRef.current.clear();
          },
          () => {
            if (!rotationState) return null;
            const workspaceRect = workspace.getBoundingClientRect();
            const zoom = getZoom();
            return {
              x: workspaceRect.left + rotationState.pivotX * zoom,
              y: workspaceRect.top + rotationState.pivotY * zoom,
            };
          },
          (deltaDegrees) => {
            if (!rotationState) return;
            const angle = (deltaDegrees * Math.PI) / 180;
            const groupCos = Math.cos(angle);
            const groupSin = Math.sin(angle);
            for (const member of rotationState.members) {
              const offsetX = member.centerX - rotationState.pivotX;
              const offsetY = member.centerY - rotationState.pivotY;
              const centerX = rotationState.pivotX + offsetX * groupCos - offsetY * groupSin;
              const centerY = rotationState.pivotY + offsetX * groupSin + offsetY * groupCos;
              const changes = {
                x: centerX - member.width / 2,
                y: centerY - member.height / 2,
                rotation: member.rotation + deltaDegrees,
              };
              const memberNode = nodeMapRef.current.get(member.id);
              if (memberNode) {
                memberNode.style.left = `${changes.x}px`;
                memberNode.style.top = `${changes.y}px`;
                setRotation(memberNode, changes.rotation);
                applyNodeTransform(memberNode);
              }
              onElementChange(member.id, changes);
            }
          },
        );
        rotationHandle.classList.add("group-rotation-handle");
        rotationHandle.style.pointerEvents = "auto";
        rotationHandle.style.width = "22px";
        rotationHandle.style.height = "22px";
        rotationHandle.style.top = "-44px";
        rotationHandle.style.background = "var(--accent-solid)";
        rotationHandle.style.color = "var(--accent-contrast)";
        rotationHandle.style.zIndex = "100000";
        rotationHandle.title = "Drag to rotate the group · Hold Shift to snap to 15° increments";
        rotationHandle.setAttribute("aria-label", "Rotate group");
        workspace.insertBefore(box, workspace.firstChild);
        groupBoxMap.set(gid, box);
      }
      box.style.left = minX + "px";
      box.style.top = minY + "px";
      box.style.width = maxX - minX + "px";
      box.style.height = maxY - minY + "px";
      const groupSelected = members.some((member) => selectedIds.has(member.id));
      const groupRotationHandle = box.querySelector<HTMLElement>(".group-rotation-handle");
      if (groupRotationHandle) {
        groupRotationHandle.style.display = groupSelected ? "flex" : "none";
      }
    }
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
