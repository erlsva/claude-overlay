import type { CanvasElement } from "../../types";
import { getFileLabel } from "../config";
import { setRotation, applyNodeTransform, setScale } from "../elementTransforms";
import { playRequestedEffect } from "../effects";
import { applyTextStyles } from "../textStyle";
import type { SyncContext } from "./context";

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
