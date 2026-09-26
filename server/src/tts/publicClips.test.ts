import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";

process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-public-clips-"));

const { saveClip } = await import("./store.js");
const { saveFeatureFlags } = await import("../db/index.js");
const { publicClipsRouter, toPublicClip } = await import("./publicClips.js");

const clip = (n: number, prompt: string, extra: Record<string, unknown> = {}) => {
  const id = n.toString(16).padStart(32, "0");
  return {
    id,
    token: `(TTS:${id})`,
    prompt,
    sender: `Viewer${n}`,
    createdAt: new Date(2026, 8, n).toISOString(),
    duration: 3 + n,
    discordMessageId: `message-${n}`,
    ...extra,
  };
};

async function get(query = "") {
  const app = express();
  app.use("/tts/public", publicClipsRouter);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/tts/public/clips${query}`);
    return { status: response.status, body: (await response.json()) as any };
  } finally {
    server.close();
  }
}

test("the public clip list is off until the owner switches it on", async () => {
  await saveFeatureFlags({ tts: true, scenes: false, publicClips: false });
  const off = await get();
  assert.equal(off.status, 503);
  assert.equal(off.body.disabled, true);
  // Switching TTS itself off closes it too.
  await saveFeatureFlags({ tts: false, scenes: false, publicClips: true });
  assert.equal((await get()).status, 503);
});

test("it lists clips newest first and never shows who asked or where the audio is kept", async () => {
  await saveClip(clip(1, "the oldest one"));
  await saveClip(clip(2, "a pirate says arr"));
  await saveClip(clip(3, "the newest one"));
  await saveFeatureFlags({ tts: true, scenes: false, publicClips: true });

  const { status, body } = await get();
  assert.equal(status, 200);
  assert.equal(body.total, 3);
  assert.deepEqual(
    body.clips.map((item: { prompt: string }) => item.prompt),
    ["the newest one", "a pirate says arr", "the oldest one"],
  );
  assert.deepEqual(Object.keys(body.clips[0]).sort(), [
    "createdAt",
    "duration",
    "id",
    "prompt",
    "token",
  ]);
  assert.doesNotMatch(JSON.stringify(body), /Viewer\d|message-\d|discord/i);
  assert.equal(body.clips[0].token, `(TTS:${body.clips[0].id})`);
});

test("it can be searched by words or by a pasted token, and paged", async () => {
  const pirate = await get("?q=PIRATE");
  assert.deepEqual(
    pirate.body.clips.map((item: { prompt: string }) => item.prompt),
    ["a pirate says arr"],
  );
  assert.equal(pirate.body.total, 1);

  const id = clip(1, "").id;
  for (const pasted of [`(TTS:${id})`, `TTS:${id}`, id])
    assert.deepEqual(
      (await get(`?q=${encodeURIComponent(pasted)}`)).body.clips.map(
        (item: { id: string }) => item.id,
      ),
      [id],
      pasted,
    );
  assert.equal((await get("?q=nothing-like-this")).body.total, 0);

  const page = await get("?limit=2&offset=2");
  assert.equal(page.body.clips.length, 1);
  assert.equal(page.body.total, 3, "the total counts every match, not just this page");
});

test("a very long prompt is shortened and odd searches are refused", async () => {
  assert.equal(toPublicClip(clip(9, "x".repeat(2000))).prompt.length, 600);
  assert.ok(toPublicClip(clip(9, "x".repeat(2000))).prompt.endsWith("…"));
  assert.equal(toPublicClip(clip(9, "short")).prompt, "short");
  assert.equal((await get("?limit=500")).status, 400);
  assert.equal((await get("?offset=-1")).status, 400);
  assert.equal((await get(`?q=${"a".repeat(200)}`)).status, 400);
  assert.equal((await get("?q=a&q=b")).status, 400);
});
