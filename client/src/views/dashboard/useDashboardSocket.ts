import { useCallback, useRef } from "react";
import { type MediaControlPayload, type CanvasElement, type FlyDirection } from "../../types";
import { useSocket } from "../../hooks/useSocket";
import type { DashboardProps } from "./types";
import type { useDashboardServices } from "./useDashboardServices";

/** The live connection: canvas elements, cursors, studio data, and the refs other parts use to reach the canvas. */
export function useDashboardSocket(
  props: DashboardProps,
  deps: Pick<ReturnType<typeof useDashboardServices>, "toast">,
) {
  const { onSessionRevoked, onRoleUpdated } = props;
  const { toast } = deps;
  const handleFillRejected = useCallback(() => {
    toast.info("Fill only works inside a fully enclosed shape");
  }, [toast]);
  const dashboardControlRef = useRef<((payload: MediaControlPayload) => void) | null>(null);
  const directUpdateRef = useRef<((id: string, changes: Partial<CanvasElement>) => void) | null>(
    null,
  );
  const previewFlyRef = useRef<
    | ((
        id: string,
        direction: FlyDirection,
        durationSeconds: number,
        onDone?: () => void,
      ) => (() => void) | null)
    | null
  >(null);
  const handleIncomingMediaControl = useCallback((payload: MediaControlPayload) => {
    dashboardControlRef.current?.(payload);
  }, []);
  const {
    elements,
    connected,
    overlayConnected,
    overlayCount,
    cursors,
    activeUsers,
    showCursorOnOverlay,
    setShowCursorOnOverlay,
    dvdCelebrationSettings,
    setDvdCelebrationSettings,
    chatEmoteSettings,
    setChatEmoteSettings,
    strokes,
    liveStrokes,
    addElement,
    updateElement,
    removeElement,
    sendCursor,
    emitMediaControl,
    refreshOverlay,
    addStroke,
    clearStrokes,
    sendLiveStroke,
    studio,
    historyStatus,
    chatChannel: twitchChannel,
    ttsPlayback,
    featureFlags,
    setChatChannel: setTwitchChannel,
    testOverlayAudio,
    undo,
    redo,
    saveScene,
    loadScene,
    deleteScene,
    savePreset,
    loadPreset,
    deletePreset,
    saveSound,
    deleteSound,
    previewSound,
    previewingSoundIds,
    stopPreviewSound,
    playSound,
    stopSound,
    saveTrigger,
    deleteTrigger,
  } = useSocket({
    mode: "dashboard",
    onSessionRevoked,
    onRoleUpdated,
    onMediaControl: handleIncomingMediaControl,
    directUpdateRef,
  });

  return {
    handleFillRejected,
    dashboardControlRef,
    directUpdateRef,
    previewFlyRef,
    handleIncomingMediaControl,
    elements,
    connected,
    overlayConnected,
    overlayCount,
    cursors,
    activeUsers,
    showCursorOnOverlay,
    setShowCursorOnOverlay,
    dvdCelebrationSettings,
    setDvdCelebrationSettings,
    chatEmoteSettings,
    setChatEmoteSettings,
    strokes,
    liveStrokes,
    addElement,
    updateElement,
    removeElement,
    sendCursor,
    emitMediaControl,
    refreshOverlay,
    addStroke,
    clearStrokes,
    sendLiveStroke,
    studio,
    historyStatus,
    twitchChannel,
    ttsPlayback,
    featureFlags,
    setTwitchChannel,
    testOverlayAudio,
    undo,
    redo,
    saveScene,
    loadScene,
    deleteScene,
    savePreset,
    loadPreset,
    deletePreset,
    saveSound,
    deleteSound,
    previewSound,
    previewingSoundIds,
    stopPreviewSound,
    playSound,
    stopSound,
    saveTrigger,
    deleteTrigger,
  };
}
