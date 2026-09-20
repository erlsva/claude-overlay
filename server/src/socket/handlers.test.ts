import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { CanvasElement, DrawStroke } from "../types.js";

// The store and settings write to disk, so point them at a throwaway folder before importing.
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-handlers-"));
process.env.PUBLIC_SERVER_URL = "http://localhost:3001";
const { registerSocketHandlers } = await import("./handlers.js");
const { canvasStore } = await import("../state/canvasStore.js");
const { saveFeatureFlags } = await import("../db/index.js");

type Args = unknown[];
type Handler = (...args: any[]) => unknown;

const user = {
  id: "u1",
  login: "tester",
  displayName: "Tester",
  avatar: "",
  color: "#fff",
  role: "moderator",
};
let socketCounter = 0;

/** A socket and server that record everything sent, so a handler can be driven directly. */
function connect(options: { mode?: string; user?: unknown } = {}) {
  const handlers = new Map<string, Handler>();
  const sent = {
    socket: [] as Args[],
    io: [] as Args[],
    rooms: [] as Array<[string, ...Args]>,
    broadcast: [] as Args[],
  };
  const io = {
    emit: (...args: Args) => sent.io.push(args),
    to: (room: string) => ({ emit: (...args: Args) => sent.rooms.push([room, ...args]) }),
  };
  const joined: string[] = [];
  const socket = {
    id: `socket-${++socketCounter}`,
    data: { jwtUser: "user" in options ? options.user : user },
    handshake: { query: { mode: options.mode } },
    join: (room: string) => joined.push(room),
    emit: (...args: Args) => sent.socket.push(args),
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    broadcast: { emit: (...args: Args) => sent.broadcast.push(args) },
    volatile: {
      broadcast: { emit: (...args: Args) => sent.broadcast.push(["volatile", ...args]) },
    },
    to: () => ({ volatile: { emit: (...args: Args) => sent.broadcast.push(["cursor", ...args]) } }),
  };
  const activeUsers = new Map();
  const activeOverlays = new Set<string>();
  const ended = { media: [] as string[], sound: [] as Array<[string, string | undefined]> };
  registerSocketHandlers(
    io as any,
    socket as any,
    canvasStore,
    activeUsers,
    activeOverlays,
    (id) => ended.media.push(id),
    (playbackId, error) => ended.sound.push([playbackId, error]),
  );
  const fire = async (event: string, payload?: unknown) => handlers.get(event)?.(payload);
  const emitted = (name: string) =>
    [...sent.io, ...sent.rooms.map(([, ...rest]) => rest)].filter((a) => a[0] === name);
  return { handlers, sent, joined, socket, fire, emitted, activeUsers, activeOverlays, ended };
}

const element = (overrides: Partial<CanvasElement> = {}): CanvasElement => ({
  id: "el-1",
  type: "image",
  src: "https://example.test/a.png",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  visible: true,
  zIndex: 1,
  ...overrides,
});
const stroke = (id = "s1"): DrawStroke => ({
  id,
  points: [
    [0, 0],
    [5, 5],
  ],
  color: "#ffffff",
  size: 4,
  eraser: false,
});

function reset() {
  Object.assign(canvasStore, {
    canvasState: { elements: [] },
    drawStrokes: [],
    scenes: [],
    presets: [],
    sounds: [],
    triggers: [],
    activity: [],
    undoStack: [],
    redoStack: [],
  });
}

test.beforeEach(reset);

test("an overlay is counted, receives state, and gets no editing listeners", () => {
  const c = connect({ mode: "overlay", user: undefined });
  assert.deepEqual(c.joined, ["overlay"]);
  assert.equal(c.activeOverlays.size, 1);
  assert.ok(c.sent.socket.some(([name]) => name === "state:sync"));
  assert.ok(
    c
      .emitted("overlay:status")
      .some(([, payload]: any) => payload.connected && payload.count === 1),
  );
  assert.ok(c.handlers.has("media:ended"));
  assert.ok(!c.handlers.has("element:add"), "public renderers never get mutation listeners");
  assert.ok(!c.handlers.has("draw:stroke"));
});

test("the dashboard preview (mirror) is never counted as an overlay or able to acknowledge media", () => {
  const c = connect({ mode: "mirror", user: undefined });
  assert.deepEqual(c.joined, ["overlay"]);
  assert.equal(c.activeOverlays.size, 0);
  assert.ok(!c.handlers.has("media:ended"));
  assert.ok(!c.handlers.has("sound:ended"));
});

test("an overlay disconnecting updates the overlay status", async () => {
  const c = connect({ mode: "overlay", user: undefined });
  await c.fire("disconnect");
  assert.equal(c.activeOverlays.size, 0);
  const statuses = c.emitted("overlay:status") as any[];
  assert.equal(statuses.at(-1)[1].connected, false);
});

