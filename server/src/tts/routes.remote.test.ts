import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { signToken } from "../auth/jwt.js";

const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-tts-remote-"));
process.env.DATA_DIR = DATA_DIR;
process.env.SESSION_SECRET = "tts-remote-test-secret";
process.env.OWNER_TWITCH_USERNAME = "boss";

const { addToWhitelist, setAdmin } = await import("../db/index.js");
const { setTtsHeld, setTtsPlaybackController } = await import("./service.js");
const { ttsRouter } = await import("./routes.js");

const ownerSession = signToken(
  { id: "boss", login: "boss", displayName: "boss", avatar: "", color: "#fff" },
  process.env.SESSION_SECRET,
);
// A signed-in dashboard user who is not an owner or admin: whitelisted, but plain.
await addToWhitelist("viewer", "boss");
await setAdmin("viewer", false);
const viewerSession = signToken(
  { id: "viewer", login: "viewer", displayName: "viewer", avatar: "", color: "#fff" },
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
    setTtsHeld(false);
    server.close();
  }
}

/** A stand-in overlay playback controller: enough for pause/resume/restart/skip/volume to have something to act on. */
function stubController(initial: { active?: boolean; paused?: boolean; volume?: number } = {}) {
  const state = {
    active: !!initial.active,
    paused: !!initial.paused,
    volume: initial.volume ?? 0.25,
  };
  setTtsPlaybackController({
    state: () => ({ active: state.active, paused: state.paused }),
    stop: () => {
      if (!state.active) return false;
      state.active = false;
      return true;
    },
    pause: () => {
      if (!state.active || state.paused) return false;
      state.paused = true;
      return true;
    },
    resume: () => {
      if (!state.active || !state.paused) return false;
      state.paused = false;
      return true;
    },
    restart: () => {
      if (!state.active) return false;
      state.paused = false;
      return true;
    },
    setVolume: (volume) => {
      if (state.volume === volume) return false;
      state.volume = volume;
      return true;
    },
  });
  return state;
}

test("only an owner or admin can create, list, or revoke remote tokens", async () => {
  await withServer(async (call) => {
    assert.equal((await call("GET", "/remote-tokens")).status, 401, "nobody signed in");
    assert.equal(
      (await call("GET", "/remote-tokens", undefined, viewerSession)).status,
      403,
      "signed in, but not admin",
    );
    const created = await call("POST", "/remote-tokens", { name: "Deck" }, ownerSession);
    assert.equal(created.status, 201);
    assert.match(created.body.token, /^vkremote\./);
    assert.equal(created.body.name, "Deck");
    assert.equal(created.body.secretHash, undefined, "never sent to the dashboard");

    const list = await call("GET", "/remote-tokens", undefined, ownerSession);
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.map((t: { id: string }) => t.id),
      [created.body.id],
    );
    assert.equal(
      list.body[0].token,
      undefined,
      "the raw token is shown once, at creation, never again",
    );

    assert.equal(
      (await call("DELETE", `/remote-tokens/${created.body.id}`, undefined, viewerSession)).status,
      403,
    );
    const revoked = await call(
      "DELETE",
      `/remote-tokens/${created.body.id}`,
      undefined,
      ownerSession,
    );
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.revoked, true);
    assert.equal((await call("GET", "/remote-tokens", undefined, ownerSession)).body.length, 0);
  });
});

test("creating a token needs a name", async () => {
  await withServer(async (call) => {
    for (const name of ["", "   ", "x".repeat(61)])
      assert.equal((await call("POST", "/remote-tokens", { name }, ownerSession)).status, 400);
  });
});

test("the remote control needs a valid token, not a dashboard session", async () => {
  await withServer(async (call) => {
    assert.equal((await call("POST", "/remote", { action: "status" })).status, 401, "no token");
    assert.equal(
      (await call("POST", "/remote", { action: "status" }, "vkremote.made.up")).status,
      401,
      "unknown token",
    );
    assert.equal(
      (await call("POST", "/remote", { action: "status" }, ownerSession)).status,
      401,
      "a dashboard session is not a remote token",
    );
    const created = await call("POST", "/remote-tokens", { name: "Deck" }, ownerSession);
    const revoked = await call(
      "DELETE",
      `/remote-tokens/${created.body.id}`,
      undefined,
      ownerSession,
    );
    assert.equal(revoked.body.revoked, true);
    assert.equal(
      (await call("POST", "/remote", { action: "status" }, created.body.token)).status,
      401,
      "revoked",
    );
  });
});

