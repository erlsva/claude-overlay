import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  activeSoundDuration,
  atempoFilters,
  elevenErrorMessage,
  FINAL_SOUND_EFFECT_FILTER,
  FINAL_TTS_FILTER,
  MAX_AUTO_SPEECH_TEMPO,
  run,
  speechTempo,
} from "./audio.js";
import { parsePrompt } from "./shared/scene.js";
import { readWav } from "./dsp.js";

test("final TTS encoding normalizes loud input below the true-peak ceiling", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tts-limiter-test-"));
  try {
    const source = path.join(directory, "loud.wav");
    const encoded = path.join(directory, "limited.mp3");
    const decoded = path.join(directory, "limited.wav");
    await run([
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=sin(2*PI*440*t):s=44100:d=1",
      "-ar",
      "44100",
      "-ac",
      "1",
      source,
    ]);
    await run([
      "-i",
      source,
      "-af",
      FINAL_TTS_FILTER,
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "128k",
      encoded,
    ]);
    await run(["-i", encoded, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", decoded]);
    const samples = readWav(await readFile(decoded));
    const peak = samples.reduce((highest, sample) => Math.max(highest, Math.abs(sample)), 0);
    assert.ok(peak > 0.05, `expected audible output, got ${peak}`);
    assert.ok(peak < 0.9, `expected a limited peak, got ${peak}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("transient sounds reserve room for reverb inside the total duration", () => {
  const fart = parsePrompt("((dry loud fart;reverb;5s))").scenes[0];
  fart.soundDuration = 5;
  assert.equal(fart.effect, "reverb");
  assert.equal(activeSoundDuration(fart, false), 1.5);

  const rain = parsePrompt("((steady rain;reverb;10s))").scenes[0];
  rain.soundDuration = 10;
  assert.equal(activeSoundDuration(rain, false), 7);
});

test("automatic speech fitting is capped at a natural-sounding speed", () => {
  const cave = parsePrompt('((man in cave screaming and yelling: "ABOBA" over and over;10s))')
    .scenes[0];
  assert.equal(cave.effect, "reverb");
  assert.equal(cave.duration, 10);
  assert.equal(speechTempo(cave, 14), MAX_AUTO_SPEECH_TEMPO);
  assert.equal(speechTempo(cave, 17.8), MAX_AUTO_SPEECH_TEMPO);
  assert.equal(speechTempo({ ...cave, duration: null }, 17.8), 1);
  assert.deepEqual(atempoFilters(1.8), ["atempo=1.800000"]);
  assert.deepEqual(atempoFilters(0.8), ["atempo=0.800000"]);
  assert.deepEqual(atempoFilters(4.5), ["atempo=2", "atempo=2", "atempo=1.125000"]);
  assert.match(FINAL_SOUND_EFFECT_FILTER, /I=-18/);
  assert.match(FINAL_SOUND_EFFECT_FILTER, /TP=-3/);
});

test("ElevenLabs permission failures remain actionable without exposing credentials", async () => {
  const response = new Response(
    JSON.stringify({
      detail: {
        status: "missing_permissions",
        code: "unauthorized",
        message:
          "The API key you used is missing the permission text_to_speech to execute this operation.",
        request_id: "safe-request-id",
      },
    }),
    { status: 401 },
  );
  const message = await elevenErrorMessage(response);
  assert.match(message, /Text to Speech permission \(text_to_speech\)/);
  assert.match(message, /safe-request-id/);
  assert.doesNotMatch(message, /xi-api-key|secret/i);
});
