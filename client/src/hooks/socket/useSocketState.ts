import type { AppSocket } from "./types";
import { useRef, useState } from "react";
import {
  type CanvasElement,
  type CursorPayload,
  type UserPresencePayload,
  type DrawStroke,
  type LiveDrawStroke,
  type DvdCelebrationSettings,
  type ChatEmoteSettings,
  type ChatEmoteSpawn,
  type StudioState,
  type TtsPlaybackState,
  type FeatureFlags,
} from "../../types";
import { DEFAULT_TWITCH_CHANNEL } from "../../config/twitchChannels";

/** Everything the server tells the client: canvas, users, studio data, settings and playback status. */
export function useSocketState() {
  const socketRef = useRef<AppSocket | null>(null);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [connected, setConnected] = useState(false);
  const [overlayConnected, setOverlayConnected] = useState(false);
  const [overlayCount, setOverlayCount] = useState(0);
  const [cursors, setCursors] = useState<Map<string, CursorPayload>>(new Map());
  const [activeUsers, setActiveUsers] = useState<UserPresencePayload[]>([]);
  const [showCursorOnOverlay, setShowCursorOnOverlayState] = useState(
    () => localStorage.getItem("show_cursor_on_overlay") === "true",
  );
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [liveStrokes, setLiveStrokes] = useState<Map<string, LiveDrawStroke>>(new Map());
  const [dvdCelebrationSettings, setDvdCelebrationSettingsState] = useState<DvdCelebrationSettings>(
    {
      volume: 0.25,
      soundUrl: null,
      counterPosition: "top-right",
    },
  );
  const [chatEmoteSettings, setChatEmoteSettingsState] = useState<ChatEmoteSettings>({
    enabled: false,
    showNames: true,
    nameBackgroundEnabled: true,
    nameBackgroundColor: "#08080a",
    nameFontSize: 12,
    motion: "floor",
    direction: "left",
    gravity: 900,
    size: 40,
    speed: 180,
    lifetimeSeconds: 12,
    maxVisible: 20,
    blacklist: [],
    additionalEmotes: [],
    blockedEmotes: [],
  });
  const [chatEmoteSpawn, setChatEmoteSpawn] = useState<ChatEmoteSpawn | null>(null);
  const [studio, setStudio] = useState<StudioState>({
    scenes: [],
    presets: [],
    sounds: [],
    triggers: [],
    activity: [],
    twitchConnected: false,
  });
  const [historyStatus, setHistoryStatus] = useState({
    canUndo: false,
    canRedo: false,
  });
  const [chatChannel, setChatChannelState] = useState(DEFAULT_TWITCH_CHANNEL);
  const [ttsPlayback, setTtsPlayback] = useState<TtsPlaybackState>({
    enabled: true,
    active: false,
    paused: false,
  });
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({ tts: true, scenes: false });
  const [previewingSoundIds, setPreviewingSoundIds] = useState<string[]>([]);

  return {
    socketRef,
    elements,
    setElements,
    connected,
    setConnected,
    overlayConnected,
    setOverlayConnected,
    overlayCount,
    setOverlayCount,
    cursors,
    setCursors,
    activeUsers,
    setActiveUsers,
    showCursorOnOverlay,
    setShowCursorOnOverlayState,
    strokes,
    setStrokes,
    liveStrokes,
    setLiveStrokes,
    dvdCelebrationSettings,
    setDvdCelebrationSettingsState,
    chatEmoteSettings,
    setChatEmoteSettingsState,
    chatEmoteSpawn,
    setChatEmoteSpawn,
    studio,
    setStudio,
    historyStatus,
    setHistoryStatus,
    chatChannel,
    setChatChannelState,
    ttsPlayback,
    setTtsPlayback,
    featureFlags,
    setFeatureFlags,
    previewingSoundIds,
    setPreviewingSoundIds,
  };
}
