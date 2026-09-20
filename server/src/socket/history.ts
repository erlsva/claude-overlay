import type { CanvasStore } from "../state/canvasStore.js";
import type { HandlerContext } from "./types.js";

const HISTORY_LIMIT = 30;

export const clone = <T>(value: T): T => structuredClone(value);

export function historyStatus(store: CanvasStore) {
  return { canUndo: store.undoStack.length > 0, canRedo: store.redoStack.length > 0 };
}

/** Saves the canvas and drawing as they are now, so the next change can be undone. */
export function checkpoint(store: CanvasStore) {
  store.undoStack.push({
    elements: clone(store.canvasState.elements),
    strokes: clone(store.drawStrokes),
  });
  if (store.undoStack.length > HISTORY_LIMIT) store.undoStack.shift();
  store.redoStack.length = 0;
}

/** Replaces the canvas and drawing with a saved snapshot and tells everyone. */
function restore({ io, store }: HandlerContext, snapshot: CanvasStore["undoStack"][number]) {
  const { canvasState, drawStrokes } = store;
  canvasState.elements = clone(snapshot.elements);
  drawStrokes.splice(0, drawStrokes.length, ...clone(snapshot.strokes));
  io.emit("state:sync", canvasState);
  io.emit("draw:sync", drawStrokes);
  io.to("dashboard").emit("history:status", historyStatus(store));
}

export function registerHistory(ctx: HandlerContext) {
  const { socket, store } = ctx;
  const current = () => ({
    elements: clone(store.canvasState.elements),
    strokes: clone(store.drawStrokes),
  });
  socket.on("history:undo", () => {
    const previous = store.undoStack.pop();
    if (!previous) return;
    ctx.resetCheckpoint();
    store.redoStack.push(current());
    restore(ctx, previous);
  });
  socket.on("history:redo", () => {
    const next = store.redoStack.pop();
    if (!next) return;
    ctx.resetCheckpoint();
    store.undoStack.push(current());
    restore(ctx, next);
  });
}
