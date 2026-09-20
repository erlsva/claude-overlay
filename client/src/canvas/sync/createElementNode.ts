import type { CanvasElement } from "../../types";
import { createMediaElement } from "../mediaElement";
import type { SyncContext } from "./context";
import {
  addClickToSelect,
  addDeleteButton,
  addResizeHandles,
  addSelectionBorder,
} from "./nodeChrome";
import { addNodeDragging, addNodeRotationHandle } from "./nodeDrag";

/**
 * The dashboard is silent (the overlay is what plays), so a video's sound is routed through a
 * gain of zero instead of just muting it, which keeps the element's own volume intact.
 */
function silenceDashboardVideo(
  media: HTMLVideoElement,
  ctx: Pick<SyncContext, "dashboardAudioContextRef" | "dashboardSilencedVideosRef">,
) {
  const { dashboardAudioContextRef, dashboardSilencedVideosRef } = ctx;
  if (dashboardSilencedVideosRef.current.has(media)) return;
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

/** Builds the DOM node for a new layer: its content, selection border, handles, delete button and drag behaviour. */
export function createElementNode(ctx: SyncContext, el: CanvasElement) {
  const {
    workspace,
    nodeMap,
    mediaElMap,
    elementsRef,
    volumeCommitTimersRef,
    onMediaControl,
    onElementChange,
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
      if (media instanceof HTMLVideoElement) silenceDashboardVideo(media, ctx);
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

  addSelectionBorder(node);
  addResizeHandles(node, el, ctx);
  addDeleteButton(node, el, ctx);
  addClickToSelect(node, el, ctx);
  addNodeRotationHandle(node, el, ctx);
  addNodeDragging(node, el, ctx);

  workspace.appendChild(node);
  nodeMap.set(el.id, node);
  return node;
}
