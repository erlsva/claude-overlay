import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { clipFileHandler } from "./file.js";
import type { TtsClip } from "./store.js";

const id = "0123456789abcdef0123456789abcdef";
const clip: TtsClip = {
  id,
  token: `(TTS:${id})`,
  prompt: "hello",
  sender: "someone",
  createdAt: new Date().toISOString(),
  duration: 3,
  discordMessageId: "message",
};
const audio = new Uint8Array([1, 2, 3, 4, 5]);

async function get(
  path: string,
  options: { fetchAudio?: typeof fetch; audioUrl?: () => Promise<string> } = {},
) {
  const app = express();
  app.get(
    "/tts/clips/:id/file",
    clipFileHandler({
      getClip: async (wanted) => (wanted === id ? clip : undefined),
      audioUrl: options.audioUrl ?? (async () => "https://cdn.discordapp.com/x.mp3"),
      fetchAudio:
        options.fetchAudio ??
        (async () => new Response(audio, { headers: { "content-length": String(audio.length) } })),
    }),
  );
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return { response, bytes: new Uint8Array(await response.arrayBuffer()) };
  } finally {
    server.close();
  }
}

test("a clip's audio is served inline for playback", async () => {
  const { response, bytes } = await get(`/tts/clips/${id}/file`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(response.headers.get("content-disposition"), `inline; filename="tts-01234567.mp3"`);
  assert.deepEqual([...bytes], [...audio]);
});

test("?download=1 sends it as a file download", async () => {
  const { response } = await get(`/tts/clips/${id}/file?download=1`);
  assert.equal(
    response.headers.get("content-disposition"),
    `attachment; filename="tts-01234567.mp3"`,
  );
});

test("a bad or unknown clip is refused before anything is fetched", async () => {
  let fetched = 0;
  const fetchAudio = (async () => {
    fetched++;
    return new Response(audio);
  }) as typeof fetch;
  assert.equal((await get("/tts/clips/not-an-id/file", { fetchAudio })).response.status, 400);
  assert.equal(
    (await get(`/tts/clips/${"f".repeat(32)}/file`, { fetchAudio })).response.status,
    404,
  );
  assert.equal(fetched, 0);
});

test("a store that fails or answers badly is a clear 502, never a broken download", async () => {
  const failing = { audioUrl: async () => Promise.reject(new Error("no attachment")) };
  assert.equal((await get(`/tts/clips/${id}/file`, failing)).response.status, 502);
  const notFound = (async () => new Response("nope", { status: 404 })) as typeof fetch;
  assert.equal((await get(`/tts/clips/${id}/file`, { fetchAudio: notFound })).response.status, 502);
  const huge = (async () =>
    new Response(audio, {
      headers: { "content-length": String(50 * 1024 * 1024) },
    })) as typeof fetch;
  assert.equal((await get(`/tts/clips/${id}/file`, { fetchAudio: huge })).response.status, 502);
});

test("a store that sends more than the limit with no size header is cut off", async () => {
  const oversized = (async () => new Response(new Uint8Array(26 * 1024 * 1024))) as typeof fetch;
  const app = express();
  app.get(
    "/tts/clips/:id/file",
    clipFileHandler({
      getClip: async () => clip,
      audioUrl: async () => "https://cdn.discordapp.com/x.mp3",
      fetchAudio: oversized,
    }),
  );
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    let received = 0;
    await assert.rejects(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/tts/clips/${id}/file`);
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>)
        received += chunk.length;
    });
    assert.ok(received < 26 * 1024 * 1024, "the whole oversized file was not sent");
  } finally {
    server.close();
  }
});
