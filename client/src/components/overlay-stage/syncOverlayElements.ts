import { STREAM_OFFSET_X, STREAM_OFFSET_Y } from "../../canvas/config";
import { getDvdPosition } from "../../canvas/dvdMotion";
import { setScale, setRotation, applyNodeTransform } from "../../canvas/elementTransforms";
import { createMediaElement } from "../../canvas/mediaElement";
import { animationFrames, playRequestedEffect } from "../../canvas/effects";
import { applyTextStyles } from "../../canvas/textStyle";
import type { CanvasElement } from "../../types";
import { isFlying } from "./useMovingElements";
import type { OverlayRefs } from "./useOverlayRefs";

/** The DOM nodes and animation state the overlay keeps for the elements on screen. */
export interface OverlaySync {
  viewport: HTMLDivElement;
  audioContainer: HTMLDivElement | null;
  refs: Pick<
    OverlayRefs,
    | "nodeMapRef"
    | "posMapRef"
    | "targetMapRef"
    | "animatingRef"
    | "flyingRef"
    | "mediaElMapRef"
    | "overlayElementsRef"
  >;
  onMediaEnded?: (id: string) => void;
}

function lerpAngle(current: number, target: number, factor: number): number {
  let delta = (target - current) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return current + delta * factor;
}

/** Drops the nodes and media of elements that no longer exist. */
export function removeDeletedElements(presentIds: Set<string>, sync: OverlaySync) {
  const { nodeMapRef, posMapRef, targetMapRef, animatingRef, mediaElMapRef } = sync.refs;
  for (const [id, node] of nodeMapRef.current) {
    if (!presentIds.has(id)) {
      node.remove();
      nodeMapRef.current.delete(id);
      posMapRef.current.delete(id);
      targetMapRef.current.delete(id);
      animatingRef.current.delete(id);
    }
  }
  // Remove deleted audio elements
  for (const [id, media] of mediaElMapRef.current) {
    if (!presentIds.has(id)) {
      media.pause();
      if (media.parentNode) media.parentNode.removeChild(media);
      mediaElMapRef.current.delete(id);
    }
  }
}

/** Audio is a hidden element with no visual node: create it once, then keep its volume current. */
export function syncAudioElement(el: CanvasElement, sync: OverlaySync) {
  const mediaElMap = sync.refs.mediaElMapRef.current;
  if (!mediaElMap.has(el.id)) {
    const audio = document.createElement("audio");
    audio.src = el.src;
    audio.volume = el.mediaVolume ?? 0.25;
    audio.preload = "auto";
    audio.addEventListener("ended", () => sync.onMediaEnded?.(el.id));
    if (el.mediaCurrentTime && el.mediaCurrentTime > 0) {
      audio.addEventListener(
        "loadedmetadata",
        () => {
          audio.currentTime = el.mediaCurrentTime!;
        },
        { once: true },
      );
    }
    if (sync.audioContainer) sync.audioContainer.appendChild(audio);
    mediaElMap.set(el.id, audio);
  } else {
    const audio = mediaElMap.get(el.id)!;
    audio.volume = el.mediaVolume ?? 0.25;
  }
}

/** Builds the node for an element the overlay has not shown before and registers it. */
function createElementNode(el: CanvasElement, sync: OverlaySync) {
  const { nodeMapRef, posMapRef, targetMapRef, mediaElMapRef } = sync.refs;
  const node = document.createElement("div");
  node.style.cssText = "position:absolute;transform-origin:center center;";

  const content = createMediaElement(el, {
    isOverlay: true,
    onMediaReady: (media) => mediaElMapRef.current.set(el.id, media),
    onVisibilityChange: (visible) => {
      if (!visible) sync.onMediaEnded?.(el.id);
    },
  });
  content.classList.add("element-content");
  node.appendChild(content);

  sync.viewport.appendChild(node);
  const ox = el.x - STREAM_OFFSET_X,
    oy = el.y - STREAM_OFFSET_Y;
  nodeMapRef.current.set(el.id, node);
  posMapRef.current.set(el.id, { x: ox, y: oy, rotation: el.rotation ?? 0 });
  targetMapRef.current.set(el.id, { x: ox, y: oy, rotation: el.rotation ?? 0 });
  node.style.left = ox + "px";
  node.style.top = oy + "px";
  node.style.width = el.width + "px";
  node.style.height = el.height + "px";
  setScale(node, el.scaleX ?? 1, el.scaleY ?? 1);
  setRotation(node, el.rotation ?? 0);
  applyNodeTransform(node);
  node.style.visibility = el.visible ? "visible" : "hidden";
  node.dataset.visible = String(el.visible);
  return node;
}

/** Plays the enter or exit animation when an element is shown or hidden. */
function syncVisibility(node: HTMLElement, el: CanvasElement) {
  const previousVisible = node.dataset.visible === "true";
  if (previousVisible !== el.visible) {
    node.dataset.visible = String(el.visible);
    const surface = node.firstElementChild as HTMLElement | null;
    surface?.getAnimations().forEach((animation) => animation.cancel());
    if (el.visible) {
      node.style.visibility = "visible";
      surface?.animate(animationFrames(el.enterAnimation), {
        duration: 320,
        easing: "cubic-bezier(.2,.8,.2,1)",
      });
    } else {
      const frames = animationFrames(el.exitAnimation).reverse();
      const animation = surface?.animate(frames, { duration: 260, easing: "ease-in" });
      if (animation) {
        animation.finished
          .then(() => {
            if (node?.dataset.visible === "false") node.style.visibility = "hidden";
          })
          .catch(() => {});
      } else node.style.visibility = "hidden";
    }
  } else if (!el.visible) {
    node.style.visibility = "hidden";
  }
}

