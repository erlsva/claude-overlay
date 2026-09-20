import type React from "react";
import type { CanvasElement, MediaControlPayload } from "../types";
import { useSocketServices } from "./socket/useSocketServices";
import { useSocketState } from "./socket/useSocketState";
import { useSocketRefs } from "./socket/useSocketRefs";
import { useSoundActions } from "./socket/useSoundActions";
import { useSocketConnection } from "./socket/useSocketConnection";
import { useSocketActions } from "./socket/useSocketActions";
import type { SocketContext } from "./socket/context";

export interface UseSocketOptions {
  mode?: "dashboard" | "overlay" | "mirror";
  onSessionRevoked?: () => void;
  onRoleUpdated?: () => void;
  onMediaControl?: (payload: MediaControlPayload) => void;
  onOverlayRefresh?: () => void;
  directUpdateRef?: React.MutableRefObject<
    ((id: string, changes: Partial<CanvasElement>) => void) | null
  >;
}

export function useSocket(props: UseSocketOptions = {}) {
  const socketServices = useSocketServices();
  const socketState = useSocketState();
  const socketRefs = useSocketRefs(props);
  const soundActions = useSoundActions(props, { ...socketRefs, ...socketState, ...socketServices });
  const socketConnection = useSocketConnection(props, {
    ...socketState,
    ...socketRefs,
    ...socketServices,
    ...soundActions,
  });
  const socketActions = useSocketActions({ ...socketState, ...socketRefs });
  const s: SocketContext = {
    ...socketServices,
    ...socketState,
    ...socketRefs,
    ...soundActions,
    ...socketConnection,
    ...socketActions,
  };
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
    chatEmoteSpawn,
    strokes,
    liveStrokes,
    studio,
    historyStatus,
    chatChannel,
    ttsPlayback,
    featureFlags,
    setChatChannel,
    testOverlayAudio,
    addElement,
    updateElement,
    removeElement,
    sendCursor,
    emitMediaControl,
    notifyMediaEnded,
    refreshOverlay,
    addStroke,
    clearStrokes,
    sendLiveStroke,
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
  } = s;

  return {
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
    chatEmoteSpawn,
    strokes,
    liveStrokes,
    studio,
    historyStatus,
    chatChannel,
    ttsPlayback,
    featureFlags,
    setChatChannel,
    testOverlayAudio,
    addElement,
    updateElement,
    removeElement,
    sendCursor,
    emitMediaControl,
    notifyMediaEnded,
    refreshOverlay,
    addStroke,
    clearStrokes,
    sendLiveStroke,
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
