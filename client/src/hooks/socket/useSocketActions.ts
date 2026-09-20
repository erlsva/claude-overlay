import {
  type CanvasElement,
  type MediaControlPayload,
  type DrawStroke,
  type LiveDrawStroke,
  type DvdCelebrationSettings,
  type ChatEmoteSettings,
  type OverlayTrigger,
} from "../../types";
import { useCallback } from "react";
import { randomUUID } from "../../utils";
import type { useSocketState } from "./useSocketState";
import type { useSocketRefs } from "./useSocketRefs";

/** What the dashboard can tell the server to do: edit elements, draw, save scenes, presets and triggers. */
export function useSocketActions(
  deps: Pick<
    ReturnType<typeof useSocketState>,
    | "setChatEmoteSettingsState"
    | "setDvdCelebrationSettingsState"
    | "setElements"
    | "setLiveStrokes"
    | "setShowCursorOnOverlayState"
    | "setStrokes"
    | "showCursorOnOverlay"
    | "socketRef"
  > &
    Pick<ReturnType<typeof useSocketRefs>, "pendingAudioTests">,
) {
  const {
    setChatEmoteSettingsState,
    setDvdCelebrationSettingsState,
    setElements,
    setLiveStrokes,
    setShowCursorOnOverlayState,
    setStrokes,
    showCursorOnOverlay,
    socketRef,
    pendingAudioTests,
  } = deps;
  const addElement = (element: CanvasElement) => {
    setElements((prev) => [...prev, element]);
    socketRef.current?.emit("element:add", { element });
  };
  const updateElement = useCallback((id: string, changes: Partial<CanvasElement>) => {
    // Socket payloads are runtime data even though this function is typed.
    // Ignore invalid callers instead of allowing `in`/spread operations on
    // null to take down the entire dashboard.
    if (!changes || typeof changes !== "object") return;
    setElements((prev) =>
      prev.map((el) => {
        if (el.id !== id) return el;
        const merged = { ...el, ...changes };
        if ("groupId" in changes && changes.groupId === null) {
          delete merged.groupId;
          delete merged.groupName;
        }
        return merged;
      }),
    );
    socketRef.current?.emit("element:update", { id, changes });
  }, []);
  const removeElement = (id: string) => socketRef.current?.emit("element:remove", { id });
  const setShowCursorOnOverlay = useCallback((visible: boolean) => {
    localStorage.setItem("show_cursor_on_overlay", String(visible));
    setShowCursorOnOverlayState(visible);
  }, []);
  const sendCursor = useCallback(
    (x: number, y: number) =>
      socketRef.current?.volatile.emit("cursor:move", {
        x,
        y,
        showOnOverlay: showCursorOnOverlay,
      }),
    [showCursorOnOverlay],
  );
  const emitMediaControl = useCallback(
    (payload: MediaControlPayload) => socketRef.current?.emit("media:control", payload),
    [],
  );
  const notifyMediaEnded = useCallback(
    (id: string) => socketRef.current?.emit("media:ended", { id }),
    [],
  );
  const refreshOverlay = useCallback(() => socketRef.current?.emit("overlay:refresh"), []);
  const addStroke = useCallback((stroke: DrawStroke) => {
    setStrokes((prev) => [...prev, stroke]);
    socketRef.current?.emit("draw:stroke", stroke);
    // Clear own live stroke now that it's committed
    socketRef.current?.volatile.emit("draw:live", {
      points: [],
      color: "",
      size: 0,
      eraser: false,
    });
  }, []);
  const clearStrokes = useCallback(() => {
    setStrokes([]);
    setLiveStrokes(new Map());
    socketRef.current?.emit("draw:clear");
  }, []);
  const sendLiveStroke = useCallback((data: Omit<LiveDrawStroke, "userId">) => {
    socketRef.current?.volatile.emit("draw:live", data);
  }, []);
  const setDvdCelebrationSettings = useCallback((settings: DvdCelebrationSettings) => {
    setDvdCelebrationSettingsState(settings);
    socketRef.current?.emit("dvd:settings", settings);
  }, []);
  const setChatEmoteSettings = useCallback((settings: ChatEmoteSettings) => {
    setChatEmoteSettingsState(settings);
    socketRef.current?.emit("chat-emote:settings", settings);
  }, []);
  const undo = useCallback(() => socketRef.current?.emit("history:undo"), []);
  const redo = useCallback(() => socketRef.current?.emit("history:redo"), []);
  const saveScene = useCallback(
    (id: string, name: string) => socketRef.current?.emit("scene:save", { id, name }),
    [],
  );
  const loadScene = useCallback((id: string) => socketRef.current?.emit("scene:load", { id }), []);
  const deleteScene = useCallback(
    (id: string) => socketRef.current?.emit("scene:delete", { id }),
    [],
  );
  const savePreset = useCallback(
    (id: string, name: string, elementIds: string[]) =>
      socketRef.current?.emit("preset:save", { id, name, elementIds }),
    [],
  );
  const loadPreset = useCallback(
    (id: string) => socketRef.current?.emit("preset:load", { id }),
    [],
  );
  const deletePreset = useCallback(
    (id: string) => socketRef.current?.emit("preset:delete", { id }),
    [],
  );
  const saveTrigger = useCallback(
    (trigger: OverlayTrigger) => socketRef.current?.emit("trigger:save", trigger),
    [],
  );
  const deleteTrigger = useCallback(
    (id: string) => socketRef.current?.emit("trigger:delete", { id }),
    [],
  );
  /** Asks the connected overlay to play a chime and reports whether it did. */
  const testOverlayAudio = useCallback(
    () =>
      new Promise<{ ok: boolean; message: string }>((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, message: "Not connected to the server." });
          return;
        }
        const testId = randomUUID();
        const finish = (ok: boolean, message: string) => {
          window.clearTimeout(timer);
          pendingAudioTests.current.delete(testId);
          resolve({ ok, message });
        };
        const timer = window.setTimeout(
          () => finish(false, "The overlay did not answer. Is it open in OBS?"),
          6_000,
        );
        pendingAudioTests.current.set(testId, (result) =>
          result.ok
            ? finish(true, "The overlay played the test chime.")
            : finish(false, result.error || "The overlay could not play audio."),
        );
        socket.emit("overlay:test-audio", { testId });
      }),
    [],
  );
  const setChatChannel = useCallback(
    (channel: string) => socketRef.current?.emit("chat:channel:set", { channel }),
    [],
  );

  return {
    addElement,
    updateElement,
    removeElement,
    setShowCursorOnOverlay,
    sendCursor,
    emitMediaControl,
    notifyMediaEnded,
    refreshOverlay,
    addStroke,
    clearStrokes,
    sendLiveStroke,
    setDvdCelebrationSettings,
    setChatEmoteSettings,
    undo,
    redo,
    saveScene,
    loadScene,
    deleteScene,
    savePreset,
    loadPreset,
    deletePreset,
    saveTrigger,
    deleteTrigger,
    testOverlayAudio,
    setChatChannel,
  };
}
