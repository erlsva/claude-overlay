/**
 * The running server: the Express app, the HTTP server and Socket.IO on top of it, and who is
 * connected. These exist once per process, so the modules that need them import them from here.
 */

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { CLIENT_URL } from "./config/env.js";
import type { ActiveUser, AppServer } from "./socket/types.js";

export const app = express();
export const httpServer = createServer(app);

export const io: AppServer = new Server(httpServer, {
  cors: { origin: CLIENT_URL, methods: ["GET", "POST"], credentials: true },
});

/** Signed-in dashboard users, by socket id. */
export const activeUsers = new Map<string, ActiveUser>();
/** Sockets that are a real OBS overlay (the dashboard's silent preview does not count). */
export const activeOverlays = new Set<string>();
