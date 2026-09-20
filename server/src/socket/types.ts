import type { Server, Socket } from "socket.io";
import type { AuthUser } from "../auth/routes.js";
import type { CanvasStore } from "../state/canvasStore.js";
import type { ClientToServerEvents, ServerToClientEvents, UserPresencePayload } from "../types.js";

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
export type ActiveUser = UserPresencePayload & { socketId: string };

/** What every group of handlers needs for one signed-in dashboard connection. */
export interface HandlerContext {
  io: AppServer;
  socket: AppSocket;
  store: CanvasStore;
  user: AuthUser;
  activeOverlays: Set<string>;
  /** Adds a line to the activity feed and refreshes every dashboard's Studio. */
  log(action: string): void;
  /**
   * Saves an undo step and logs the action. Changes with the same key in quick succession
   * (dragging an element, drawing a stroke) count as one step.
   */
  record(key: string, action: string): void;
  /** Sends the current scenes, presets, sounds, triggers and activity to the dashboards. */
  syncStudio(): void;
  /** Makes the next change a new undo step even if it repeats the last key. */
  resetCheckpoint(): void;
}