test("a dashboard user joins the dashboard room, gets studio state, and is listed as present", () => {
  const c = connect();
  assert.deepEqual(c.joined, ["dashboard"]);
  const names = c.sent.socket.map(([name]) => name);
  for (const expected of [
    "state:sync",
    "draw:sync",
    "studio:sync",
    "history:status",
    "users:list",
    "chat:channel",
  ])
    assert.ok(names.includes(expected), `missing ${expected}`);
  assert.equal(c.activeUsers.size, 1);
  assert.ok(c.sent.broadcast.some(([name]) => name === "user:joined"));
  assert.ok(c.handlers.has("element:add"));
});

test("a dashboard user leaving announces it when their last tab closes", async () => {
  const c = connect();
  await c.fire("disconnect");
  assert.equal(c.activeUsers.size, 0);
  assert.ok(c.emitted("user:left").length === 1);
});

test("cursor movement is forwarded, and rejected when not finite", async () => {
  const c = connect();
  await c.fire("cursor:move", { x: 1, y: 2 });
  await c.fire("cursor:move", { x: NaN, y: 2 });
  assert.equal(c.sent.broadcast.filter(([name]) => name === "cursor").length, 1);
});

test("elements can be added once, and invalid or duplicate ones are ignored", async () => {
  const c = connect();
  await c.fire("element:add", { element: element() });
  await c.fire("element:add", { element: element() });
  await c.fire("element:add", { element: element({ id: "bad", width: -1 }) });
  assert.equal(canvasStore.canvasState.elements.length, 1);
  assert.equal(c.emitted("element:added").length, 1);
  assert.equal(canvasStore.activity[0].action, "added image");
  assert.equal(canvasStore.activity[0].user, "Tester");
});

test("element updates apply, and a locked element refuses movement", async () => {
  const c = connect();
  await c.fire("element:add", { element: element() });
  await c.fire("element:update", { id: "el-1", changes: { x: 300 } });
  assert.equal(canvasStore.canvasState.elements[0].x, 300);
  await c.fire("element:update", { id: "el-1", changes: { locked: true } });
  await c.fire("element:update", { id: "el-1", changes: { x: 999 } });
  assert.equal(canvasStore.canvasState.elements[0].x, 300, "locked elements cannot move");
  await c.fire("element:update", { id: "el-1", changes: { opacity: 0.5 } });
  assert.equal(
    canvasStore.canvasState.elements[0].opacity,
    0.5,
    "non-movement changes still apply",
  );
  await c.fire("element:update", { id: "el-1", changes: { nonsense: 1 } });
  await c.fire("element:update", { id: "missing", changes: { x: 1 } });
});

test("effect and fly start times are stamped by the server", async () => {
  const c = connect();
  await c.fire("element:add", { element: element() });
  const before = Date.now();
  await c.fire("element:update", {
    id: "el-1",
    changes: { effectAnimation: "pop", effectStartedAt: 1 },
  });
  assert.ok((canvasStore.canvasState.elements[0].effectStartedAt ?? 0) >= before);
});

test("removing an element skips locked ones and dissolves a group left with one member", async () => {
  const c = connect();
  await c.fire("element:add", { element: element({ id: "a", groupId: "g", groupName: "Group" }) });
  await c.fire("element:add", { element: element({ id: "b", groupId: "g", groupName: "Group" }) });
  await c.fire("element:add", { element: element({ id: "locked", locked: true }) });
  await c.fire("element:remove", { id: "locked" });
  assert.equal(canvasStore.canvasState.elements.length, 3);
  await c.fire("element:remove", { id: "a" });
  const left = canvasStore.canvasState.elements.find((item) => item.id === "b")!;
  assert.equal(left.groupId, undefined);
  assert.ok(
    c
      .emitted("element:updated")
      .some(([, payload]: any) => payload.id === "b" && payload.changes.groupId === null),
  );
});

test("undo and redo restore the canvas and tell everyone", async () => {
  const c = connect();
  await c.fire("element:add", { element: element() });
  assert.equal(c.emitted("history:status").length > 0, true);
  await c.fire("history:undo");
  assert.equal(canvasStore.canvasState.elements.length, 0);
  assert.ok(c.emitted("state:sync").length >= 1);
  await c.fire("history:redo");
  assert.equal(canvasStore.canvasState.elements.length, 1);
  await c.fire("history:redo");
  assert.equal(canvasStore.canvasState.elements.length, 1, "nothing more to redo");
});

