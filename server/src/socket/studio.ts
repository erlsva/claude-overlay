/** The Studio's saved things: scenes, element presets, soundboard clips, and automation triggers. */

import { randomUUID } from "crypto";
import { getFeatureFlags, saveStudioData } from "../db/index.js";
import type { CanvasElement } from "../types.js";
import { checkpoint, clone, historyStatus } from "./history.js";
import type { HandlerContext } from "./types.js";
import { validLabel, validSoundUrl, validTrigger } from "./validateStudio.js";

const MAX_SCENES = 50;
const MAX_PRESETS = 100;
const MAX_SOUNDS = 100;
const MAX_TRIGGERS = 100;

/** Adds or replaces an item by id, keeping only the newest `limit`. */
function upsert<T extends { id: string }>(items: T[], item: T, limit: number): T[] {
  return [...items.filter((existing) => existing.id !== item.id), item].slice(-limit);
}

/** A preset inserted into the canvas gets new ids, and its groups get new ids too. */
function copyPresetElements(elements: CanvasElement[]): CanvasElement[] {
  const groups = new Map<string, string>();
  const groupCopy = (groupId: string) => {
    if (!groups.has(groupId)) groups.set(groupId, randomUUID());
    return groups.get(groupId);
  };
  return elements.map((element) => ({
    ...clone(element),
    id: randomUUID(),
    x: element.x + 32,
    y: element.y + 32,
    groupId: element.groupId ? groupCopy(element.groupId) : undefined,
  }));
}

function registerScenes(ctx: HandlerContext) {
  const { io, socket, store, log, syncStudio } = ctx;
  const { canvasState, drawStrokes } = store;

  socket.on("scene:save", async ({ id, name }) => {
    if (!getFeatureFlags().scenes) return;
    if (!validLabel(id, 100) || !validLabel(name, 60)) return;
    const scene = {
      id,
      name: name.trim(),
      elements: clone(canvasState.elements),
      strokes: clone(drawStrokes),
      updatedAt: new Date().toISOString(),
    };
    store.scenes = upsert(store.scenes, scene, MAX_SCENES);
    await saveStudioData({ scenes: store.scenes });
    log(`saved scene “${scene.name}”`);
  });

  socket.on("scene:load", ({ id }) => {
    if (!getFeatureFlags().scenes) return;
    const scene = store.scenes.find((item) => item.id === id);
    if (!scene) return;
    checkpoint(store);
    canvasState.elements = clone(scene.elements);
    drawStrokes.splice(0, drawStrokes.length, ...clone(scene.strokes));
    log(`loaded scene “${scene.name}”`);
    io.emit("state:sync", canvasState);
    io.emit("draw:sync", drawStrokes);
    io.to("dashboard").emit("history:status", historyStatus(store));
  });

  socket.on("scene:delete", async ({ id }) => {
    if (!getFeatureFlags().scenes) return;
    const item = store.scenes.find((scene) => scene.id === id);
    store.scenes = store.scenes.filter((scene) => scene.id !== id);
    await saveStudioData({ scenes: store.scenes });
    if (item) log(`deleted scene “${item.name}”`);
    else syncStudio();
  });
}

function registerPresets(ctx: HandlerContext) {
  const { io, socket, store, log, syncStudio } = ctx;

  socket.on("preset:save", async ({ id, name, elementIds }) => {
    if (
      !validLabel(id, 100) ||
      !validLabel(name, 60) ||
      !Array.isArray(elementIds) ||
      elementIds.length > 100
    )
      return;
    const elements = store.canvasState.elements.filter((element) =>
      elementIds.includes(element.id),
    );
    if (!elements.length) return;
    const preset = {
      id,
      name: name.trim(),
      elements: clone(elements),
      createdAt: new Date().toISOString(),
    };
    store.presets = upsert(store.presets, preset, MAX_PRESETS);
    await saveStudioData({ presets: store.presets });
    log(`saved preset “${name.trim()}”`);
  });

  socket.on("preset:load", ({ id }) => {
    const preset = store.presets.find((item) => item.id === id);
    if (!preset) return;
    checkpoint(store);
    log(`inserted preset “${preset.name}”`);
    const copies = copyPresetElements(preset.elements);
    store.canvasState.elements.push(...copies);
    copies.forEach((element) => io.emit("element:added", { element }));
    io.to("dashboard").emit("history:status", historyStatus(store));
  });

  socket.on("preset:delete", async ({ id }) => {
    store.presets = store.presets.filter((item) => item.id !== id);
    await saveStudioData({ presets: store.presets });
    syncStudio();
  });
}

function registerSounds(ctx: HandlerContext) {
  const { io, socket, store, syncStudio } = ctx;

  socket.on("sound:save", async (item) => {
    if (
      !validLabel(item?.id, 100) ||
      !validLabel(item?.name, 60) ||
      !validSoundUrl(item?.url) ||
      !Number.isFinite(item.volume) ||
      item.volume < 0 ||
      item.volume > 1
    )
      return;
    store.sounds = upsert(store.sounds, item, MAX_SOUNDS);
    await saveStudioData({ sounds: store.sounds });
    syncStudio();
  });

  socket.on("sound:delete", async ({ id }) => {
    store.sounds = store.sounds.filter((item) => item.id !== id);
    await saveStudioData({ sounds: store.sounds });
    syncStudio();
  });

  socket.on("sound:play", ({ id }) => {
    const item = store.sounds.find((sound) => sound.id === id);
    if (item) io.to("overlay").emit("sound:play", item);
  });

  socket.on("sound:stop", ({ id }) => {
    if (!validLabel(id, 100) || !store.sounds.some((sound) => sound.id === id)) return;
    io.to("overlay").emit("sound:stop", { id });
  });
}

function registerTriggers(ctx: HandlerContext) {
  const { socket, store, syncStudio } = ctx;

  socket.on("trigger:save", async (trigger) => {
    if (!validTrigger(trigger)) return;
    store.triggers = upsert(store.triggers, trigger, MAX_TRIGGERS);
    await saveStudioData({ triggers: store.triggers });
    syncStudio();
  });

  socket.on("trigger:delete", async ({ id }) => {
    store.triggers = store.triggers.filter((item) => item.id !== id);
    await saveStudioData({ triggers: store.triggers });
    syncStudio();
  });
}

export function registerStudio(ctx: HandlerContext) {
  registerScenes(ctx);
  registerPresets(ctx);
  registerSounds(ctx);
  registerTriggers(ctx);
}
