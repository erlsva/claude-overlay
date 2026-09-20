import { useMarquee } from "../../hooks/useMarquee";
import { useEffect } from "react";
import {
  type SyncContext,
  installPreviewFly,
  installDirectUpdate,
  removeDeletedNodes,
  createElementNode,
  updateElementNode,
  syncGroupBoxes,
} from "../../canvas/syncElements";
import type { CanvasStageProps } from "./types";
import type { useStageRefs } from "./useStageRefs";
import type { useStageViewport } from "./useStageViewport";

/** Keeping the DOM in step with the elements: marquee selection, node syncing, volume and media controls. */
export function useElementSync(
  props: CanvasStageProps,
  deps: Pick<
    ReturnType<typeof useStageRefs>,
    | "dashboardAudioContextRef"
    | "dashboardSilencedVideosRef"
    | "draggingRef"
    | "elementsRef"
    | "groupBoxMapRef"
    | "mediaElMapRef"
    | "nodeMapRef"
    | "selectedIdsRef"
    | "snapXGuideRef"
    | "snapYGuideRef"
    | "volumeCommitTimersRef"
    | "workspaceRef"
    | "wrapperRef"
  > &
    Pick<ReturnType<typeof useStageViewport>, "getZoom" | "panRef" | "zoomRef">,
) {
  const {
    elements,
    selectedIds,
    onSelect,
    onSelectMany,
    onElementChange,
    onElementDelete,
    onEditText,
    onMediaControl,
    mediaControlRef,
    directUpdateRef,
    previewFlyRef,
  } = props;
  const {
    dashboardAudioContextRef,
    dashboardSilencedVideosRef,
    draggingRef,
    elementsRef,
    groupBoxMapRef,
    mediaElMapRef,
    nodeMapRef,
    selectedIdsRef,
    snapXGuideRef,
    snapYGuideRef,
    volumeCommitTimersRef,
    workspaceRef,
    wrapperRef,
    getZoom,
    panRef,
    zoomRef,
  } = deps;
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

  return {};
}