test("drawing strokes are stored once, broadcast to others, and can be cleared", async () => {
  const c = connect();
  await c.fire("draw:stroke", stroke());
  await c.fire("draw:stroke", stroke());
  await c.fire("draw:stroke", { ...stroke("bad"), size: 9999 });
  assert.equal(canvasStore.drawStrokes.length, 1);
  assert.ok(c.sent.broadcast.some(([name]) => name === "draw:stroke"));
  await c.fire("draw:clear");
  assert.equal(canvasStore.drawStrokes.length, 0);
  assert.ok(c.sent.broadcast.some(([name]) => name === "draw:clear"));
});

test("live strokes are validated and tagged with the sender", async () => {
  const c = connect();
  await c.fire("draw:live", { points: [[1, 2]], color: "#fff", size: 3, eraser: false });
  await c.fire("draw:live", { points: "nope", color: "#fff", size: 3, eraser: false });
  const live = c.sent.broadcast.filter(([name]) => name === "volatile");
  assert.equal(live.length, 1);
  assert.equal((live[0][2] as any).userId, "u1");
});

test("media control is relayed to others only when valid", async () => {
  const c = connect();
  await c.fire("media:control", { id: "x", action: "play", currentTime: 0 });
  await c.fire("media:control", { id: "x", action: "explode", currentTime: 0 });
  assert.equal(c.sent.broadcast.filter(([name]) => name === "media:control").length, 1);
});

test("the audio test needs a connected overlay", async () => {
  const c = connect();
  await c.fire("overlay:test-audio", { testId: "t1" });
  assert.deepEqual(c.sent.socket.at(-1), [
    "overlay:test-result",
    { testId: "t1", ok: false, error: "No overlay is connected." },
  ]);
  c.activeOverlays.add("some-overlay");
  await c.fire("overlay:test-audio", { testId: "t2" });
  assert.ok(
    c.sent.rooms.some(
      ([room, name, payload]) =>
        room === "overlay" && name === "overlay:test-audio" && (payload as any).testId === "t2",
    ),
  );
});

test("an overlay reports media, sound and test results back", async () => {
  const c = connect({ mode: "overlay", user: undefined });
  canvasStore.canvasState.elements.push(
    element({ id: "vid", type: "video", autoVisibility: true }),
  );
  canvasStore.canvasState.elements.push(
    element({ id: "manual", type: "video", autoVisibility: false }),
  );
  await c.fire("media:ended", { id: "vid" });
  await c.fire("media:ended", { id: "manual" });
  await c.fire("media:ended", { id: "nope" });
  assert.deepEqual(c.ended.media, ["vid"]);
  await c.fire("sound:ended", { playbackId: "p1" });
  await c.fire("sound:ended", { playbackId: "p2", error: "boom" });
  await c.fire("sound:ended", { playbackId: "p3", error: "x".repeat(400) });
  assert.deepEqual(c.ended.sound, [
    ["p1", undefined],
    ["p2", "boom"],
  ]);
  await c.fire("overlay:test-result", { testId: "t", ok: true });
  assert.ok(
    c.sent.rooms.some(([room, name]) => room === "dashboard" && name === "overlay:test-result"),
  );
});

test("DVD settings are validated before they are stored and shared", async () => {
  const c = connect();
  await c.fire("dvd:settings", { volume: 2, soundUrl: null, counterPosition: "top-left" });
  assert.equal(canvasStore.dvdCelebrationSettings.volume, 0.25);
  await c.fire("dvd:settings", { volume: 0.5, soundUrl: null, counterPosition: "top-left" });
  assert.equal(canvasStore.dvdCelebrationSettings.volume, 0.5);
  assert.equal(c.emitted("dvd:settings").length, 1);
});

const goodEmoteSettings = () => ({
  ...canvasStore.chatEmoteSettings,
  enabled: true,
  blacklist: ["spammer"],
  additionalEmotes: [],
  blockedEmotes: [],
});

test("chat emote settings are validated, stored and shared", async () => {
  const c = connect();
  await c.fire("chat-emote:settings", { ...goodEmoteSettings(), size: 5 });
  assert.equal(canvasStore.chatEmoteSettings.enabled, false);
  await c.fire("chat-emote:settings", { ...goodEmoteSettings(), blacklist: ["bad name!"] });
  assert.equal(canvasStore.chatEmoteSettings.enabled, false);
  await c.fire("chat-emote:settings", goodEmoteSettings());
  assert.equal(canvasStore.chatEmoteSettings.enabled, true);
  assert.deepEqual(canvasStore.chatEmoteSettings.blacklist, ["spammer"]);
  assert.equal(c.emitted("chat-emote:settings").length, 1);
});

