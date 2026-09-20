import type { AuthUser } from "../auth/routes.js";
import type { CanvasStore } from "../state/canvasStore.js";
import { recordActivity, studioState } from "../state/studio.js";
import { checkpoint, historyStatus } from "./history.js";
import type { AppServer, AppSocket, HandlerContext } from "./types.js";

/** Two changes with the same key within this window are one undo step. */
const SAME_ACTION_WINDOW_MS = 750;

export function createHandlerContext(
  io: AppServer,
  socket: AppSocket,
  store: CanvasStore,
  user: AuthUser,
  activeOverlays: Set<string>,
): HandlerContext {
  let lastCheckpointKey = "";
  let lastCheckpointAt = 0;

  const syncStudio = () => io.to("dashboard").emit("studio:sync", studioState(store));
  const log = (action: string) => {
    recordActivity(store, user.displayName, action);
    syncStudio();
  };
  const record = (key: string, action: string) => {
    const now = Date.now();
    const isNewAction = key !== lastCheckpointKey || now - lastCheckpointAt > SAME_ACTION_WINDOW_MS;
    if (isNewAction) checkpoint(store);
    lastCheckpointKey = key;
    lastCheckpointAt = now;
    if (isNewAction) {
      log(action);
      io.to("dashboard").emit("history:status", historyStatus(store));
    }
  };
  const resetCheckpoint = () => {
    lastCheckpointKey = "";
  };

  return { io, socket, store, user, activeOverlays, log, record, syncStudio, resetCheckpoint };
}
