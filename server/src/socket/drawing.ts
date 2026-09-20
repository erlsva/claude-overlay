import type { LiveDrawStroke } from "../types.js";
import { checkpoint, historyStatus } from "./history.js";
import type { HandlerContext } from "./types.js";
import { validLiveStroke } from "./validateSettings.js";
import { validStroke } from "./validation.js";

const MAX_STROKES = 10_000;

/** Freehand drawing: finished strokes are kept, live strokes are only relayed while being drawn. */
export function registerDrawing(ctx: HandlerContext) {
  const { io, socket, store, user, record } = ctx;

  socket.on("draw:stroke", (stroke) => {
    const { drawStrokes } = store;
    if (!validStroke(stroke) || drawStrokes.length >= MAX_STROKES) return;
    if (drawStrokes.some((existing) => existing.id === stroke.id)) return;
    checkpoint(store);
    record(`stroke:${stroke.id}`, "added a drawing stroke");
    drawStrokes.push(stroke);
    socket.broadcast.emit("draw:stroke", stroke);
    io.to("dashboard").emit("history:status", historyStatus(store));
  });

  socket.on("draw:clear", () => {
    const { drawStrokes } = store;
    if (!drawStrokes.length) return;
    checkpoint(store);
    record("draw:clear", "cleared the drawing");
    drawStrokes.length = 0;
    socket.broadcast.emit("draw:clear");
    io.to("dashboard").emit("history:status", historyStatus(store));
  });

  socket.on("draw:live", (data) => {
    if (!validLiveStroke(data)) return;
    socket.volatile.broadcast.emit("draw:live", { ...data, userId: user.id } as LiveDrawStroke);
  });
}
