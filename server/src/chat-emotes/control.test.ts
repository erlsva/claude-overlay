import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";

process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-emote-control-"));

const { canvasStore } = await import("../state/canvasStore.js");
const {
  CHAT_EMOTE_SIZE_STEP,
  chatEmoteRemoteState,
  setChatEmoteEnabled,
  setChatEmoteSettings,
  stepChatEmoteMotion,
  stepChatEmoteSize,
  toggleChatEmoteDirection,
} = await import("./control.js");
const { getChatEmoteSettings } = await import("../db/index.js");
const { CHAT_EMOTE_MOTIONS } = await import("../types.js");

/** A fake io that only records what was broadcast, like the socket handler tests use. */
function fakeIo() {
  const emitted: unknown[] = [];
  return { io: { emit: (...args: unknown[]) => emitted.push(args) } as any, emitted };
}

test.beforeEach(() => {
  canvasStore.chatEmoteSettings = {
    enabled: false,
    showNames: true,
    nameBackgroundEnabled: true,
    nameBackgroundColor: "#08080a",
    nameFontSize: 12,
    motion: "floor",
    direction: "left",
    gravity: 900,
    size: 40,
    speed: 180,
    lifetimeSeconds: 12,
    maxVisible: 20,
    blacklist: [],
    additionalEmotes: [],
    blockedEmotes: [],
  };
});

test("setChatEmoteEnabled turns it on, off, or flips it, and says whether that changed anything", () => {
  const { io, emitted } = fakeIo();
  assert.equal(setChatEmoteEnabled(io, true), true);
  assert.equal(canvasStore.chatEmoteSettings.enabled, true);
  assert.equal(setChatEmoteEnabled(io, true), false, "already on");
  assert.equal(setChatEmoteEnabled(io), true, "flip, with no argument");
  assert.equal(canvasStore.chatEmoteSettings.enabled, false);
  assert.equal(emitted.length, 2, "one broadcast per real change, none for the no-op");
});

test("toggleChatEmoteDirection flips left and right", () => {
  const { io } = fakeIo();
  assert.equal(canvasStore.chatEmoteSettings.direction, "left");
  assert.equal(toggleChatEmoteDirection(io), true);
  assert.equal(canvasStore.chatEmoteSettings.direction, "right");
  assert.equal(toggleChatEmoteDirection(io), true);
  assert.equal(canvasStore.chatEmoteSettings.direction, "left");
});

test("stepChatEmoteSize steps within 24-100 and stops at either end", () => {
  const { io } = fakeIo();
  canvasStore.chatEmoteSettings.size = 24;
  assert.equal(stepChatEmoteSize(io, -CHAT_EMOTE_SIZE_STEP), false, "already at the minimum");
  assert.equal(stepChatEmoteSize(io, CHAT_EMOTE_SIZE_STEP), true);
  assert.equal(canvasStore.chatEmoteSettings.size, 24 + CHAT_EMOTE_SIZE_STEP);
  canvasStore.chatEmoteSettings.size = 100;
  assert.equal(stepChatEmoteSize(io, CHAT_EMOTE_SIZE_STEP), false, "already at the maximum");
  assert.equal(canvasStore.chatEmoteSettings.size, 100, "clamped, not pushed past it");
});

test("stepChatEmoteMotion cycles through every style, forward and back, and wraps around", () => {
  const { io } = fakeIo();
  canvasStore.chatEmoteSettings.motion = CHAT_EMOTE_MOTIONS[CHAT_EMOTE_MOTIONS.length - 1];
  assert.equal(stepChatEmoteMotion(io, 1), true, "wraps forward from the last to the first");
  assert.equal(canvasStore.chatEmoteSettings.motion, CHAT_EMOTE_MOTIONS[0]);
  assert.equal(stepChatEmoteMotion(io, -1), true, "wraps back from the first to the last");
  assert.equal(
    canvasStore.chatEmoteSettings.motion,
    CHAT_EMOTE_MOTIONS[CHAT_EMOTE_MOTIONS.length - 1],
  );
});

test("chatEmoteRemoteState shows only the fields a remote button would use", () => {
  canvasStore.chatEmoteSettings.enabled = true;
  canvasStore.chatEmoteSettings.direction = "right";
  canvasStore.chatEmoteSettings.size = 55;
  canvasStore.chatEmoteSettings.motion = "fireworks";
  assert.deepEqual(chatEmoteRemoteState(), {
    enabled: true,
    direction: "right",
    size: 55,
    motion: "fireworks",
  });
});

test("setChatEmoteSettings refuses an invalid object, and keeps the field-mutators' changes saved", async () => {
  const { io } = fakeIo();
  assert.equal(
    setChatEmoteSettings(io, { ...canvasStore.chatEmoteSettings, size: 5 } as any),
    false,
  );
  assert.equal(canvasStore.chatEmoteSettings.size, 40, "the invalid change never applied");

  setChatEmoteEnabled(io, true);
  await sleep(500); // past the save debounce
  assert.equal(getChatEmoteSettings()?.enabled, true, "a field-mutator's change is saved too");
});