test("scenes need the scenes feature, then save, load and delete", async () => {
  const c = connect();
  await saveFeatureFlags({ tts: true, scenes: false });
  await c.fire("scene:save", { id: "sc1", name: "Scene" });
  assert.equal(canvasStore.scenes.length, 0, "feature off");
  await saveFeatureFlags({ tts: true, scenes: true });
  await c.fire("element:add", { element: element() });
  await c.fire("scene:save", { id: "sc1", name: "  Scene one  " });
  assert.equal(canvasStore.scenes.length, 1);
  assert.equal(canvasStore.scenes[0].name, "Scene one");
  canvasStore.canvasState.elements = [];
  await c.fire("scene:load", { id: "sc1" });
  assert.equal(canvasStore.canvasState.elements.length, 1);
  assert.ok(c.emitted("state:sync").length >= 1);
  await c.fire("scene:save", { id: "", name: "x" });
  assert.equal(canvasStore.scenes.length, 1, "invalid ids are refused");
  await c.fire("scene:delete", { id: "sc1" });
  assert.equal(canvasStore.scenes.length, 0);
  await saveFeatureFlags({ tts: true, scenes: false });
});

test("presets save the chosen elements and insert offset copies with fresh ids", async () => {
  const c = connect();
  await c.fire("element:add", { element: element({ id: "a", groupId: "g" }) });
  await c.fire("element:add", { element: element({ id: "b", groupId: "g" }) });
  await c.fire("preset:save", { id: "p1", name: "Preset", elementIds: ["a", "b"] });
  await c.fire("preset:save", { id: "p2", name: "Empty", elementIds: ["nope"] });
  assert.equal(canvasStore.presets.length, 1);
  await c.fire("preset:load", { id: "p1" });
  const copies = canvasStore.canvasState.elements.slice(2);
  assert.equal(copies.length, 2);
  assert.ok(
    copies.every((copy) => copy.id !== "a" && copy.id !== "b" && copy.x === 42 && copy.y === 52),
  );
  assert.equal(copies[0].groupId, copies[1].groupId, "grouped copies stay grouped");
  assert.notEqual(copies[0].groupId, "g");
  await c.fire("preset:delete", { id: "p1" });
  assert.equal(canvasStore.presets.length, 0);
});

test("sounds accept only this server's uploads and MyInstants clips", async () => {
  const c = connect();
  const sound = (url: string, overrides = {}) => ({
    id: `s-${url.length}`,
    name: "Clip",
    url,
    volume: 0.5,
    ...overrides,
  });
  await c.fire("sound:save", sound("http://localhost:3001/files/clip.mp3"));
  await c.fire("sound:save", sound("https://www.myinstants.com/media/sounds/airhorn.mp3"));
  await c.fire("sound:save", sound("https://evil.example/files/clip.mp3"));
  await c.fire("sound:save", sound("http://localhost:3001/elsewhere/clip.mp3"));
  await c.fire("sound:save", sound("http://localhost:3001/files/loud.mp3", { volume: 3 }));
  assert.equal(canvasStore.sounds.length, 2);
  await c.fire("sound:play", { id: canvasStore.sounds[0].id });
  assert.ok(c.sent.rooms.some(([room, name]) => room === "overlay" && name === "sound:play"));
  await c.fire("sound:stop", { id: canvasStore.sounds[0].id });
  assert.ok(c.sent.rooms.some(([room, name]) => room === "overlay" && name === "sound:stop"));
  await c.fire("sound:delete", { id: canvasStore.sounds[0].id });
  assert.equal(canvasStore.sounds.length, 1);
});

const trigger = (overrides = {}) => ({
  id: "t1",
  name: "Follow alert",
  enabled: true,
  event: "follow",
  cooldownSeconds: 0,
  action: "show-element",
  targetId: "el-1",
  ...overrides,
});

test("triggers are validated: events, steps and limits", async () => {
  const c = connect();
  await c.fire("trigger:save", trigger());
  await c.fire("trigger:save", trigger({ id: "t2", event: "prediction" }));
  assert.equal(canvasStore.triggers.length, 2);
  await c.fire("trigger:save", trigger({ id: "bad1", event: "nonsense" }));
  await c.fire("trigger:save", trigger({ id: "bad2", cooldownSeconds: -1 }));
  await c.fire("trigger:save", trigger({ id: "bad3", extra: true }));
  await c.fire("trigger:save", trigger({ id: "bad4", action: "tts", targetId: undefined }));
  await c.fire(
    "trigger:save",
    trigger({ id: "bad5", steps: [{ action: "hide-element", targetId: "x" }] }),
  );
  assert.equal(canvasStore.triggers.length, 2);
  const steps = [
    { action: "show-element", targetId: "el-1" },
    { action: "send-chat", chatMessage: "Thanks {user}!" },
  ];
  await c.fire("trigger:save", trigger({ id: "t3", steps }));
  assert.equal(canvasStore.triggers.length, 3);
  await c.fire("trigger:delete", { id: "t3" });
  assert.equal(canvasStore.triggers.length, 2);
});
