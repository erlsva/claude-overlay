import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  activeSoundDuration,
  atempoFilters,
  elevenErrorMessage,
  FINAL_SOUND_EFFECT_FILTER,
  FINAL_TTS_FILTER,
  MAX_AUTO_SPEECH_TEMPO,
  renderAudio,
  run,
  speechTempo,
} from "./index.js";
import { parsePrompt } from "../scene/index.js";
import { readWav, RATE } from "../dsp/index.js";

/** Renders one prompt in credit-free demo mode and returns the finished clip's samples. */
async function renderDemo(prompt: string) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "overlay-tts-novelty-"));
  try {
    await mkdir(path.join(dataDir, "clips"));
    const { scenes } = parsePrompt(prompt);
    const id = "clip";
    await renderAudio({
      id,
      scenes,
      mode: "demo",
      key: "unused",
      voices: {},
      dataDir,
      progress: () => {},
    });
    return readWav(await readFile(path.join(dataDir, "clips", `${id}.wav`)));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

function assertClean(samples: Float32Array, minSeconds = 0.3) {
  assert.ok(samples.length >= minSeconds * RATE, `expected at least ${minSeconds}s of audio`);
  let peak = 0,
    audible = false;
  for (const sample of samples) {
    assert.ok(Number.isFinite(sample), "no NaN/Infinity in the rendered audio");
    peak = Math.max(peak, Math.abs(sample));
    if (Math.abs(sample) > 0.01) audible = true;
  }
  assert.ok(audible, "the clip is not silent");
  assert.ok(peak <= 0.99, `expected no clipping, got a peak of ${peak}`);
}

test("every new voice effect renders end to end without credits, cleanly and never past its requested duration", async () => {
  for (const prompt of [
    '((chipmunk voice says "This is a test line";4s))',
    '((slow motion voice says "This is a test line";5s))',
    '((robot voice says "This is a test line";4s))',
    '((voice played backwards says "This is a test line";4s))',
    '((underwater voice says "This is a test line";4s))',
  ]) {
    const samples = await renderDemo(prompt);
    assertClean(samples);
    const expected = Number(prompt.match(/;(\d+)s/)![1]);
    // No room/echo is requested, so a duration longer than the line takes to say
    // is not padded with silence - only an actual overrun is still honored.
    assert.ok(
      samples.length / RATE <= expected + 0.05,
      `${prompt}: expected at most ~${expected}s, got ${(samples.length / RATE).toFixed(2)}s`,
    );
  }
});

test("a plain duration with no room or echo is not padded with trailing silence", async () => {
  // The demo tone for a short line is well under a second; asking for far longer
  // than that, with no effect to fill the gap, should play at its natural length.
  const samples = await renderDemo('((man says "Hi there";10s))');
  assertClean(samples);
  assert.ok(
    samples.length / RATE < 2,
    `expected the natural (short) length, got ${(samples.length / RATE).toFixed(2)}s of a requested 10s`,
  );
});

test("every new transmission channel renders end to end, for both speech and a sound effect", async () => {
  for (const channelPrompt of [
    '((man over a walkie-talkie says "This is a test line";4s))',
    '((man through a tin can says "This is a test line";4s))',
    '((man on an old radio says "This is a test line";4s))',
  ]) {
    assertClean(await renderDemo(channelPrompt));
  }
  // scene.channel now reaches sound effects too, not only speech.
  assertClean(await renderDemo("((a gunshot over a walkie-talkie;3s))"), 0.2);
});

test("chipmunk and slowmo still fit an explicit duration, same as ordinary speech does", async () => {
  // Chipmunk itself already shortens the line (~1.55x), so the dialogue has to be
  // long enough that it still overruns 3s afterward, and by less than the 1.25x
  // compression cap, so it is genuinely sped up to fit rather than kept in full.
  const samples = await renderDemo(`((chipmunk voice says "${"word ".repeat(17).trim()}";3s))`);
  assert.ok(
    Math.abs(samples.length / RATE - 3) < 0.1,
    `expected ~3s, got ${(samples.length / RATE).toFixed(2)}s`,
  );
});

test("voice effects and a transmission channel combine in one scene without crashing", async () => {
  assertClean(
    await renderDemo('((robot voice over a walkie-talkie says "This is a test line";4s))'),
  );
});

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
