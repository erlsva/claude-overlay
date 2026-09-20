import { getUserFromToken } from "../auth/routes.js";
import { finishMedia } from "../playback/media.js";
import { settleSound } from "../playback/soundWaiters.js";
import { activeOverlays, activeUsers, io } from "../runtime.js";
import { registerSocketHandlers } from "../socket/handlers.js";
import { canvasStore } from "../state/canvasStore.js";
import { getTtsPlaybackState } from "../tts/service.js";

/**
 * Who may connect over Socket.IO. The OBS overlay and the dashboard's preview are public (they
 * only receive); everyone else must present a valid dashboard token.
 */
export function registerConnections() {
  io.use((socket, next) => {
    const mode = socket.handshake.query.mode;
    if (mode === "overlay" || mode === "mirror") return next();
    const token = socket.handshake.auth?.token as string | undefined;
    if (token) {
      const authorizedUser = getUserFromToken(token);
      if (authorizedUser) {
        socket.data.jwtUser = authorizedUser;
        return next();
      }
    }
    next(new Error("Unauthorized"));
  });

  io.on("connection", (socket) => {
    registerSocketHandlers(
      io,
      socket,
      canvasStore,
      activeUsers,
      activeOverlays,
      finishMedia,
      settleSound,
    );
    socket.emit("tts:status", getTtsPlaybackState());
  });
}