/** Applies size, look, visibility, volume and text styling from the element to its node. */
function applyElementLook(node: HTMLElement, el: CanvasElement, sync: OverlaySync) {
  node.style.width = el.width + "px";
  node.style.height = el.height + "px";
  syncVisibility(node, el);
  node.style.opacity = String(el.opacity ?? 1);
  node.style.zIndex = String(el.zIndex);
  setScale(node, el.scaleX ?? 1, el.scaleY ?? 1);
  applyNodeTransform(node);
  playRequestedEffect(node, el);

  // Sync volume whenever element state changes
  if (el.type === "video") {
    const media = sync.refs.mediaElMapRef.current.get(el.id);
    if (media) media.volume = el.mediaVolume ?? 0.25;
  }

  if (el.type === "text") {
    const span = node.querySelector<HTMLSpanElement>("span");
    if (span) applyTextStyles(span, el.src);
  }
}

/** Glides a node towards its target position, a fraction of the way each frame, until it arrives. */
function startEasingToTarget(id: string, sync: OverlaySync) {
  const { nodeMapRef, posMapRef, targetMapRef, animatingRef, overlayElementsRef } = sync.refs;
  const posMap = posMapRef.current;
  const targetMap = targetMapRef.current;
  const nodeMap = nodeMapRef.current;
  const animating = animatingRef.current;
  animating.add(id);
  const FACTOR = 0.18;
  const animate = () => {
    const latestElement = overlayElementsRef.current.find((candidate) => candidate.id === id);
    if (latestElement?.dvdEnabled || latestElement?.flyStartedAt) {
      animating.delete(id);
      return;
    }
    const pos = posMap.get(id),
      target = targetMap.get(id),
      n = nodeMap.get(id);
    if (!pos || !target || !n) {
      animating.delete(id);
      return;
    }
    const curSx = latestElement?.scaleX ?? 1,
      curSy = latestElement?.scaleY ?? 1;
    pos.x += (target.x - pos.x) * FACTOR;
    pos.y += (target.y - pos.y) * FACTOR;
    pos.rotation = lerpAngle(pos.rotation, target.rotation, FACTOR);
    n.style.left = pos.x + "px";
    n.style.top = pos.y + "px";
    setScale(n, curSx, curSy);
    setRotation(n, pos.rotation);
    applyNodeTransform(n);
    const close =
      Math.abs(target.x - pos.x) < 0.3 &&
      Math.abs(target.y - pos.y) < 0.3 &&
      Math.abs(target.rotation - pos.rotation) < 0.3;
    if (close) {
      pos.x = target.x;
      pos.y = target.y;
      pos.rotation = target.rotation;
      n.style.left = target.x + "px";
      n.style.top = target.y + "px";
      setScale(n, curSx, curSy);
      setRotation(n, target.rotation);
      applyNodeTransform(n);
      animating.delete(id);
      return;
    }
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

/**
 * Decides how a node gets to its target position: flying and bouncing elements are moved
 * every frame elsewhere, everything else eases towards the target (so remote drags look smooth).
 */
function followTarget(node: HTMLElement, el: CanvasElement, sync: OverlaySync) {
  const { posMapRef, targetMapRef, animatingRef, flyingRef } = sync.refs;
  const posMap = posMapRef.current;
  const targetMap = targetMapRef.current;
  const animating = animatingRef.current;

  targetMap.set(el.id, {
    x: el.x - STREAM_OFFSET_X,
    y: el.y - STREAM_OFFSET_Y,
    rotation: el.rotation ?? 0,
  });

  if (isFlying(el)) {
    flyingRef.current.add(el.id);
    animating.delete(el.id);
    return;
  }
  if (flyingRef.current.delete(el.id)) {
    const restored = targetMap.get(el.id)!;
    const current = posMap.get(el.id);
    if (current) Object.assign(current, restored);
    node.style.left = `${restored.x}px`;
    node.style.top = `${restored.y}px`;
    setRotation(node, restored.rotation);
    applyNodeTransform(node);
    animating.delete(el.id);
    return;
  }

  // DVD motion already supplies a continuous position every animation
  // frame. Applying the remote-drag lerp as well makes the rendered node
  // lag behind the mathematical path and visually reverse before reaching
  // an edge.
  if (el.dvdEnabled) {
    const dvdPosition = getDvdPosition(el);
    const dvdX = dvdPosition.x - STREAM_OFFSET_X;
    const dvdY = dvdPosition.y - STREAM_OFFSET_Y;
    const current = posMap.get(el.id);
    if (current) {
      current.x = dvdX;
      current.y = dvdY;
      current.rotation = 0;
    }
    targetMap.set(el.id, { x: dvdX, y: dvdY, rotation: 0 });
    node.style.left = `${dvdX}px`;
    node.style.top = `${dvdY}px`;
    return;
  }

  if (!animating.has(el.id)) startEasingToTarget(el.id, sync);
}

/** Brings the DOM in line with the elements the server sent: adds, updates and removes nodes. */
export function syncOverlayElements(elements: CanvasElement[], sync: OverlaySync) {
  removeDeletedElements(new Set(elements.map((e) => e.id)), sync);
  for (const el of elements) {
    if (el.type === "audio") {
      syncAudioElement(el, sync);
      continue;
    }
    const node = sync.refs.nodeMapRef.current.get(el.id) ?? createElementNode(el, sync);
    applyElementLook(node, el, sync);
    followTarget(node, el, sync);
  }
}
