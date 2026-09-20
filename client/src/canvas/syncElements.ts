import type { MutableRefObject } from "react";
import type { CanvasElement } from "../types";
import type { CanvasStageProps } from "../components/CanvasStage";
import { STREAM_OFFSET_X, STREAM_W, STREAM_OFFSET_Y, STREAM_H, getFileLabel } from "./config";
import {
  setRotation,
  applyNodeTransform,
  getScale,
  setScale,
  getRotation,
} from "./elementTransforms";
import { createMediaElement } from "./mediaElement";
import { type HandlePos, addResizeHandle, addRotationHandle } from "./handles";
import { getDvdPosition } from "./dvdMotion";
import { iconHTML } from "./icons";
import { X } from "lucide-react";
import { makeDraggable } from "./dragging";
import { playRequestedEffect } from "./effects";
import { applyTextStyles } from "./textStyle";
// (imports the moved code needs are added by the compiler-driven import fixer)

/** Everything the syncing functions share: the workspace, the node registries and the stage's callbacks. */
export interface SyncContext extends Pick<
  CanvasStageProps,
  | "onMediaControl"
  | "onElementChange"
  | "onElementDelete"
  | "onSelect"
  | "onEditText"
  | "previewFlyRef"
  | "directUpdateRef"
> {
  workspace: HTMLElement;
  elements: CanvasElement[];
  selectedIds: Set<string>;
  nodeMap: Map<string, HTMLElement>;
  mediaElMap: Map<string, HTMLMediaElement>;
  nodeMapRef: MutableRefObject<Map<string, HTMLElement>>;
  mediaElMapRef: MutableRefObject<Map<string, HTMLMediaElement>>;
  groupBoxMapRef: MutableRefObject<Map<string, HTMLElement>>;
  elementsRef: MutableRefObject<CanvasElement[]>;
  selectedIdsRef: MutableRefObject<Set<string>>;
  draggingRef: MutableRefObject<Set<string>>;
  dashboardAudioContextRef: MutableRefObject<AudioContext | null>;
  dashboardSilencedVideosRef: MutableRefObject<WeakSet<HTMLVideoElement>>;
  volumeCommitTimersRef: MutableRefObject<Map<string, number>>;
  snapXGuideRef: MutableRefObject<HTMLDivElement | null>;
  snapYGuideRef: MutableRefObject<HTMLDivElement | null>;
  getZoom: () => number;
}

/** Lets the Studio preview a fly-across on a layer without changing it. */
export function installPreviewFly(ctx: SyncContext) {
  const { nodeMap, elementsRef, previewFlyRef } = ctx;
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
}

/** Lets a change be applied straight to a layer's DOM node, for smooth live updates. */
export function installDirectUpdate(ctx: SyncContext) {
  const { nodeMap, draggingRef, directUpdateRef } = ctx;
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
}

/** Removes the nodes (and media) of layers that no longer exist. */
export function removeDeletedNodes(ctx: SyncContext) {
  const { elements, nodeMap, mediaElMap } = ctx;
  const presentIds = new Set(elements.map((e) => e.id));
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
}

/** Builds the DOM node for a new layer: its content, selection border, handles, delete button and drag behaviour. */
export function createElementNode(ctx: SyncContext, el: CanvasElement) {
  const {
    workspace,
    nodeMap,
    mediaElMap,
    nodeMapRef,
    elementsRef,
    selectedIdsRef,
    draggingRef,
    groupBoxMapRef,
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
  } = ctx;
  const node = document.createElement("div");
  node.dataset.id = el.id;
  node.style.cssText =
    "position:absolute;cursor:move;transform-origin:center center;box-sizing:border-box;";

  const content = createMediaElement(el, {
    onMediaEvent: onMediaControl
      ? (action, currentTime) => onMediaControl(el.id, action, currentTime)
      : undefined,
    onMediaReady: (media) => {
      mediaElMap.set(el.id, media);
      if (media instanceof HTMLVideoElement && !dashboardSilencedVideosRef.current.has(media)) {
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
  return node;
}

/** Brings a layer's node up to date: position, size, opacity, text, volume and selection handles. */
export function updateElementNode(ctx: SyncContext, el: CanvasElement, node: HTMLElement) {
  const { selectedIds, draggingRef, mediaElMapRef } = ctx;
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

/** Draws the dashed box (and rotation handle) around each group of layers. */
export function syncGroupBoxes(ctx: SyncContext) {
  const {
    workspace,
    elements,
    selectedIds,
    nodeMap,
    nodeMapRef,
    elementsRef,
    draggingRef,
    groupBoxMapRef,
    getZoom,
    onElementChange,
  } = ctx;
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
}
