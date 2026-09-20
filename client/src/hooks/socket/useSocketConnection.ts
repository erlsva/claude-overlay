import type { AppSocket } from "./types";
import { useEffect } from "react";
import { io } from "socket.io-client";
import { SERVER_URL } from "../../config/server";
import { getAuthToken } from "../useAuth";
import { type CanvasElement } from "../../types";
import { TWITCH_CHANNELS, DEFAULT_TWITCH_CHANNEL } from "../../config/twitchChannels";
import { playTestTone } from "../../audio/testTone";
import type { UseSocketOptions } from "../useSocket";
import type { useSocketState } from "./useSocketState";
import type { useSocketRefs } from "./useSocketRefs";
import type { useSocketServices } from "./useSocketServices";
import type { useSoundActions } from "./useSoundActions";

/** Opens the connection and keeps the state in step with what the server sends. */
export function useSocketConnection(
  props: UseSocketOptions,
  deps: Pick<
    ReturnType<typeof useSocketState>,
    | "setActiveUsers"
    | "setChatChannelState"
    | "setChatEmoteSettingsState"
    | "setChatEmoteSpawn"
    | "setConnected"
    | "setCursors"
    | "setDvdCelebrationSettingsState"
    | "setElements"
    | "setFeatureFlags"
    | "setHistoryStatus"
    | "setLiveStrokes"
    | "setOverlayConnected"
    | "setOverlayCount"
    | "setStrokes"
    | "setStudio"
    | "setTtsPlayback"
    | "socketRef"
  > &
    Pick<
      ReturnType<typeof useSocketRefs>,
      | "activeSoundAudioRef"
      | "connectedOnceRef"
      | "cursorExpiryTimers"
      | "lastConnectionToastRef"
      | "onMediaControlRef"
      | "onRoleUpdatedRef"
      | "pendingAudioTests"
      | "pendingCursors"
      | "pendingUpdates"
      | "rafRef"
    > &
    Pick<ReturnType<typeof useSocketServices>, "toast"> &
    Pick<ReturnType<typeof useSoundActions>, "startSound">,
) {
  const { mode = "dashboard", onSessionRevoked, onOverlayRefresh, directUpdateRef } = props;
  const {
    setActiveUsers,
    setChatChannelState,
    setChatEmoteSettingsState,
    setChatEmoteSpawn,
    setConnected,
    setCursors,
    setDvdCelebrationSettingsState,
    setElements,
    setFeatureFlags,
    setHistoryStatus,
    setLiveStrokes,
    setOverlayConnected,
    setOverlayCount,
    setStrokes,
    setStudio,
    setTtsPlayback,
    socketRef,
    activeSoundAudioRef,
    connectedOnceRef,
    cursorExpiryTimers,
    lastConnectionToastRef,
    onMediaControlRef,
    onRoleUpdatedRef,
    pendingAudioTests,
    pendingCursors,
    pendingUpdates,
    rafRef,
    toast,
    startSound,
  } = deps;
  useEffect(() => {
    const socket: AppSocket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      query: mode === "dashboard" ? {} : { mode },
      auth: mode === "dashboard" ? { token: getAuthToken() ?? "" } : {},
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      if (mode === "dashboard" && connectedOnceRef.current)
        toast.success("Reconnected to the dashboard server");
      connectedOnceRef.current = true;
    });
    socket.on("disconnect", () => {
      setConnected(false);
      if (mode === "dashboard") {
        lastConnectionToastRef.current = Date.now();
        toast.error("Disconnected from the dashboard server. Reconnecting…");
      }
    });
    socket.on("connect_error", (err) => {
      console.error("Socket connect error:", err.message);
      if (mode === "dashboard" && Date.now() - lastConnectionToastRef.current > 8000) {
        lastConnectionToastRef.current = Date.now();
        toast.error(`Could not connect to the dashboard server: ${err.message}`);
      }
    });
    socket.on("overlay:status", ({ connected: online, count }) => {
      setOverlayConnected(online);
      setOverlayCount(count);
    });

    const normalizeScale = (el: CanvasElement): CanvasElement => ({
      ...el,
      scaleX: el.scaleX < 0 ? -1 : 1,
      scaleY: el.scaleY < 0 ? -1 : 1,
    });
    socket.on("state:sync", (state) => setElements(state.elements.map(normalizeScale)));
    socket.on("element:added", ({ element }) =>
      setElements((p) => {
        const normalized = normalizeScale(element);
        // May already be present from the optimistic local add — replace rather than duplicate.
        if (p.some((el) => el.id === normalized.id)) {
          return p.map((el) => (el.id === normalized.id ? normalized : el));
        }
        return [...p, normalized];
      }),
    );
    socket.on("element:removed", ({ id }) => setElements((p) => p.filter((el) => el.id !== id)));

    // Batch position updates via rAF
    socket.on("element:updated", ({ id, changes }) => {
      if (!changes || typeof changes !== "object") return;
      // Flight duration must use the receiving browser's clock. Comparing a
      // Render server timestamp with a viewer's system clock can clamp the
      // animation to its beginning or end and make duration changes ineffective.
      const normalizedChanges = {
        ...changes,
        ...(changes.flyStartedAt ? { flyStartedAt: Date.now() } : {}),
        ...(changes.effectStartedAt ? { effectStartedAt: Date.now() } : {}),
      };
      pendingUpdates.current.set(id, {
        ...(pendingUpdates.current.get(id) ?? {}),
        ...normalizedChanges,
      });
    });
    socket.on("media:control", (payload) => onMediaControlRef.current?.(payload));

    socket.on("cursor:move", (payload) => {
      pendingCursors.current.set(payload.userId, payload);
      const existingTimer = cursorExpiryTimers.current.get(payload.userId);
      if (existingTimer !== undefined) window.clearTimeout(existingTimer);
      cursorExpiryTimers.current.set(
        payload.userId,
        window.setTimeout(() => {
          pendingCursors.current.delete(payload.userId);
          setCursors((previous) => {
            const next = new Map(previous);
            next.delete(payload.userId);
            return next;
          });
          cursorExpiryTimers.current.delete(payload.userId);
        }, 650),
      );
    });
    socket.on("users:list", (users) => setActiveUsers(users));
    socket.on("user:joined", (user) =>
      setActiveUsers((p) => [...p.filter((u) => u.userId !== user.userId), user]),
    );
    socket.on("user:left", ({ userId }) => {
      const timer = cursorExpiryTimers.current.get(userId);
      if (timer !== undefined) window.clearTimeout(timer);
      cursorExpiryTimers.current.delete(userId);
      setActiveUsers((p) => p.filter((u) => u.userId !== userId));
      setCursors((p) => {
        const m = new Map(p);
        m.delete(userId);
        return m;
      });
    });
    socket.on("session:revoked", () => {
      socket.disconnect();
      onSessionRevoked?.();
    });
    socket.on("session:role_updated", () => onRoleUpdatedRef.current?.());
    socket.on("overlay:refresh", () => {
      if (onOverlayRefresh) {
        onOverlayRefresh();
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.set("v", String(Date.now()));
      window.location.replace(url.toString());
    });

    socket.on("draw:sync", (s) => setStrokes(s));
    socket.on("draw:stroke", (stroke) => setStrokes((prev) => [...prev, stroke]));
    socket.on("draw:clear", () => {
      setStrokes([]);
      setLiveStrokes(new Map());
    });
    socket.on("draw:live", (live) => {
      setLiveStrokes((prev) => {
        const next = new Map(prev);
        if (live.points.length === 0) {
          next.delete(live.userId);
        } else {
          next.set(live.userId, live);
        }
        return next;
      });
    });
    socket.on("dvd:settings", setDvdCelebrationSettingsState);
    socket.on("chat-emote:settings", setChatEmoteSettingsState);
    socket.on("features:updated", setFeatureFlags);
    socket.on("chat-emote:spawn", setChatEmoteSpawn);
    socket.on("studio:sync", setStudio);
    socket.on("history:status", setHistoryStatus);
    socket.on("chat:channel", ({ channel }) => {
      const normalized = channel.trim().toLowerCase();
      setChatChannelState(
        TWITCH_CHANNELS.includes(normalized) ? normalized : DEFAULT_TWITCH_CHANNEL,
      );
    });
    socket.on("sound:play", (item) => {
      if (mode !== "overlay") return;
      startSound(item, true, false);
    });
    socket.on("sound:stop", ({ id }) => {
      if (mode !== "overlay") return;
      for (const audio of [...activeSoundAudioRef.current]) {
        if (audio.dataset.soundId !== id) continue;
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch {
          // A remote stream may not be seekable yet; pausing still stops it.
        }
        // Reuse the normal completion path so chained actions waiting for the
        // sound also continue when a moderator stops it early.
        audio.dispatchEvent(new Event("ended"));
      }
    });
    socket.on("sound:pause", ({ id }) => {
      if (mode !== "overlay") return;
      for (const audio of activeSoundAudioRef.current) {
        if (audio.dataset.soundId === id) audio.pause();
      }
    });
    socket.on("sound:resume", ({ id }) => {
      if (mode !== "overlay") return;
      for (const audio of activeSoundAudioRef.current) {
        if (audio.dataset.soundId !== id || !audio.paused) continue;
        void audio.play().catch((error) => console.error("TTS resume failed:", error));
      }
    });
    socket.on("sound:volume", ({ id, volume }) => {
      if (mode !== "overlay") return;
      for (const audio of activeSoundAudioRef.current) {
        if (audio.dataset.soundId === id) audio.volume = volume;
      }
    });
    socket.on("tts:status", setTtsPlayback);
    socket.on("overlay:test-audio", async ({ testId }) => {
      if (mode !== "overlay") return;
      const result = await playTestTone();
      socket.emit("overlay:test-result", { testId, ...result });
    });
    socket.on("overlay:test-result", (result) => {
      pendingAudioTests.current.get(result.testId)?.(result);
    });

    // rAF loop — flush pending element and cursor updates once per frame
    const flushLoop = () => {
      rafRef.current = requestAnimationFrame(flushLoop);
      if (pendingUpdates.current.size > 0) {
        const batch = new Map(pendingUpdates.current);
        pendingUpdates.current.clear();
        const directUpdate = directUpdateRef?.current;
        const GEOMETRY_KEYS = new Set([
          "x",
          "y",
          "width",
          "height",
          "rotation",
          "scaleX",
          "scaleY",
        ]);
        // Apply to DOM immediately for smoothness
        if (directUpdate) {
          for (const [id, changes] of batch) {
            const keys = Object.keys(changes);
            if (keys.length > 0 && keys.every((k) => GEOMETRY_KEYS.has(k))) {
              directUpdate(id, changes);
            }
          }
        }
        // Always update React state to keep it in sync
        setElements((prev) =>
          prev.map((el) => {
            const u = batch.get(el.id);
            if (!u) return el;
            const merged = { ...el, ...u };
            if ("groupId" in u && u.groupId === null) {
              delete merged.groupId;
              delete merged.groupName;
            }
            return merged;
          }),
        );
      }
      if (pendingCursors.current.size > 0) {
        const batch = new Map(pendingCursors.current);
        pendingCursors.current.clear();
        setCursors((prev) => {
          const next = new Map(prev);
          batch.forEach((v, k) => next.set(k, v));
          return next;
        });
      }
    };
    rafRef.current = requestAnimationFrame(flushLoop);

    return () => {
      socket.disconnect();
      cancelAnimationFrame(rafRef.current);
      cursorExpiryTimers.current.forEach((timer) => window.clearTimeout(timer));
      cursorExpiryTimers.current.clear();
      activeSoundAudioRef.current.forEach((audio) => audio.pause());
      activeSoundAudioRef.current.clear();
    };
  }, [mode, startSound]);

  return {};
}
