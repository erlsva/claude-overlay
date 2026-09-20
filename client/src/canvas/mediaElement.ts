/** Building the DOM node for an image, video, audio or text layer. */

import { type CanvasElement } from "../types";
import { getFileLabel } from "./config";
import { FileAudio } from "lucide-react";
import { applyTextStyles } from "./textStyle";
import { iconHTML } from "./icons";

// ---------------------------------------------------------------------------
// createMediaElement
// ---------------------------------------------------------------------------
function attachMediaListeners(
  media: HTMLMediaElement,
  onMediaEvent: (action: "play" | "pause" | "seek", currentTime: number) => void,
  trackNativeSeeking = false,
) {
  // Only track play/pause via events. Seek is emitted directly by UI controls to avoid
  // a re-emit loop (seeked fires asynchronously, potentially after __applyingRemote resets).
  media.addEventListener("play", () => {
    if ((media as any).__applyingRemote) return;
    onMediaEvent("play", media.currentTime);
  });
  media.addEventListener("pause", () => {
    if ((media as any).__applyingRemote) return;
    onMediaEvent("pause", media.currentTime);
  });
  if (trackNativeSeeking) {
    media.addEventListener("seeked", () => {
      const remoteTarget = (media as any).__remoteSeekTarget;
      if (typeof remoteTarget === "number" && Math.abs(media.currentTime - remoteTarget) < 0.25) {
        delete (media as any).__remoteSeekTarget;
        return;
      }
      if (!(media as any).__applyingRemote) onMediaEvent("seek", media.currentTime);
    });
  }
}

