import type { AuthUser } from "../auth/routes.js";
import type { UserPresencePayload } from "../types.js";
import type { ActiveUser, AppSocket } from "./types.js";

/** Lists who is online, announces a newcomer, and relays their cursor to the other dashboards. */
export function registerPresence(
  socket: AppSocket,
  user: AuthUser,
  activeUsers: Map<string, ActiveUser>,
) {
  const presence: UserPresencePayload = {
    userId: user.id,
    login: user.login,
    displayName: user.displayName,
    avatar: user.avatar,
    color: user.color,
    role: user.role,
  };
  activeUsers.set(socket.id, { ...presence, socketId: socket.id });

  const seen = new Set<string>();
  const uniqueUsers = [...activeUsers.values()]
    .filter(({ userId }) => !seen.has(userId) && !!seen.add(userId))
    .map(({ socketId: _, ...active }) => active);
  const tabCount = [...activeUsers.values()].filter((active) => active.userId === user.id).length;
  if (tabCount === 1) socket.broadcast.emit("user:joined", presence);
  socket.emit("users:list", uniqueUsers);

  socket.on("cursor:move", ({ x, y, showOnOverlay }) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const payload = { ...presence, x, y };
    socket.to("dashboard").volatile.emit("cursor:move", payload);
    if (showOnOverlay === true) socket.to("overlay").volatile.emit("cursor:move", payload);
  });
}
