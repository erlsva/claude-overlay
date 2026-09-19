import { lazy, Suspense, useState, useCallback, useRef, useEffect } from "react";
import {
  CanvasStage,
  ElementPanel,
} from "../components/CanvasStage";
import { SPAWN_X, SPAWN_Y, WORKSPACE_H, WORKSPACE_W } from "../canvas/config";
import { DrawingCanvas, renderAction } from "../components/DrawingCanvas";
import type { DrawToolMode } from "../components/DrawingCanvas";
import { Toolbar } from "../components/Toolbar";
import { WhitelistPanel } from "../components/WhitelistPanel";
import {
  TextDialog,
  encodeTextSrc,
  decodeTextSrc,
} from "../components/TextDialog";
import type { TextConfig } from "../canvas/config";
import { DEFAULT_TEXT_CONFIG } from "../canvas/config";
import { useSocket } from "../hooks/useSocket";
import { usePresence } from "../hooks/usePresence";
import { randomUUID } from "../utils";
import type { AuthUser } from "../hooks/useAuth";
import { authHeaders } from "../hooks/useAuth";
import type {
  CanvasElement,
  FlyDirection,
  MediaControlPayload,
} from "../types";
import {
  Activity,
  Eye,
  EyeOff,
  PanelRightOpen,
  Repeat2,
  RotateCcw,
  Settings,
  MessageCircle,
  Volume2,
  LogOut,
  MonitorPlay,
  MousePointerClick,
  Rocket,
  X,
} from "lucide-react";
import { useToast } from "../components/ToastProvider";
import { HelpGuide } from "../components/HelpGuide";
import { SelectionHint } from "../components/SelectionHint";
import { OnboardingTour } from "../components/OnboardingTour";
import { Segmented } from "../components/Segmented";
import TileController from "../components/TileController";
import { ReadinessCheck } from "../components/ReadinessCheck";
import { SupportDiagnostics } from "../components/SupportDiagnostics";
import { SetupGuide } from "../components/SetupGuide";
import { OverlayMirror } from "../components/OverlayMirror";
import { RoleTag } from "../components/RoleTag";
import { useConfirm } from "../components/ConfirmProvider";
import {
  CUSTOM_ACCENT_STORAGE_KEY,
  THEME_STORAGE_KEY,
  customAccentVariables,
  loadStoredAccent,
  loadStoredTheme,
  type DashboardTheme,
} from "../theme";
import { CAN_SWITCH_TWITCH_CHANNEL, TWITCH_CHANNELS } from "../config/twitchChannels";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";
const OVERLAY_CLIPBOARD_TYPE = "application/x-vicksy-overlay-elements";
const ONBOARDING_VERSION = "v2";
const APP_VERSION = import.meta.env.VITE_BUILD_ID ?? import.meta.env.VITE_APP_VERSION ?? "local";
const UI_SCALE_STORAGE_KEY = "overlay_dashboard_ui_scale";
const UI_SCALE_OPTIONS = [100, 110, 125] as const;
type DashboardUiScale = (typeof UI_SCALE_OPTIONS)[number];
const StudioPanel = lazy(() => import("../components/StudioPanel").then((module) => ({ default: module.StudioPanel })));

function loadDashboardUiScale(): DashboardUiScale {
  const stored = Number(localStorage.getItem(UI_SCALE_STORAGE_KEY));
  return UI_SCALE_OPTIONS.includes(stored as DashboardUiScale)
    ? (stored as DashboardUiScale)
    : 100;
}

function isEditingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement &&
    (target.matches("input, textarea, select") || target.isContentEditable);
}

function validClipboardElement(value: unknown): value is CanvasElement {
  if (!value || typeof value !== "object") return false;
  const element = value as Partial<CanvasElement>;
  return (
    typeof element.id === "string" &&
    ["image", "gif", "video", "audio", "text"].includes(element.type ?? "") &&
    typeof element.src === "string" &&
    typeof element.x === "number" &&
    typeof element.y === "number" &&
    typeof element.width === "number" &&
    typeof element.height === "number"
  );
}

interface DashboardProps {
  user: AuthUser;
  onLogout: () => void;
  onSessionRevoked: () => void;
  onRoleUpdated: () => void;
}

