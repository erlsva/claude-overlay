import type { AuthUser } from "../auth/routes.js";
import { getFeatureFlags } from "../db/index.js";
import type { CanvasStore } from "../state/canvasStore.js";
import { studioState } from "../state/studio.js";
import { getTwitchChatChannel } from "../twitch/eventsub.js";
import { createHandlerContext } from "./context.js";
import { registerDrawing } from "./drawing.js";
import { registerElements } from "./elements.js";
import { historyStatus, registerHistory } from "./history.js";
import { registerOverlayReports } from "./overlayEvents.js";
import { registerPresence } from "./presence.js";
import { registerSettings } from "./settings.js";
import { registerStudio } from "./studio.js";
import type { ActiveUser, AppServer, AppSocket } from "./types.js";

export type { ActiveUser } from "./types.js";

/** Sends a newly connected screen everything it needs to draw the canvas and Studio. */
function sendInitialState(
  socket: AppSocket,
  store: CanvasStore,
  isOverlay: boolean,
  user?: AuthUser,
) {
  socket.emit("state:sync", store.canvasState);
  socket.emit("draw:sync", store.drawStrokes);
  socket.emit("dvd:settings", store.dvdCelebrationSettings);
  socket.emit("chat-emote:settings", store.chatEmoteSettings);
  socket.emit("features:updated", getFeatureFlags());
  if (!isOverlay) socket.emit("chat:channel", { channel: getTwitchChatChannel() });
  if (!isOverlay && user) {
    socket.emit("studio:sync", studioState(store));
    socket.emit("history:status", historyStatus(store));
  }
}

function announceOverlays(io: AppServer, activeOverlays: Set<string>) {
  io.emit("overlay:status", { connected: activeOverlays.size > 0, count: activeOverlays.size });
}

/**
 * Wires up one socket. Overlays and the dashboard's preview only receive state; only a signed-in
 * dashboard user gets listeners that can change anything.
 */
export function registerSocketHandlers(
  io: AppServer,
  socket: AppSocket,
  store: CanvasStore,
  activeUsers: Map<string, ActiveUser>,
  activeOverlays: Set<string>,
  onMediaEnded?: (id: string) => void,
  onSoundEnded?: (playbackId: string, error?: string) => void,
) {
  const user = socket.data.jwtUser as AuthUser | undefined;
  // "mirror" is the dashboard's silent live preview. It renders like the overlay
  // (same room, same events) but is never counted as an overlay and cannot
  // acknowledge sounds or media, so it can't finish a command early.
  const connectionMode = socket.handshake.query.mode;
  const isOverlay = connectionMode === "overlay" || connectionMode === "mirror";
  const countsAsOverlay = connectionMode === "overlay";
  socket.join(isOverlay ? "overlay" : "dashboard");

  console.log(`Connected: ${user?.login ?? "overlay"} (${socket.id})`);
  sendInitialState(socket, store, isOverlay, user);
  if (countsAsOverlay) activeOverlays.add(socket.id);
  announceOverlays(io, activeOverlays);

  if (countsAsOverlay) registerOverlayReports(io, socket, store, onMediaEnded, onSoundEnded);

  socket.on("disconnect", () => {
    console.log(`Disconnected: ${user?.login ?? "overlay"} (${socket.id})`);
    if (activeOverlays.delete(socket.id)) announceOverlays(io, activeOverlays);
    if (!user || !activeUsers.delete(socket.id)) return;
    const stillConnected = [...activeUsers.values()].some((active) => active.userId === user.id);
    if (!stillConnected) io.emit("user:left", { userId: user.id });
  });

  if (!isOverlay && user) registerPresence(socket, user, activeUsers);

  // Public OBS renderers receive state, but never get mutation listeners.
  if (isOverlay || !user) return;

  const ctx = createHandlerContext(io, socket, store, user, activeOverlays);
  registerElements(ctx);
  registerDrawing(ctx);
  registerHistory(ctx);
  registerSettings(ctx);
  registerStudio(ctx);
}