export function createMediaElement(
  el: CanvasElement,
  options: {
    isOverlay?: boolean;
    onMediaEvent?: (action: "play" | "pause" | "seek", currentTime: number) => void;
    onMediaReady?: (mediaEl: HTMLMediaElement) => void;
    onVolumeChange?: (vol: number) => void;
    onVisibilityChange?: (visible: boolean) => void;
  } = {},
): HTMLElement {
  const {
    isOverlay = false,
    onMediaEvent,
    onMediaReady,
    onVolumeChange,
    onVisibilityChange,
  } = options;
  const { type, src } = el;

  if (type === "text") {
    const span = document.createElement("span");
    span.style.cssText =
      "white-space:pre-wrap;display:block;width:100%;height:100%;padding:12px 16px;box-sizing:border-box;overflow:hidden;word-break:break-word;pointer-events:none;";
    applyTextStyles(span, src);
    return span;
  }

  if (type === "image" || type === "gif") {
    const img = document.createElement("img");
    img.src = src;
    img.draggable = false;
    img.style.cssText =
      "width:100%;height:100%;object-fit:contain;pointer-events:none;display:block;";
    return img;
  }

  if (type === "video") {
    const video = document.createElement("video");
    video.src = src;
    video.draggable = false;
    video.volume = el.mediaVolume ?? 0.25;
    video.preload = "auto";

    if (isOverlay) {
      video.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;";
      if (el.mediaCurrentTime && el.mediaCurrentTime > 0) {
        video.addEventListener(
          "loadedmetadata",
          () => {
            video.currentTime = el.mediaCurrentTime!;
          },
          { once: true },
        );
      }
      onMediaReady?.(video);
      return video;
    }

    // Dashboard: use the browser player for reliable, accessible playback.
    // Dashboard-only editing surface: drag anywhere above the native control
    // strip, while genuine clicks are forwarded to play/pause below.
    video.controls = true;
    video.style.cssText =
      "width:100%;height:100%;object-fit:contain;display:block;background:transparent;";

    if (onVisibilityChange) {
      video.addEventListener("play", () => onVisibilityChange(true));
      video.addEventListener("ended", () => onVisibilityChange(false));
    }
    if (onMediaEvent) attachMediaListeners(video, onMediaEvent, true);
    onMediaReady?.(video);

    video.addEventListener("loadedmetadata", () => {
      if (el.mediaCurrentTime && el.mediaCurrentTime > 0) {
        (video as any).__remoteSeekTarget = el.mediaCurrentTime;
        video.currentTime = el.mediaCurrentTime;
      }
    });
    video.addEventListener("volumechange", () => {
      const remoteTarget = (video as any).__remoteVolumeTarget;
      if (typeof remoteTarget === "number" && Math.abs(video.volume - remoteTarget) < 0.001) {
        delete (video as any).__remoteVolumeTarget;
        return;
      }
      onVolumeChange?.(video.volume);
    });

    const wrap = document.createElement("div");
    wrap.style.cssText =
      "position:relative;width:100%;height:100%;background:transparent;overflow:hidden;";
    wrap.appendChild(video);

    const dragHandle = document.createElement("div");
    dragHandle.className = "video-drag-handle";
    dragHandle.title = "Drag to move · Use the round handle above the selection to rotate";
    dragHandle.style.cssText =
      "position:absolute;top:0;left:0;right:0;bottom:48px;z-index:2;" +
      "cursor:move;user-select:none;box-sizing:border-box;";
    dragHandle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (video.paused) void video.play().catch(() => {});
      else video.pause();
    });
    wrap.appendChild(dragHandle);
    return wrap;
  }

  if (type === "audio") {
    if (isOverlay) {
      // Audio is handled via hidden elements in OverlayStage — return invisible placeholder
      const placeholder = document.createElement("div");
      placeholder.style.cssText = "width:0;height:0;overflow:hidden;pointer-events:none;";
      return placeholder;
    }

    const audio = document.createElement("audio");
    audio.src = src;
    audio.volume = el.mediaVolume ?? 0.25;
    audio.preload = "auto";
    audio.controls = true;
    audio.style.cssText =
      "display:block;width:100%;height:54px;flex-shrink:0;accent-color:var(--accent-border);";
    if (el.mediaCurrentTime && el.mediaCurrentTime > 0) {
      audio.addEventListener(
        "loadedmetadata",
        () => {
          audio.currentTime = el.mediaCurrentTime!;
        },
        { once: true },
      );
    }

    if (onMediaEvent) attachMediaListeners(audio, onMediaEvent, true);
    audio.addEventListener("volumechange", () => {
      const remoteTarget = (audio as any).__remoteVolumeTarget;
      if (typeof remoteTarget === "number" && Math.abs(audio.volume - remoteTarget) < 0.001) {
        delete (audio as any).__remoteVolumeTarget;
        return;
      }
      onVolumeChange?.(audio.volume);
    });
    onMediaReady?.(audio);

    const wrap = document.createElement("div");
    wrap.style.cssText =
      "width:100%;height:100%;min-height:86px;display:flex;flex-direction:column;" +
      "box-sizing:border-box;background:var(--bg-raised);border:1px solid var(--line);border-radius:8px;overflow:hidden;";

    const name = el.displayName || getFileLabel(src) || "Audio";
    const label = document.createElement("div");
    label.title = `${name} · Drag to move · Use the round handle above the selection to rotate`;
    label.style.cssText =
      "height:30px;flex-shrink:0;padding:0 10px;box-sizing:border-box;color:var(--text-primary);" +
      "font:600 11px Inter,sans-serif;display:flex;align-items:center;gap:6px;cursor:move;" +
      "background:var(--bg-control);border-bottom:1px solid var(--line);user-select:none;";
    const labelIcon = document.createElement("span");
    labelIcon.innerHTML = iconHTML(FileAudio, 12);
    labelIcon.style.cssText = "display:flex;flex-shrink:0;";
    const labelText = document.createElement("span");
    labelText.className = "media-name";
    labelText.textContent = name;
    labelText.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    label.appendChild(labelIcon);
    label.appendChild(labelText);

    wrap.appendChild(label);
    wrap.appendChild(audio);
    return wrap;
  }

  return document.createElement("div");
}
