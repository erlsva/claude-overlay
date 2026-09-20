import assert from "node:assert/strict";
import test from "node:test";
import type { ChatEmoteSettings } from "../types.js";
import { validChatEmoteSettings } from "./validateSettings.js";

const settings: ChatEmoteSettings = {
  enabled: true,
  showNames: true,
  nameBackgroundEnabled: false,
  nameBackgroundColor: "#08080a",
  nameFontSize: 18,
  motion: "floor",
  direction: "left",
  gravity: 900,
  size: 40,
  speed: 180,
  lifetimeSeconds: 20,
  maxVisible: 10,
  blacklist: [],
  blockedEmotes: [],
  additionalEmotes: [],
};

test("accepts every movement mode, including both pop-in modes", () => {
  for (const motion of ["walls", "floor", "parade", "corners", "pop-walls", "pop-floor"] as const) {
    assert.equal(validChatEmoteSettings({ ...settings, motion }), true, motion);
  }
});

test("rejects an unknown movement mode", () => {
  assert.equal(validChatEmoteSettings({ ...settings, motion: "teleport" as never }), false);
});
