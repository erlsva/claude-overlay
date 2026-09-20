import type { Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "../../types";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
