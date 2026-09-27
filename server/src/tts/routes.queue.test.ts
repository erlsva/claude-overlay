import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";
import express from "express";
import { signToken } from "../auth/jwt.js";

const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-tts-routes-"));
process.env.DATA_DIR = DATA_DIR;
process.env.SESSION_SECRET = "tts-routes-test-secret";
process.env.OWNER_TWITCH_USERNAME = "boss";

const { saveClip } = await import("./store.js");
const { clearWaitingJobs, setTtsGapSeconds, setTtsHeld, setTtsPlaybackController } =
  await import("./service.js");
const { ttsRouter } = await import("./routes.js");
const { cleanTtsQueueSettings, initializeTtsQueueSettings } = await import("../db/index.js");

const id = "a".repeat(32);
await saveClip({
  id,
  token: `(TTS:${id})`,
  prompt: "a saved clip",
  sender: "saved",
  createdAt: new Date().toISOString(),
  duration: 1,
  discordMessageId: "message",
});

const session = signToken(
  { id: "boss", login: "boss", displayName: "boss", avatar: "", color: "#fff" },
  process.env.SESSION_SECRET,
);

async function withServer(run: (call: Call) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use("/tts", ttsRouter);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const call: Call = async (method, route, body, signedIn = true) => {
    const response = await fetch(`http://127.0.0.1:${port}/tts${route}`, {
      method,
      headers: {
        ...(signedIn ? { Authorization: `Bearer ${session}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: (await response.json().catch(() => ({}))) as any };
  };
  try {
    await run(call);
  } finally {
    setTtsHeld(false);
    setTtsGapSeconds(7);
    clearWaitingJobs();
    server.close();
  }
}
type Call = (
  method: string,
  route: string,
  body?: object,
  signedIn?: boolean,
) => Promise<{ status: number; body: any }>;

const saved = () => JSON.parse(readFileSync(path.join(DATA_DIR, "db.json"), "utf8")).ttsQueue;

test("pausing and resuming TTS is saved, and reported back", async () => {
  await withServer(async (call) => {
    const paused = await call("POST", "/playback", { action: "hold" });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.changed, true);
    assert.equal(paused.body.state.held, true);
    assert.deepEqual(saved(), { held: true, gapSeconds: 7, showEmote: true, showPrompt: true });
    assert.equal((await initializeTtsQueueSettings()).held, true, "a restart would find it paused");

    assert.equal((await call("POST", "/playback", { action: "hold" })).body.changed, false);
    const resumed = await call("POST", "/playback", { action: "release" });
    assert.equal(resumed.body.state.held, false);
    assert.equal(saved().held, false);
  });
});

test("showing or hiding the TTS icon is saved, and only a yes or no is accepted", async () => {
  await withServer(async (call) => {
    assert.equal((await call("GET", "/state")).body.playback.showEmote, true, "shown by default");

    const hidden = await call("POST", "/playback", { action: "emote", show: false });
    assert.equal(hidden.status, 200);
    assert.equal(hidden.body.changed, true);
    assert.equal(hidden.body.state.showEmote, false);
    assert.equal(saved().showEmote, false);
    assert.equal(
      (await initializeTtsQueueSettings()).showEmote,
      false,
      "a restart keeps it hidden",
    );
    assert.equal(
      (await call("POST", "/playback", { action: "emote", show: false })).body.changed,
      false,
    );

    for (const show of ["no", 0, null, undefined])
      assert.equal((await call("POST", "/playback", { action: "emote", show })).status, 400);
    assert.equal(saved().showEmote, false, "a refused value changes nothing");

    const shown = await call("POST", "/playback", { action: "emote", show: true });
    assert.equal(shown.body.state.showEmote, true);
    assert.equal(saved().showEmote, true);
  });
});

test("showing or hiding the prompt card is saved, and is separate from the icon", async () => {
  await withServer(async (call) => {
    const state = (await call("GET", "/state")).body.playback;
    assert.equal(state.showPrompt, true, "shown by default, as it always was");

    const hidden = await call("POST", "/playback", { action: "prompt", show: false });
    assert.equal(hidden.status, 200);
    assert.equal(hidden.body.changed, true);
    assert.equal(hidden.body.state.showPrompt, false);
    assert.equal(hidden.body.state.showEmote, true, "the icon is not affected");
    assert.equal(saved().showPrompt, false);
    assert.equal(saved().showEmote, true);
    assert.equal((await initializeTtsQueueSettings()).showPrompt, false, "kept over a restart");
    assert.equal(
      (await call("POST", "/playback", { action: "prompt", show: false })).body.changed,
      false,
    );

    for (const show of ["no", 0, null, undefined])
      assert.equal((await call("POST", "/playback", { action: "prompt", show })).status, 400);
    assert.equal(saved().showPrompt, false, "a refused value changes nothing");

    // Hiding the icon leaves the card alone, too.
    const iconOff = await call("POST", "/playback", { action: "emote", show: false });
    assert.equal(iconOff.body.state.showPrompt, false);
    await call("POST", "/playback", { action: "emote", show: true });
    const shown = await call("POST", "/playback", { action: "prompt", show: true });
    assert.equal(shown.body.state.showPrompt, true);
    assert.equal(saved().showPrompt, true);
  });
});

test("the silence between clips is saved, and only sensible values are accepted", async () => {
  await withServer(async (call) => {
    const set = await call("POST", "/playback", { action: "gap", seconds: 12 });
    assert.equal(set.status, 200);
    assert.equal(set.body.state.gapSeconds, 12);
    assert.equal(saved().gapSeconds, 12);
    for (const seconds of [31, -1, 1.5, "5", null])
      assert.equal((await call("POST", "/playback", { action: "gap", seconds })).status, 400);
    assert.equal(saved().gapSeconds, 12, "a refused value changes nothing");
    assert.equal((await call("POST", "/playback", { action: "explode" })).status, 400);
    assert.equal(
      (await call("POST", "/playback", { action: "enable", enabled: false })).status,
      400,
    );
  });
});

test("waiting requests appear in the queue, and can be played next, removed, or cleared", async () => {
  await withServer(async (call) => {
    await call("POST", "/playback", { action: "hold" });
    const make = () => call("POST", "/generate", { prompt: `(TTS:${id})`, play: true });
    const [one, two, three] = [await make(), await make(), await make()];
    assert.equal(one.status, 202, "requests are accepted while paused");
    await sleep(50);

    const state = await call("GET", "/state");
    assert.equal(state.body.playback.held, true);
    assert.equal(state.body.playback.waiting, 3);
    assert.equal(state.body.queue.length, 3);
    assert.deepEqual(Object.keys(state.body.queue[0]).includes("prompt"), true);

    const removed = await call("DELETE", `/jobs/${two.body.id}`);
    assert.equal(removed.status, 200);
    assert.equal((await call("DELETE", `/jobs/${two.body.id}`)).status, 409, "already gone");
    assert.equal((await call("DELETE", "/jobs/not-an-id")).status, 400);
    assert.equal((await call("GET", "/state")).body.queue.length, 2);

    const cleared = await call("POST", "/queue/clear");
    assert.equal(cleared.body.cleared, 2);
    assert.equal((await call("GET", "/state")).body.queue.length, 0);
    assert.equal(three.status, 202);
  });
});

test("Play next says so when nothing is waiting", async () => {
  await withServer(async (call) => {
    await call("POST", "/playback", { action: "hold" });
    const next = await call("POST", "/playback", { action: "next" });
    assert.equal(next.status, 200);
    assert.equal(next.body.changed, false);
  });
});

test("Play from start is a playback action, and says so when nothing is playing", async () => {
  await withServer(async (call) => {
    const nothing = await call("POST", "/playback", { action: "restart" });
    assert.equal(nothing.status, 200);
    assert.equal(nothing.body.changed, false);

    let restarted = 0;
    setTtsPlaybackController({
      state: () => ({ active: true, paused: true }),
      stop: () => false,
      pause: () => false,
      resume: () => false,
      restart: () => ++restarted > 0,
      setVolume: () => false,
    });
    try {
      const played = await call("POST", "/playback", { action: "restart" });
      assert.equal(played.body.changed, true);
      assert.equal(restarted, 1);
    } finally {
      setTtsPlaybackController({
        state: () => ({ active: false, paused: false }),
        stop: () => false,
        pause: () => false,
        resume: () => false,
        restart: () => false,
        setVolume: () => false,
      });
    }
  });
});

test("nobody signed out can touch the queue", async () => {
  await withServer(async (call) => {
    for (const [method, route, body] of [
      ["POST", "/playback", { action: "hold" }],
      ["POST", "/queue/clear", undefined],
      ["DELETE", `/jobs/${crypto.randomUUID()}`, undefined],
      ["POST", "/stop", undefined],
      ["POST", "/playback", { action: "restart" }],
    ] as const)
      assert.equal((await call(method, route, body, false)).status, 401, `${method} ${route}`);
  });
});

test("saved settings are cleaned up when they are read back", () => {
  assert.deepEqual(
    cleanTtsQueueSettings({ held: true, gapSeconds: 12, showEmote: false, showPrompt: false }),
    { held: true, gapSeconds: 12, showEmote: false, showPrompt: false },
  );
  assert.deepEqual(
    cleanTtsQueueSettings({ held: "yes", gapSeconds: 999, showEmote: "no", showPrompt: 0 }),
    // Only an explicit false hides the icon or the card.
    { held: false, gapSeconds: 7, showEmote: true, showPrompt: true },
  );
  for (const odd of [undefined, null, "paused", 5, [], { gapSeconds: -3 }])
    assert.deepEqual(
      cleanTtsQueueSettings(odd),
      { held: false, gapSeconds: 7, showEmote: true, showPrompt: true },
      String(odd),
    );
});
