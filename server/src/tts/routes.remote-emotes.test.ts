import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { signToken } from "../auth/jwt.js";

// A separate file (and so, under node:test's default per-file process, a separate rate-limit
// budget) from routes.remote.test.ts, which already spends most of its own 60-requests-a-minute
// limit on TTS actions.
const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-tts-remote-emotes-"));
process.env.DATA_DIR = DATA_DIR;
process.env.SESSION_SECRET = "tts-remote-emotes-test-secret";
process.env.OWNER_TWITCH_USERNAME = "boss";

const { saveFeatureFlags } = await import("../db/index.js");
const { canvasStore } = await import("../state/canvasStore.js");
const { ttsRouter } = await import("./routes.js");

const ownerSession = signToken(
  { id: "boss", login: "boss", displayName: "boss", avatar: "", color: "#fff" },
  process.env.SESSION_SECRET,
);

type Call = (
  method: string,
  route: string,
  body?: unknown,
  auth?: string,
) => Promise<{ status: number; body: any }>;

async function withServer(run: (call: Call) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use("/tts", ttsRouter);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const call: Call = async (method, route, body, auth) => {
    const response = await fetch(`http://127.0.0.1:${port}/tts${route}`, {
      method,
      headers: {
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: (await response.json().catch(() => ({}))) as any };
  };
  try {
    await run(call);
  } finally {
    server.close();
  }
}

async function newToken(call: Call) {
  return (await call("POST", "/remote-tokens", { name: "Deck" }, ownerSession)).body
    .token as string;
}

test.beforeEach(async () => {
  canvasStore.chatEmoteSettings = {
    ...canvasStore.chatEmoteSettings,
    enabled: false,
    direction: "left",
    size: 40,
    motion: "floor",
  };
  await saveFeatureFlags({ tts: true, scenes: false, publicClips: false });
});

test("chat emote actions over the remote turn the overlay on/off, flip direction, and are in the response", async () => {
  await withServer(async (call) => {
    const token = await newToken(call);

    const on = await call("POST", "/remote", { action: "emotes-on" }, token);
    assert.equal(on.body.changed, true);
    assert.equal(on.body.emotes.enabled, true);
    assert.equal(canvasStore.chatEmoteSettings.enabled, true);

    assert.equal(
      (await call("POST", "/remote", { action: "emotes-on" }, token)).body.changed,
      false,
    );

    const toggled = await call("POST", "/remote", { action: "toggle-emote-direction" }, token);
    assert.equal(toggled.body.emotes.direction, "right");
    assert.equal(
      (await call("POST", "/remote", { action: "toggle-emote-direction" }, token)).body.emotes
        .direction,
      "left",
    );

    const off = await call("POST", "/remote", { action: "emotes-off" }, token);
    assert.equal(off.body.changed, true);
    assert.equal(off.body.emotes.enabled, false);
  });
});

test("emote size and style actions over the remote step within their limits", async () => {
  await withServer(async (call) => {
    const token = await newToken(call);
    canvasStore.chatEmoteSettings.size = 24;

    const up = await call("POST", "/remote", { action: "emote-size-up" }, token);
    assert.equal(up.body.changed, true);
    assert.ok(up.body.emotes.size > 24);

    const style = await call("POST", "/remote", { action: "emote-style-next" }, token);
    assert.equal(style.body.changed, true);
    assert.notEqual(style.body.emotes.motion, "floor");

    const back = await call("POST", "/remote", { action: "emote-style-previous" }, token);
    assert.equal(back.body.emotes.motion, "floor");
  });
});

test("a remote action shows up in the dashboard's own Activity feed, named after the token", async () => {
  await withServer(async (call) => {
    canvasStore.activity = [];
    const token = await newToken(call);
    await call("POST", "/remote", { action: "toggle-emotes" }, token);
    assert.equal(canvasStore.activity.length, 1);
    assert.equal(canvasStore.activity[0].user, "Deck");
    assert.equal(canvasStore.activity[0].action, "turned the chat emote overlay on");

    // "status" is a pure read: nothing worth showing happened.
    await call("POST", "/remote", { action: "status" }, token);
    assert.equal(canvasStore.activity.length, 1, "status did not add a second entry");
  });
});

test("chat emote actions work over the remote even while TTS itself is switched off", async () => {
  await saveFeatureFlags({ tts: false, scenes: false, publicClips: false });
  await withServer(async (call) => {
    const token = await newToken(call);
    const result = await call("POST", "/remote", { action: "toggle-emotes" }, token);
    assert.equal(result.status, 200);
    assert.equal(result.body.changed, true);
    // A TTS action, on the same token, over the same endpoint, is still refused.
    const ttsAction = await call("POST", "/remote", { action: "toggle-tts" }, token);
    assert.equal(ttsAction.status, 503);
  });
});

test("status (and polling) includes the chat emote overlay's state alongside TTS's", async () => {
  await withServer(async (call) => {
    const token = await newToken(call);
    canvasStore.chatEmoteSettings.enabled = true;
    canvasStore.chatEmoteSettings.direction = "right";
    canvasStore.chatEmoteSettings.size = 62;
    canvasStore.chatEmoteSettings.motion = "rain";

    for (const result of [
      await call("POST", "/remote", { action: "status" }, token),
      await call("GET", "/remote", undefined, token),
    ]) {
      assert.deepEqual(result.body.emotes, {
        enabled: true,
        direction: "right",
        size: 62,
        motion: "rain",
      });
      assert.equal(typeof result.body.held, "boolean", "TTS fields are still there too");
    }
  });
});