test("Pause TTS / Resume TTS / Toggle TTS over the remote behave like the dashboard's, and are saved", async () => {
  await withServer(async (call) => {
    const created = await call("POST", "/remote-tokens", { name: "Deck" }, ownerSession);
    const token = created.body.token;

    const paused = await call("POST", "/remote", { action: "pause-tts" }, token);
    assert.equal(paused.status, 200);
    assert.equal(paused.body.changed, true);
    assert.equal(paused.body.held, true);
    assert.equal(paused.body.ok, true);
    assert.equal(paused.body.action, "pause-tts");

    assert.equal(
      (await call("POST", "/remote", { action: "pause-tts" }, token)).body.changed,
      false,
    );

    const toggled = await call("POST", "/remote", { action: "toggle-tts" }, token);
    assert.equal(toggled.body.held, false, "toggle flips it");

    const resumed = await call("POST", "/remote", { action: "resume-tts" }, token);
    assert.equal(resumed.body.changed, false, "already resumed by the toggle");

    // Survives as if it were set from the dashboard.
    const { initializeTtsQueueSettings } = await import("../db/index.js");
    await call("POST", "/remote", { action: "pause-tts" }, token);
    assert.equal((await initializeTtsQueueSettings()).held, true);
  });
});

test("the clip and queue actions over the remote reach the same playback controller", async () => {
  await withServer(async (call) => {
    const created = await call("POST", "/remote-tokens", { name: "Deck" }, ownerSession);
    const token = created.body.token;
    const controller = stubController({ active: true });

    const paused = await call("POST", "/remote", { action: "pause-clip" }, token);
    assert.equal(paused.body.changed, true);
    assert.equal(paused.body.paused, true);
    assert.equal(controller.paused, true);

    const toggled = await call("POST", "/remote", { action: "toggle-clip" }, token);
    assert.equal(toggled.body.paused, false, "toggle-clip resumed it, since it was paused");

    const restarted = await call("POST", "/remote", { action: "restart" }, token);
    assert.equal(restarted.body.changed, true);

    const skipped = await call("POST", "/remote", { action: "skip" }, token);
    assert.equal(skipped.body.changed, true);
    assert.equal(skipped.body.active, false);
    assert.equal((await call("POST", "/remote", { action: "skip" }, token)).body.changed, false);

    assert.equal((await call("POST", "/remote", { action: "play-next" }, token)).status, 200);
  });
});

test("volume actions over the remote step and clamp, and need a value from 0 to 1", async () => {
  await withServer(async (call) => {
    const created = await call("POST", "/remote-tokens", { name: "Deck" }, ownerSession);
    const token = created.body.token;
    stubController();

    const set = await call("POST", "/remote", { action: "volume", value: 0.5 }, token);
    assert.equal(set.body.volume, 0.5);

    assert.equal((await call("POST", "/remote", { action: "volume" }, token)).status, 400);
    assert.equal(
      (await call("POST", "/remote", { action: "volume", value: 2 }, token)).status,
      400,
    );

    const up = await call("POST", "/remote", { action: "volume-up" }, token);
    assert.equal(up.body.volume, 0.6, "exact, not 0.6000000000000001");
    for (let i = 0; i < 20; i++) await call("POST", "/remote", { action: "volume-down" }, token);
    const down = await call("POST", "/remote", { action: "volume-down" }, token);
    assert.equal(down.body.volume, 0, "clamped, never below 0");
  });
});

test("status reads the state without changing anything", async () => {
  await withServer(async (call) => {
    const created = await call("POST", "/remote-tokens", { name: "Deck" }, ownerSession);
    const token = created.body.token;
    const before = await call("POST", "/remote", { action: "status" }, token);
    assert.equal(before.body.changed, false);
    assert.equal(typeof before.body.held, "boolean");
    assert.equal(typeof before.body.waiting, "number");
  });
});
