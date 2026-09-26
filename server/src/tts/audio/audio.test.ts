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
import { soundDecodeFilter } from "../sound.js";
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

test("speed runs from half to double on a spoken line, keeping every word", async () => {
  const line = "This line is exactly forty-eight characters long"; // 48 characters, 3s of demo speech
  const seconds = async (rate: string) =>
    (await renderDemo(`((man says "${line}"${rate}))`)).length / RATE;
  const normal = await seconds("");
  assert.ok(Math.abs((await seconds(";speed=0.5x")) / normal - 2) < 0.1, "half speed doubles it");
  assert.ok(Math.abs((await seconds(";speed=2x")) / normal - 0.5) < 0.1, "double speed halves it");
  assert.ok(Math.abs((await seconds(";speed=1.5x")) / normal - 1 / 1.5) < 0.1);
});

test("a sound effect can be slowed or sped up too, and still lands on its written duration", async () => {
  const half = await renderDemo("((rumbling thunder;speed=0.5x;4s))");
  assertClean(half, 1);
  assert.ok(
    Math.abs(half.length / RATE - 4) < 0.15,
    `half speed still ends at 4s, got ${(half.length / RATE).toFixed(2)}s`,
  );
  const double = await renderDemo("((rumbling thunder;speed=2x;4s))");
  assert.ok(Math.abs(double.length / RATE - 4) < 0.15, `got ${(double.length / RATE).toFixed(2)}s`);

  // With no duration the clip itself gets longer or shorter, which is what a speed change means.
  const normal = (await renderDemo("((rumbling thunder))")).length;
  const slower = (await renderDemo("((rumbling thunder;speed=0.5x))")).length;
  const faster = (await renderDemo("((rumbling thunder;speed=2x))")).length;
  assert.ok(Math.abs(slower / normal - 2) < 0.1, "half speed doubles the clip");
  assert.ok(Math.abs(faster / normal - 0.5) < 0.1, "double speed halves the clip");
});

test("a sound speed asks the sound model for the length that ends at the written duration", () => {
  const [scene] = parsePrompt("((rumbling thunder;speed=0.5x;6s))").scenes;
  const [plain] = parsePrompt("((rumbling thunder;6s))").scenes;
  assert.equal(activeSoundDuration(scene, false), activeSoundDuration(plain, false) * 0.5);
  const [fast] = parsePrompt("((rumbling thunder;speed=2x;6s))").scenes;
  assert.equal(activeSoundDuration(fast, false), activeSoundDuration(plain, false) * 2);
  // The model cannot make more than 30 seconds.
  const [long] = parsePrompt("((rumbling thunder;speed=2x;25s))").scenes;
  assert.equal(activeSoundDuration(long, false), 30);
  // Speech in the scene owns the speed; its background sound is left alone.
  const [mixed] = parsePrompt('((man says "Hi" while thunder rumbles;speed=0.5x;6s))').scenes;
  assert.equal(
    activeSoundDuration(mixed, true),
    activeSoundDuration({ ...mixed, speechRate: undefined }, true),
  );
});

test("a sound's speed change keeps its pitch", () => {
  assert.match(soundDecodeFilter("thunder", { speed: 0.5 }), /atempo=0\.500000/);
  assert.match(soundDecodeFilter("thunder", { speed: 1.5 }), /atempo=1\.500000/);
  assert.doesNotMatch(soundDecodeFilter("thunder", { speed: 0.5 }), /asetrate/);
  assert.doesNotMatch(soundDecodeFilter("thunder"), /atempo/);
});