export function Dashboard({
  user,
  onLogout,
  onSessionRevoked,
  onRoleUpdated,
}: DashboardProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const handleFillRejected = useCallback(() => {
    toast.info("Fill only works inside a fully enclosed shape");
  }, [toast]);
  const dashboardControlRef = useRef<
    ((payload: MediaControlPayload) => void) | null
  >(null);
  const directUpdateRef = useRef<
    ((id: string, changes: Partial<CanvasElement>) => void) | null
  >(null);
  const previewFlyRef = useRef<
    | ((
        id: string,
        direction: FlyDirection,
        durationSeconds: number,
        onDone?: () => void,
      ) => (() => void) | null)
    | null
  >(null);

  const handleIncomingMediaControl = useCallback(
    (payload: MediaControlPayload) => {
      dashboardControlRef.current?.(payload);
    },
    [],
  );

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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedElement =
    selectedIds.size === 1
      ? elements.find((element) => selectedIds.has(element.id))
      : undefined;
  const copiedElementsRef = useRef<CanvasElement[]>([]);
  const mediaUploadRef = useRef<((file: File) => Promise<void>) | null>(null);
  const [showWhitelist, setShowWhitelist] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showMirror, setShowMirror] = useState(() => {
    try {
      return localStorage.getItem("overlay_mirror") === "on";
    } catch {
      return false;
    }
  });
  const toggleMirror = useCallback(() => {
    setShowMirror((visible) => {
      try {
        localStorage.setItem("overlay_mirror", visible ? "off" : "on");
      } catch {
        // The preference is a convenience; the toggle still works without storage.
      }
      return !visible;
    });
  }, []);
  const [drawMode, setDrawMode] = useState(false);
  const [drawColor, setDrawColor] = useState("#ff4444");
  const [drawSize, setDrawSize] = useState(6);
  const [drawOpacity, setDrawOpacity] = useState(1);
  const [fillTolerance, setFillTolerance] = useState(64);
  const [toolMode, setToolMode] = useState<DrawToolMode>("pen");
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [showTwitchEmbed, setShowTwitchEmbed] = useState(true);
  const [twitchInteraction, setTwitchInteraction] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [dvdSoundUploading, setDvdSoundUploading] = useState(false);
  const [activityMenuOpen, setActivityMenuOpen] = useState(false);
  const [presenceMenuOpen, setPresenceMenuOpen] = useState(false);
  const profilePresence = usePresence(profileMenuOpen);
  const activityPresence = usePresence(activityMenuOpen);
  const connectionPresence = usePresence(presenceMenuOpen);
  const mirrorPresence = usePresence(showMirror);
  const [showStudio, setShowStudio] = useState(true);
  const [theme, setTheme] = useState<DashboardTheme>(loadStoredTheme);
  const [customAccent, setCustomAccent] = useState(loadStoredAccent);
  const [uiScale, setUiScale] = useState<DashboardUiScale>(loadDashboardUiScale);
  const [featureSaving, setFeatureSaving] = useState(false);
  const onboardingStorageKey = `overlay_onboarding_${ONBOARDING_VERSION}_${user.login.toLowerCase()}`;
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem(onboardingStorageKey) !== "complete",
  );

  const closeOnboarding = useCallback(() => {
    localStorage.setItem(onboardingStorageKey, "complete");
    setShowOnboarding(false);
  }, [onboardingStorageKey]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem(CUSTOM_ACCENT_STORAGE_KEY, customAccent);
  }, [customAccent]);
  useEffect(() => {
    localStorage.setItem(UI_SCALE_STORAGE_KEY, String(uiScale));
  }, [uiScale]);

  const setFeatureEnabled = useCallback(async (key: "tts" | "scenes", enabled: boolean) => {
    setFeatureSaving(true);
    try {
      const response = await fetch(`${SERVER_URL}/features`, {
        method: "PUT",
        credentials: "include",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        // Send only the flag being changed so the server never resets another one.
        body: JSON.stringify({ [key]: enabled }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not update feature flags");
      toast.success(`${key === "tts" ? "TTS Studio" : "Scenes"} ${enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update feature flags");
    } finally {
      setFeatureSaving(false);
    }
  }, [toast]);

  const handleDvdSoundUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setDvdSoundUploading(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch(`${SERVER_URL}/upload`, {
          method: "POST",
          body,
          credentials: "include",
          headers: authHeaders(),
        });
        if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
        const { url } = await response.json();
        setDvdCelebrationSettings({
          ...dvdCelebrationSettings,
          soundUrl: `${SERVER_URL}${url}?name=${encodeURIComponent(file.name)}`,
        });
        toast.success(`${file.name} is now the DVD corner sound`);
      } catch (error) {
        console.error("DVD celebration sound upload failed", error);
        toast.error(
          "DVD sound upload failed. Use an MP3, WAV, OGG, or WebM audio file.",
        );
      } finally {
        setDvdSoundUploading(false);
        event.target.value = "";
      }
    },
    [dvdCelebrationSettings, setDvdCelebrationSettings, toast],
  );

  const handleSelect = useCallback(
    (id: string | null, multi = false) => {
      if (!id) {
        setSelectedIds(new Set());
        return;
      }

      const clickedEl = elements.find((e) => e.id === id);
      if (clickedEl?.groupId && !multi) {
        const groupMembers = elements
          .filter((e) => e.groupId === clickedEl.groupId)
          .map((e) => e.id);
        setSelectedIds(new Set(groupMembers));
        return;
      }

      setSelectedIds((prev) => {
        if (multi) {
          const n = new Set(prev);
          n.has(id) ? n.delete(id) : n.add(id);
          return n;
        }
        return new Set([id]);
      });
    },
    [elements],
  );

  const handleSelectMany = useCallback(
    (ids: string[]) => setSelectedIds(new Set(ids)),
    [],
  );

  const handleDelete = useCallback(
    (id: string) => {
      removeElement(id);
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    },
    [removeElement],
  );

  const handleAdd = useCallback(
    (el: CanvasElement) => {
      addElement({ ...el, x: SPAWN_X, y: SPAWN_Y });
    },
    [addElement],
  );

  const pasteElementCopies = useCallback(
    (source: CanvasElement[]) => {
      if (!source.length) return;
      const groupIds = new Map<string, string>();
      const topZ = elements.reduce(
        (highest, element) => Math.max(highest, element.zIndex),
        Date.now(),
      );
      const copies = source.map((element, index) => {
        let groupId = element.groupId;
        if (groupId) {
          if (!groupIds.has(groupId)) groupIds.set(groupId, randomUUID());
          groupId = groupIds.get(groupId)!;
        }
        return {
          ...element,
          id: randomUUID(),
          x: element.x + 32,
          y: element.y + 32,
          zIndex: topZ + index + 1,
          groupId,
          dvdEnabled: false,
        } satisfies CanvasElement;
      });
      copies.forEach(addElement);
      copiedElementsRef.current = copies.map((element) => ({ ...element }));
      setSelectedIds(new Set(copies.map((element) => element.id)));
      toast.success(
        `Pasted ${copies.length} element${copies.length === 1 ? "" : "s"}`,
      );
    },
    [addElement, elements, toast],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isEditingTarget(event.target))
        return;

      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }

    };
    const onCopy = (event: ClipboardEvent) => {
      if (isEditingTarget(event.target)) return;
      const selected = elements.filter((element) => selectedIds.has(element.id));
      if (!selected.length || !event.clipboardData) return;
      copiedElementsRef.current = selected.map((element) => ({ ...element }));
      event.clipboardData.setData(
        OVERLAY_CLIPBOARD_TYPE,
        JSON.stringify(copiedElementsRef.current),
      );
      event.preventDefault();
      toast.success(
        `Copied ${selected.length} element${selected.length === 1 ? "" : "s"}`,
      );
    };
    const onPaste = (event: ClipboardEvent) => {
      if (isEditingTarget(event.target) || !event.clipboardData) return;

      const internal = event.clipboardData.getData(OVERLAY_CLIPBOARD_TYPE);
      if (internal) {
        try {
          const parsed = JSON.parse(internal) as unknown;
          const source = Array.isArray(parsed)
            ? parsed.filter(validClipboardElement)
            : [];
          if (source.length) {
            event.preventDefault();
            pasteElementCopies(source);
            return;
          }
        } catch {
          toast.error("The copied overlay elements could not be read");
          return;
        }
      }

      const mediaItem = Array.from(event.clipboardData.items).find(
        (item) => item.kind === "file" && /^(image|video|audio)\//.test(item.type),
      );
      const file = mediaItem?.getAsFile();
      if (file) {
        event.preventDefault();
        if (!mediaUploadRef.current) {
          toast.error("The media uploader is not ready yet");
          return;
        }
        void mediaUploadRef.current(file);
        return;
      }

      const text = event.clipboardData.getData("text/plain");
      if (!text.trim()) return;
      event.preventDefault();
      const safeText = text.slice(0, 9_500);
      const estimatedLines = safeText.split("\n").reduce(
        (count, line) => count + Math.max(1, Math.ceil(line.length / 22)),
        0,
      );
      const element: CanvasElement = {
        id: randomUUID(),
        type: "text",
        src: encodeTextSrc({
          ...DEFAULT_TEXT_CONFIG,
          text: safeText,
          color: "#ffffff",
          fontSize: 48,
          fontFamily: "Inter",
        }),
        x: SPAWN_X,
        y: SPAWN_Y,
        width: 520,
        height: Math.min(700, Math.max(80, estimatedLines * 58)),
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        zIndex: Date.now(),
      };
      addElement(element);
      setSelectedIds(new Set([element.id]));
      toast.success(
        safeText.length < text.length
          ? "Text pasted and shortened to the layer limit"
          : "Clipboard text added to the canvas",
      );
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("copy", onCopy);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("paste", onPaste);
    };
  }, [addElement, elements, pasteElementCopies, selectedIds, toast, undo, redo]);

  const handleGroup = useCallback(() => {
    const groupId = randomUUID();
    const groupCount = new Set(
      elements.flatMap((element) => (element.groupId ? [element.groupId] : [])),
    ).size;
    const groupName = `Group ${groupCount + 1}`;
    selectedIds.forEach((id) => updateElement(id, { groupId, groupName }));
  }, [elements, selectedIds, updateElement]);

  const handleUngroup = useCallback(() => {
    // Send null — server and clients both treat null groupId as "clear group"
    selectedIds.forEach((id) => updateElement(id, { groupId: null }));
  }, [selectedIds, updateElement]);

  const handleEditText = useCallback((id: string) => {
    setEditingTextId(id);
  }, []);

  const handleTextUpdate = useCallback(
    (config: TextConfig) => {
      if (!editingTextId) return;
      updateElement(editingTextId, { src: encodeTextSrc(config) });
      setEditingTextId(null);
      toast.success("Text layer updated");
    },
    [editingTextId, toast, updateElement],
  );

  const handleMediaControl = useCallback(
    (
      id: string,
      action: MediaControlPayload["action"],
      currentTime: number,
    ) => {
      emitMediaControl({ id, action, currentTime });
      // Persist playback position so refreshing users resume at the right spot
      const timeUpdate: Partial<import("../types").CanvasElement> = {
        mediaCurrentTime: currentTime,
      };
      if (action === "play") timeUpdate.mediaPaused = false;
      else if (action === "pause") timeUpdate.mediaPaused = true;
      updateElement(id, timeUpdate);
    },
    [emitMediaControl, updateElement],
  );

  const handleSaveDrawingAsElement = useCallback(async () => {
    if (strokes.length === 0) return;
    try {
      // Render the complete drawing first so fills and erased areas are included
      // when calculating the final transparent PNG bounds.
      const source = document.createElement("canvas");
      source.width = WORKSPACE_W;
      source.height = WORKSPACE_H;
      const sourceCtx = source.getContext("2d", { willReadFrequently: true })!;
      for (const action of strokes) renderAction(sourceCtx, action);

      const pixels = sourceCtx.getImageData(
        0,
        0,
        WORKSPACE_W,
        WORKSPACE_H,
      ).data;
      let minX = WORKSPACE_W,
        minY = WORKSPACE_H,
        maxX = -1,
        maxY = -1;
      for (let y = 0; y < WORKSPACE_H; y++) {
        for (let x = 0; x < WORKSPACE_W; x++) {
          if (pixels[(y * WORKSPACE_W + x) * 4 + 3] === 0) continue;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < minX || maxY < minY) return;

      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const cropped = document.createElement("canvas");
      cropped.width = width;
      cropped.height = height;
      cropped
        .getContext("2d")!
        .drawImage(source, minX, minY, width, height, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) =>
        cropped.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error("PNG conversion failed")),
          "image/png",
        ),
      );
      const body = new FormData();
      body.append("file", blob, `drawing-${Date.now()}.png`);
      const response = await fetch(`${SERVER_URL}/upload`, {
        method: "POST",
        body,
        headers: authHeaders(),
      });
      if (!response.ok)
        throw new Error(`Drawing upload failed (${response.status})`);
      const { url } = await response.json();

      addElement({
        id: randomUUID(),
        type: "image",
        src: `${SERVER_URL}${url}`,
        x: minX,
        y: minY,
        width,
        height,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        zIndex: Date.now(),
      });
      clearStrokes();
      toast.success("Drawing saved as a canvas element");
    } catch (error) {
      console.error("Could not convert drawing to an element:", error);
      toast.error(
        "Could not save the drawing as an element. Your drawing was kept.",
      );
      // Keep the strokes intact so a temporary upload failure never destroys work.
    }
  }, [strokes, addElement, clearStrokes, toast]);

  const isAdmin = user.isOwner || user.isAdmin;

  const editingTextEl = editingTextId
    ? elements.find((e) => e.id === editingTextId)
    : null;
  const editingTextConfig = editingTextEl
    ? decodeTextSrc(editingTextEl.src)
    : undefined;

  return (
    <div
      className="dashboard-shell"
      data-theme={theme}
      data-ui-scale={uiScale}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg-app)",
        color: "white",
        overflow: "hidden",
        ...(theme === "custom" ? customAccentVariables(customAccent) : {}),
      }}
    >
      <TileController channel={twitchChannel} />
      {/* Top bar */}
      <div className="dashboard-topbar">
        <div className="topbar-left">
          <span className="topbar-title">
            Stream Overlay <i aria-hidden="true">|</i>{" "}
            {twitchChannel.charAt(0).toUpperCase() + twitchChannel.slice(1)}
          </span>
        </div>
        <div className="topbar-right">
          <div className="topbar-group" role="group" aria-label="Twitch preview">
            <span className="topbar-group__label">
              Preview
              <strong>
                {twitchChannel.charAt(0).toUpperCase() + twitchChannel.slice(1)}
              </strong>
            </span>
            <button
              className={`ui-icon-button topbar-group__button${showTwitchEmbed ? " is-active" : ""}`}
              onClick={() => setShowTwitchEmbed((v) => !v)}
              aria-pressed={showTwitchEmbed}
              aria-label={showTwitchEmbed ? "Hide the Twitch stream preview" : "Show the Twitch stream preview"}
              title={
                showTwitchEmbed
                  ? "Hide the Twitch stream preview"
                  : "Show the Twitch stream preview"
              }
            >
              {showTwitchEmbed ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <button
              className={`ui-icon-button topbar-group__button${twitchInteraction ? " is-active" : ""}`}
              onClick={() => setTwitchInteraction((value) => !value)}
              disabled={!showTwitchEmbed}
              aria-pressed={twitchInteraction}
              aria-label="Use the stream player controls"
              title={
                twitchInteraction
                  ? "Done with the player. Turn canvas editing back on"
                  : "Use the stream player (play, pause, mute). Canvas editing is paused while this is on"
              }
            >
              <MousePointerClick size={15} />
            </button>
            {CAN_SWITCH_TWITCH_CHANNEL && (
              <button
                className={`ui-icon-button topbar-group__button${twitchChannel === TWITCH_CHANNELS[1] ? " is-active" : ""}`}
                onClick={() => {
                  const currentIndex = TWITCH_CHANNELS.indexOf(twitchChannel);
                  const nextChannel = TWITCH_CHANNELS[(currentIndex + 1) % TWITCH_CHANNELS.length];
                  setTwitchChannel(nextChannel);
                  toast.info(
                    `Switching preview and chat listener to ${nextChannel}`,
                  );
                }}
                aria-label="Switch Twitch preview channel"
                title={`Switch preview from ${twitchChannel} to ${TWITCH_CHANNELS[(TWITCH_CHANNELS.indexOf(twitchChannel) + 1) % TWITCH_CHANNELS.length]} (This will change the preview/layout for everyone)`}
              >
                <Repeat2 size={15} />
              </button>
            )}
          </div>
          <span className="topbar-divider" aria-hidden="true" />
          <div className="topbar-group" role="group" aria-label="Overlay">
            <span className="topbar-group__label">Overlay</span>
            <button
              className={`ui-icon-button topbar-group__button${showMirror ? " is-active" : ""}`}
              onClick={toggleMirror}
              aria-pressed={showMirror}
              aria-label={showMirror ? "Hide the live overlay preview" : "Show the live overlay preview"}
              title={showMirror ? "Hide the live overlay preview" : "Show a live, silent copy of what the overlay is showing, including emotes"}
            >
              <MonitorPlay size={15} />
            </button>
            <button
              className="ui-icon-button topbar-group__button"
              onClick={() => {
                refreshOverlay();
                toast.success("Overlay refresh requested");
              }}
              aria-label="Refresh overlay"
              title="Refresh the overlay (reloads the browser source in the streamer's OBS)"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <ReadinessCheck
            connected={connected}
            overlayConnected={overlayConnected}
            overlayCount={overlayCount}
            twitchConnected={studio.twitchConnected}
            twitchChannel={twitchChannel}
            chatEmotesEnabled={chatEmoteSettings.enabled}
            elements={elements}
            studio={studio}
            onTestAudio={testOverlayAudio}
          />
          <span className="topbar-divider" aria-hidden="true" />
          {isAdmin && (
            <button
              className="ui-icon-button topbar-icon"
              onClick={() => setShowWhitelist(true)}
              aria-label="Whitelist settings"
              title="Whitelist settings"
            >
              <Settings size={16} />
            </button>
          )}
          <button
            className={`ui-button topbar-studio${showStudio ? " is-active" : ""}`}
            onClick={() => setShowStudio((value) => !value)}
            aria-pressed={showStudio}
            title={
              showStudio
                ? "Close production tools"
                : "Open the Soundboard, chat commands, emotes, and overlay effects"
            }
          >
            <PanelRightOpen size={14} /> Studio
          </button>
        </div>
      </div>

      <Toolbar
        onAdd={handleAdd}
        mediaUploadRef={mediaUploadRef}
        onSaveSound={saveSound}
        drawMode={drawMode}
        onDrawModeToggle={() => setDrawMode((v) => !v)}
        drawColor={drawColor}
        onDrawColorChange={setDrawColor}
        drawSize={drawSize}
        onDrawSizeChange={setDrawSize}
        drawOpacity={drawOpacity}
        onDrawOpacityChange={setDrawOpacity}
        fillTolerance={fillTolerance}
        onFillToleranceChange={setFillTolerance}
        toolMode={toolMode}
        onToolModeChange={setToolMode}
        onDrawClear={async () => {
          if (!await confirm({
            title: "Clear the drawing?",
            message: "This removes every stroke, shape, and fill. You can restore it immediately with Undo.",
            confirmLabel: "Clear drawing",
            danger: true,
          })) return;
          clearStrokes();
          toast.success("Drawing cleared");
        }}
        onSaveDrawingAsElement={handleSaveDrawingAsElement}
        hasStrokes={strokes.length > 0}
        strokeCount={strokes.length}
        selectedElement={selectedElement}
        onElementChange={updateElement}
        onUndo={undo}
        onRedo={redo}
        canUndo={historyStatus.canUndo}
        canRedo={historyStatus.canRedo}
        trailing={
          (chatEmoteSettings.enabled || ttsPlayback.enabled) && (
            <>
            {chatEmoteSettings.enabled && (
              <span
                className="chat-emote-active-indicator"
                title="Chat emote mode is active on the overlay. Live chat emotes are intentionally not mirrored on the dashboard; use Studio → Emotes for a local preview."
              >
                <span className="chat-emote-active-indicator__dot" />
                <MessageCircle size={13} />
                Chat emotes active
              </span>
            )}
            {ttsPlayback.enabled && (
              <span
                className="chat-emote-active-indicator"
                title="TTS playback is enabled for the overlay. Open Studio → TTS to generate clips or turn TTS off."
              >
                <span className="chat-emote-active-indicator__dot" />
                <Volume2 size={13} />
                TTS active
              </span>
            )}
            </>
          )
        }
      />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <ElementPanel
          elements={elements}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onToggleVisible={(id) => {
            const el = elements.find((e) => e.id === id);
            if (el) updateElement(id, { visible: !el.visible });
          }}
          onDelete={handleDelete}
          onGroup={handleGroup}
          onUngroup={handleUngroup}
          onElementChange={updateElement}
          onEditText={handleEditText}
          dvdCelebrationSettings={dvdCelebrationSettings}
          dvdSoundUploading={dvdSoundUploading}
          onDvdSettingsChange={setDvdCelebrationSettings}
          onDvdSoundUpload={handleDvdSoundUpload}
          footer={
            <div
              style={{
                position: "relative",
                borderTop: "1px solid var(--line)",
                padding: 8,
                background: "var(--bg-app)",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "block",
                  padding: "0 0 7px",
                  marginBottom: 7,
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <button
                  onClick={() => {
                    setActivityMenuOpen((open) => !open);
                    setPresenceMenuOpen(false);
                    setProfileMenuOpen(false);
                  }}
                  title="Show the complete activity history"
                  aria-expanded={activityMenuOpen}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                    minHeight: 32,
                    padding: "0 7px",
                    border: `1px solid ${activityMenuOpen ? "var(--accent-border)" : "var(--line)"}`,
                    borderRadius: 5,
                    background: activityMenuOpen
                      ? "var(--accent-surface)"
                      : "var(--bg-raised)",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <Activity size={13} color="var(--accent-text)" />
                  <span style={{ fontSize: 11, fontWeight: 700 }}>
                    Activity
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                    {studio.activity.length} {activityMenuOpen ? "▲" : "▼"}
                  </span>
                </button>
                <div style={{ display: "grid", gap: 3, marginTop: 5 }}>
                  {studio.activity.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "5px 7px",
                        border: "1px solid var(--line)",
                        borderRadius: 4,
                        background: "var(--bg-sunken)",
                      }}
                    >
                      <div
                        style={{
                          color: "var(--text-secondary)",
                          fontSize: 11,
                          lineHeight: 1.35,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <strong>{item.user}</strong> {item.action}
                      </div>
                      <div
                        style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 1 }}
                      >
                        {new Date(item.at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {studio.activity.length === 0 && (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 11,
                        padding: "4px 7px",
                      }}
                    >
                      No activity yet
                    </div>
                  )}
                </div>
              </div>
              {activityPresence.mounted && (
                <div
                  role="dialog"
                  aria-label="Complete activity history"
                  className="motion-popover"
                  data-state={activityPresence.state}
                  style={{
                    position: "fixed",
                    left: "calc(var(--sidebar-width) + 10px)",
                    bottom: 16,
                    width:
                      "min(300px, calc(100vw - var(--sidebar-width) - 26px))",
                    maxHeight: "min(440px, calc(100vh - 32px))",
                    overflowY: "auto",
                    padding: 7,
                    background: "var(--bg-raised)",
                    border: "1px solid var(--line-strong)",
                    borderRadius: 7,
                    boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
                    zIndex: 3000,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      position: "sticky",
                      top: -7,
                      padding: "8px 4px",
                      margin: "-7px -1px 3px",
                      borderBottom: "1px solid var(--line)",
                      background: "var(--bg-raised)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <Activity size={14} color="var(--accent-text)" />
                    <strong style={{ fontSize: 12 }}>All activity</strong>
                    <span style={{ flex: 1 }} />
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                      {studio.activity.length}
                    </span>
                    <button
                      className="ui-icon-button ui-button--compact"
                      onClick={() => setActivityMenuOpen(false)}
                      title="Close activity history"
                      aria-label="Close activity history"
                      style={{
                        border: "1px solid var(--line-strong)",
                        background: "var(--bg-control)",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {studio.activity.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        gap: 7,
                        padding: "7px 4px",
                        borderBottom: "1px solid var(--line)",
                      }}
                    >
                      <Activity
                        size={12}
                        color="var(--accent-text)"
                        style={{ marginTop: 2, flexShrink: 0 }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: 11,
                            lineHeight: 1.4,
                          }}
                        >
                          <strong>{item.user}</strong> {item.action}
                        </div>
                        <small style={{ color: "var(--text-muted)", fontSize: 11 }}>
                          {new Date(item.at).toLocaleString()}
                        </small>
                      </div>
                    </div>
                  ))}
                  {studio.activity.length === 0 && (
                    <div
                      style={{ padding: 10, color: "var(--text-muted)", fontSize: 11 }}
                    >
                      No activity yet
                    </div>
                  )}
                </div>
              )}
              {connectionPresence.mounted && (
                <div
                  className="motion-popover"
                  data-state={connectionPresence.state}
                  style={{
                    position: "fixed",
                    left: "calc(var(--sidebar-width) + 10px)",
                    bottom: 16,
                    width:
                      "min(320px, calc(100vw - var(--sidebar-width) - 26px))",
                    maxHeight: "min(440px, calc(100vh - 32px))",
                    overflowY: "auto",
                    padding: 9,
                    background: "var(--bg-raised)",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                    zIndex: 3000,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "2px 3px 8px",
                      marginBottom: 7,
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    <strong style={{ color: "var(--text-primary)", fontSize: 12 }}>
                      Connection status
                    </strong>
                    <span style={{ flex: 1 }} />
                    <button
                      className="ui-icon-button ui-button--compact"
                      onClick={() => setPresenceMenuOpen(false)}
                      title="Close connection status"
                      aria-label="Close connection status"
                      style={{
                        border: "1px solid var(--line-strong)",
                        background: "var(--bg-control)",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gap: 5,
                      padding: "3px 4px 8px",
                      marginBottom: 6,
                      borderBottom: "1px solid var(--line)",
                      fontSize: 11,
                      color: "var(--text-secondary)",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 7 }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: overlayConnected ? "#4ade80" : "#f87171",
                        }}
                      />
                      Overlay: {overlayConnected ? "online" : "offline"}
                      {overlayCount > 1 ? ` (${overlayCount} sources)` : ""}
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 7 }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: connected ? "#4ade80" : "#f87171",
                        }}
                      />
                      Dashboard server:{" "}
                      {connected ? "connected" : "disconnected"}
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 7 }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: studio.twitchConnected
                            ? "#4ade80"
                            : "#f59e0b",
                        }}
                      />
                      Chat listener:{" "}
                      {studio.twitchConnected
                        ? `listening to ${twitchChannel}`
                        : `connecting to ${twitchChannel}`}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "2px 4px 6px",
                      color: "var(--text-muted)",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                    }}
                  >
                    ACTIVE NOW
                  </div>
                  {activeUsers.map((activeUser) => (
                    <div
                      key={activeUser.userId}
                      style={{
                        minHeight: 34,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "4px 5px",
                        color: "var(--text-primary)",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      <img
                        src={activeUser.avatar}
                        alt=""
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          border: `2px solid ${activeUser.color}`,
                        }}
                      />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {activeUser.displayName}
                      </span>
                      <RoleTag role={activeUser.role} />
                    </div>
                  ))}
                  {activeUsers.length === 0 && (
                    <div
                      style={{
                        padding: "7px 5px",
                        color: "var(--text-muted)",
                        fontSize: 11,
                      }}
                    >
                      No dashboard users reported
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => {
                  setPresenceMenuOpen((open) => !open);
                  setProfileMenuOpen(false);
                  setActivityMenuOpen(false);
                }}
                title="Show overlay status and everyone currently on the dashboard"
                aria-expanded={presenceMenuOpen}
                style={{
                  width: "100%",
                  height: 34,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "0 6px",
                  marginBottom: 6,
                  background: presenceMenuOpen ? "var(--bg-raised)" : "transparent",
                  border: "1px solid var(--line)",
                  borderRadius: 5,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: overlayConnected ? "#4ade80" : "#f87171",
                    boxShadow: overlayConnected
                      ? "0 0 6px rgba(74,222,128,0.55)"
                      : "none",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 11, fontWeight: 600 }}>
                  {overlayConnected ? "Overlay Online" : "Overlay Offline"}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ display: "flex", alignItems: "center" }}>
                  {activeUsers.slice(0, 4).map((activeUser, index) => (
                    <img
                      key={activeUser.userId}
                      src={activeUser.avatar}
                      alt={activeUser.displayName}
                      title={`${activeUser.displayName} is active`}
                      style={{
                        width: 22,
                        height: 22,
                        marginLeft: index === 0 ? 0 : -6,
                        borderRadius: "50%",
                        border: `2px solid ${activeUser.color}`,
                        background: "var(--bg-panel)",
                      }}
                    />
                  ))}
                  {activeUsers.length > 4 && (
                    <span
                      style={{
                        marginLeft: 4,
                        color: "var(--text-muted)",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      +{activeUsers.length - 4}
                    </span>
                  )}
                </span>
              </button>
              {profilePresence.mounted && (
                <div className="account-menu motion-popover" data-state={profilePresence.state} role="menu" aria-label="Account and settings">
                  <button
                    type="button"
                    className="account-menu__link"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setShowSetup(true);
                    }}
                  >
                    <Rocket size={16} />
                    <span>
                      Setup guide
                      <small>Overlay URL, OBS settings, audio test</small>
                    </span>
                  </button>
                  <section className="account-menu__group">
                    <h4>Theme</h4>
                    <Segmented
                      label="Dashboard theme"
                      value={theme}
                      onChange={setTheme}
                      options={[
                        { value: "fox", label: "Fox Orange" },
                        { value: "custom", label: "Custom" },
                      ]}
                    />
                    <label className="account-menu__row">
                      <span>Custom accent</span>
                      <input
                        type="color"
                        value={customAccent}
                        onChange={(event) => {
                          setCustomAccent(event.target.value);
                          setTheme("custom");
                        }}
                        title="Choose a custom dashboard accent color"
                        className="account-menu__color"
                      />
                    </label>
                  </section>

                  <section className="account-menu__group">
                    <h4>
                      Interface size <small>Dashboard only</small>
                    </h4>
                    <Segmented
                      label="Dashboard interface size"
                      value={uiScale}
                      onChange={(option) => {
                        setUiScale(option);
                        toast.success(`Dashboard interface set to ${option}%`);
                      }}
                      options={UI_SCALE_OPTIONS.map((option) => ({ value: option, label: `${option}%` }))}
                    />
                    <p className="account-menu__hint">
                      Canvas size and overlay coordinates stay unchanged.
                    </p>
                  </section>

                  <section className="account-menu__group">
                    <h4>Stream</h4>
                    <div className="account-menu__row account-menu__row--switch">
                      <span>
                        <strong>Show my cursor</strong>
                        <small>Visible on the overlay. Dashboard users always see it.</small>
                      </span>
                      <button
                        type="button"
                        className="ui-switch"
                        role="switch"
                        aria-checked={showCursorOnOverlay}
                        aria-label="Show my cursor on the overlay"
                        title="Choose whether your cursor is visible on the overlay; dashboard users always see it"
                        onClick={() => {
                          const visible = !showCursorOnOverlay;
                          setShowCursorOnOverlay(visible);
                          toast.success(
                            visible
                              ? "Your cursor is now visible on overlay"
                              : "Your cursor is now hidden from overlay",
                          );
                        }}
                      />
                    </div>
                  </section>

                  {user.isOwner && (
                    <section className="account-menu__group">
                      <h4>
                        Feature flags <small>Owner only</small>
                      </h4>
                      <div className="account-menu__row account-menu__row--switch">
                        <span>
                          <strong>TTS Studio</strong>
                          <small>Tab, generation, replay and trigger actions</small>
                        </span>
                        <button
                          type="button"
                          className="ui-switch"
                          role="switch"
                          aria-checked={featureFlags.tts}
                          aria-label="TTS Studio"
                          disabled={featureSaving}
                          title={featureFlags.tts ? "Turn TTS Studio off for everyone" : "Turn TTS Studio on for everyone"}
                          onClick={() => void setFeatureEnabled("tts", !featureFlags.tts)}
                        />
                      </div>
                      <div className="account-menu__row account-menu__row--switch">
                        <span>
                          <strong>Scenes</strong>
                          <small>Save and restore whole layouts</small>
                        </span>
                        <button
                          type="button"
                          className="ui-switch"
                          role="switch"
                          aria-checked={featureFlags.scenes}
                          aria-label="Scenes"
                          disabled={featureSaving}
                          title={featureFlags.scenes ? "Turn Scenes off for everyone" : "Turn Scenes on for everyone"}
                          onClick={() => void setFeatureEnabled("scenes", !featureFlags.scenes)}
                        />
                      </div>
                    </section>
                  )}

                  <button
                    type="button"
                    className="account-menu__logout"
                    onClick={onLogout}
                  >
                    <LogOut size={14} /> Log out
                  </button>
                </div>
              )}
              <button
                onClick={() => {
                  setProfileMenuOpen((open) => !open);
                  setPresenceMenuOpen(false);
                  setActivityMenuOpen(false);
                }}
                aria-expanded={profileMenuOpen}
                title={
                  profileMenuOpen
                    ? "Close account menu"
                    : "Open account menu and settings"
                }
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 6,
                  background: profileMenuOpen ? "var(--bg-raised)" : "transparent",
                  border: "1px solid transparent",
                  borderRadius: 5,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <img
                  src={user.avatar}
                  alt=""
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    border: `2px solid ${user.color ?? "#9146FF"}`,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    minWidth: 0,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 12,
                  }}
                >
                  {user.displayName}
                </span>
                <RoleTag role={user.role} />
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  {profileMenuOpen ? "▼" : "▲"}
                </span>
              </button>
            </div>
          }
        />
        {/* Own stacking layer: canvas layers and the floating preview stay below dialogs, and dialogs stay above Studio. */}
        <div style={{ flex: 1, position: "relative", minHeight: 0, isolation: "isolate", zIndex: 3 }}>
          {mirrorPresence.mounted && <OverlayMirror state={mirrorPresence.state} onClose={toggleMirror} />}
          <CanvasStage
            elements={elements}
            cursors={cursors}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onSelectMany={handleSelectMany}
            onElementChange={updateElement}
            onElementDelete={handleDelete}
            onCursorMove={sendCursor}
            onEditText={handleEditText}
            onMediaControl={handleMediaControl}
            mediaControlRef={dashboardControlRef}
            directUpdateRef={directUpdateRef}
            previewFlyRef={previewFlyRef}
            showTwitchEmbed={showTwitchEmbed}
            twitchInteractionEnabled={twitchInteraction && showTwitchEmbed}
            onTwitchInteractionChange={setTwitchInteraction}
            twitchChannel={twitchChannel}
            drawingLayer={
              <DrawingCanvas
                width={WORKSPACE_W}
                height={WORKSPACE_H}
                strokes={strokes}
                liveStrokes={liveStrokes}
                drawMode={drawMode}
                toolMode={toolMode}
                color={drawColor}
                size={drawSize}
                opacity={drawOpacity}
                fillTolerance={fillTolerance}
                onStroke={addStroke}
                onFillRejected={handleFillRejected}
                onLiveStroke={sendLiveStroke}
              />
            }
          />
          {drawMode && liveStrokes.size > 0 && (
            <div className="drawing-presence" role="status">
              <span />
              {[...liveStrokes.keys()]
                .map((userId) => activeUsers.find((activeUser) => activeUser.userId === userId)?.displayName ?? "Another editor")
                .slice(0, 2)
                .join(", ")}{liveStrokes.size > 2 ? ` +${liveStrokes.size - 2}` : ""} drawing
            </div>
          )}
          <HelpGuide onOpenTour={() => setShowOnboarding(true)} onOpenSetup={() => setShowSetup(true)} />
          <SupportDiagnostics snapshot={{
            version: APP_VERSION,
            user: user.displayName,
            channel: twitchChannel,
            theme,
            dashboardConnected: connected,
            overlayConnected,
            overlayCount,
            chatConnected: studio.twitchConnected,
            elementCount: elements.length,
            soundCount: studio.sounds.length,
            commandCount: studio.triggers.length,
          }} />
          <SelectionHint elements={elements} selectedIds={selectedIds} />
        </div>
        <div
          className={`studio-panel-shell${showStudio ? " studio-panel-shell--open" : ""}`}
          aria-hidden={!showStudio}
        >
          <Suspense fallback={<div className="studio-panel-loading">Loading Studio…</div>}>
            <StudioPanel
            studio={studio}
            elements={elements}
            selectedIds={selectedIds}
            isOwner={user.isOwner}
            overlayConnected={overlayConnected}
            ttsPlayback={ttsPlayback}
            featureFlags={featureFlags}
            onClose={() => setShowStudio(false)}
            onSaveScene={saveScene}
            onLoadScene={loadScene}
            onDeleteScene={deleteScene}
            onSavePreset={savePreset}
            onLoadPreset={loadPreset}
            onDeletePreset={deletePreset}
            onSaveSound={saveSound}
            onDeleteSound={deleteSound}
            onPreviewSound={previewSound}
            previewingSoundIds={previewingSoundIds}
            onStopPreviewSound={stopPreviewSound}
            onPlaySound={playSound}
            onStopSound={stopSound}
            onSaveTrigger={saveTrigger}
            onDeleteTrigger={deleteTrigger}
            onPreviewFly={(id, direction, durationSeconds, onDone) =>
              previewFlyRef.current?.(id, direction, durationSeconds, onDone) ?? null
            }
            chatEmoteSettings={chatEmoteSettings}
            onChatEmoteSettingsChange={setChatEmoteSettings}
            />
          </Suspense>
        </div>
      </div>

      {isAdmin && (
        <WhitelistPanel
          open={showWhitelist}
          onClose={() => setShowWhitelist(false)}
          isOwner={user.isOwner}
          isAdmin={isAdmin}
        />
      )}

      {editingTextId && (
        <TextDialog
          initial={editingTextConfig}
          onConfirm={handleTextUpdate}
          onClose={() => setEditingTextId(null)}
        />
      )}
      <SetupGuide
        open={showSetup}
        onClose={() => setShowSetup(false)}
        role={user.role}
        roles={user.roles}
        overlayConnected={overlayConnected}
        onTestAudio={testOverlayAudio}
        onOpenReadiness={() => window.setTimeout(() => document.querySelector<HTMLButtonElement>('[data-onboarding-action="readiness"]')?.click(), 0)}
      />
      <OnboardingTour
        open={showOnboarding}
        userName={user.displayName}
        onClose={closeOnboarding}
        hasLayers={elements.length > 0}
        overlayConnected={overlayConnected}
        onStartText={() => {
          closeOnboarding();
          window.setTimeout(() => document.querySelector<HTMLButtonElement>('[data-onboarding-action="add-text"]')?.click(), 0);
        }}
        onOpenSetup={() => {
          closeOnboarding();
          setShowSetup(true);
        }}
      />
    </div>
  );
}
