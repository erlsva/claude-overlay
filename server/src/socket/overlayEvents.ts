import type { CanvasStore } from "../state/canvasStore.js";
import type { AppServer, AppSocket } from "./types.js";

const validId = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;
const validError = (value: unknown) =>
  value === undefined || (typeof value === "string" && value.length <= 300);

/**
 * What a real overlay (not the dashboard preview) reports back: a video or audio layer ended,
 * a sound finished, or an audio test result. These are what let a command wait for the media.
 */
export function registerOverlayReports(
  io: AppServer,
  socket: AppSocket,
  store: CanvasStore,
  onMediaEnded?: (id: string) => void,
  onSoundEnded?: (playbackId: string, error?: string) => void,
) {
  socket.on("media:ended", ({ id }) => {
    if (!validId(id, 100)) return;
    const element = store.canvasState.elements.find((candidate) => candidate.id === id);
    if (!element || !["video", "audio"].includes(element.type) || !element.autoVisibility) return;
    onMediaEnded?.(id);
  });
  socket.on("overlay:test-result", ({ testId, ok, error }) => {
    if (!validId(testId, 64) || !validError(error)) return;
    io.to("dashboard").emit("overlay:test-result", {
      testId,
      ok: ok === true,
      ...(error ? { error } : {}),
    });
  });
  socket.on("sound:ended", ({ playbackId, error }) => {
    if (!validId(playbackId, 100) || !validError(error)) return;
    onSoundEnded?.(playbackId, error);
  });
}
