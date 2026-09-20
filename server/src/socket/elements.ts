import type { CanvasElement } from "../types.js";
import { validElement, validElementUpdate, validMediaControl } from "./validation.js";
import type { HandlerContext } from "./types.js";

const MAX_ELEMENTS = 1_000;

/** A locked element cannot be moved, resized, rotated or set bouncing. */
const LOCKED_KEYS = new Set([
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "scaleX",
  "scaleY",
  "dvdEnabled",
  "dvdStartedAt",
  "dvdStartX",
  "dvdStartY",
  "dvdVelocityX",
  "dvdVelocityY",
]);
/** Changes that move or resize a whole group at once, and so undo as one step. */
const TRANSFORM_KEYS = new Set(["x", "y", "width", "height", "rotation", "scaleX", "scaleY"]);

/** Removing an element can leave a group with one member, which is no longer a group. */
function dissolveLoneGroup(ctx: HandlerContext, removed: CanvasElement) {
  if (!removed.groupId) return;
  const remaining = ctx.store.canvasState.elements.filter(
    (candidate) => candidate.groupId === removed.groupId,
  );
  if (remaining.length !== 1) return;
  delete remaining[0].groupId;
  delete remaining[0].groupName;
  ctx.io.emit("element:updated", { id: remaining[0].id, changes: { groupId: null } });
}

/** The undo key and activity text for an update: group moves are one step, everything else per element. */
function describeUpdate(
  element: CanvasElement,
  changes: Partial<CanvasElement>,
): { key: string; action: string } {
  const changeKeys = Object.keys(changes);
  const groupId = typeof changes.groupId === "string" ? changes.groupId : element.groupId;
  const isGroupTransform =
    !!groupId && changeKeys.length > 0 && changeKeys.every((key) => TRANSFORM_KEYS.has(key));
  if (!isGroupTransform) return { key: `update:${element.id}`, action: `updated ${element.type}` };
  const verb = changeKeys.every((key) => key === "x" || key === "y") ? "moved" : "transformed";
  return { key: `update-group:${groupId}`, action: `${verb} ${element.groupName ?? "group"}` };
}

/** Adding, changing and removing elements on the canvas, and relaying media controls. */
export function registerElements(ctx: HandlerContext) {
  const { io, socket, store, record } = ctx;

  socket.on("element:add", ({ element }) => {
    const { elements } = store.canvasState;
    if (!validElement(element) || elements.length >= MAX_ELEMENTS) return;
    if (elements.some((existing) => existing.id === element.id)) return;
    record(`add:${element.id}`, `added ${element.type}`);
    elements.push(element);
    io.emit("element:added", { element });
  });

  socket.on("element:update", ({ id, changes }) => {
    if (typeof id !== "string" || id.length > 100 || !validElementUpdate(changes)) return;
    const element = store.canvasState.elements.find((candidate) => candidate.id === id);
    if (!element) return;
    if (element.locked && Object.keys(changes).some((key) => LOCKED_KEYS.has(key))) return;
    // Start times are stamped here so every screen animates from the same moment.
    const normalizedChanges = {
      ...changes,
      ...(changes.flyStartedAt ? { flyStartedAt: Date.now() } : {}),
      ...(changes.effectStartedAt ? { effectStartedAt: Date.now() } : {}),
    };
    const { key, action } = describeUpdate(element, changes);
    record(key, action);
    if ("groupId" in changes && changes.groupId === null) {
      delete element.groupId;
      delete element.groupName;
    }
    Object.assign(element, normalizedChanges);
    io.emit("element:updated", { id, changes: normalizedChanges });
  });

  socket.on("element:remove", ({ id }) => {
    if (typeof id !== "string" || id.length > 100) return;
    const element = store.canvasState.elements.find((candidate) => candidate.id === id);
    if (!element || element.locked) return;
    record(`remove:${id}`, `deleted ${element.type}`);
    store.canvasState.elements = store.canvasState.elements.filter((item) => item.id !== id);
    io.emit("element:removed", { id });
    dissolveLoneGroup(ctx, element);
  });

  socket.on("media:control", (payload) => {
    if (validMediaControl(payload)) socket.broadcast.emit("media:control", payload);
  });
}
