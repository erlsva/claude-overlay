import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-emotes-"));
const { io } = await import("../runtime.js");
const { canvasStore } = await import("../state/canvasStore.js");
const { spawnChatEmotes } = await import("./emotes.js");

const spawned: any[] = [];
(io as any).to = (room: string) => ({
  emit: (event: string, payload: any) => {
    if (event === "chat-emote:spawn") spawned.push({ room, ...payload });
  },
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
let counter = 0;
const emote = (name: string, position: number) => ({
  id: `id-${name}`,
  name,
  imageUrl: `https://cdn.example/${name}.png`,
  position,
});
/** A chat message from a fresh chatter (each has its own cooldown) containing native emotes. */
const message = (native: ReturnType<typeof emote>[], extra: Record<string, unknown> = {}) => ({
  chatter_user_login: `viewer${++counter}`,
  chatter_user_name: `Viewer${counter}`,
  chatter_color: "#ff0000",
  native_emotes: native,
  message: { text: "hi" },
  ...extra,
});

test.beforeEach(() => {
  spawned.length = 0;
  canvasStore.chatEmoteSettings = {
    ...canvasStore.chatEmoteSettings,
    enabled: true,
    blacklist: [],
    additionalEmotes: [],
    blockedEmotes: [],
    lifetimeSeconds: 2,
  };
});

test("the first emote of a message falls onto the overlay with its sender", async () => {
  spawnChatEmotes(message([emote("Kappa", 0)]));
  await tick();
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].room, "overlay");
  assert.equal(spawned[0].name, "Kappa");
  assert.equal(spawned[0].sender, `Viewer${counter}`);
  assert.equal(spawned[0].senderLogin, `viewer${counter}`);
  assert.equal(spawned[0].senderColor, "#ff0000");
});

test("nothing happens when emotes are switched off, or the message has none", async () => {
  canvasStore.chatEmoteSettings.enabled = false;
  spawnChatEmotes(message([emote("Kappa", 0)]));
  canvasStore.chatEmoteSettings.enabled = true;
  spawnChatEmotes(message([]));
  await tick();
  assert.equal(spawned.length, 0);
});

test("a blacklisted chatter's emotes are ignored", async () => {
  canvasStore.chatEmoteSettings.blacklist = ["spammer"];
  spawnChatEmotes(message([emote("Kappa", 0)], { chatter_user_login: "Spammer" }));
  await tick();
  assert.equal(spawned.length, 0);
});

test("a chatter cannot flood: their next emote waits for the first to expire", async () => {
  const chatter = { chatter_user_login: "flooder", chatter_user_name: "Flooder" };
  spawnChatEmotes(message([emote("Kappa", 0)], chatter));
  spawnChatEmotes(message([emote("Kappa", 0)], chatter));
  await tick();
  assert.equal(spawned.length, 1);
});

test("blocked emotes never appear", async () => {
  canvasStore.chatEmoteSettings.blockedEmotes = ["nope"];
  spawnChatEmotes(message([emote("NOPE", 0)]));
  await tick();
  assert.equal(spawned.length, 0);
});

test("only the first emote spawns unless later ones are on the allow list", async () => {
  canvasStore.chatEmoteSettings.additionalEmotes = ["Pog"];
  spawnChatEmotes(message([emote("Kappa", 0), emote("Pog", 6), emote("LUL", 10)]));
  await tick();
  assert.equal(spawned[0].name, "Kappa");
  assert.deepEqual(
    spawned[0].additional.map((item: any) => item.name),
    ["Pog"],
  );
});
