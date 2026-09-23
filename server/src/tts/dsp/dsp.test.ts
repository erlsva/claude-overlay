import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderAudio } from "../audio/index.js";
import {
  channelBandpass,
  channelFilter,
  characterPitch,
  effectTail,
  finalWordTiming,
  pitchTempoRatio,
  RATE,
  resampleRatio,
  reverseSamples,
  robotize,
  submerge,
  walkieClick,
} from "./index.js";
import { parsePrompt } from "../scene/index.js";

/** A single-bin DFT (Goertzel): how strongly `samples` contains `hz`, for testing without ears. */
function magnitudeAt(samples: Float32Array, hz: number, rate = RATE): number {
  const k = Math.round((samples.length * hz) / rate);
  const w = (2 * Math.PI * k) / samples.length;
  const coeff = 2 * Math.cos(w);
  let q1 = 0,
    q2 = 0;
  for (const sample of samples) {
    const q0 = coeff * q1 - q2 + sample;
    q2 = q1;
    q1 = q0;
  }
  const real = q1 - q2 * Math.cos(w);
  const imag = q2 * Math.sin(w);
  return Math.sqrt(real * real + imag * imag) / (samples.length / 2);
}

function sine(hz: number, seconds: number, amplitude = 0.4, rate = RATE): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

test("TTS echo repeats only the final word within the total scene duration", () => {
  const dry = new Float32Array(RATE * 2);
  dry[Math.round(0.2 * RATE)] = 0.4;
  dry[Math.round(1.8 * RATE)] = 0.5;
  const scene = parsePrompt('((man echo: "Hello there";8s))').scenes[0];
  const output = effectTail(dry, scene, { start: 1.7, end: 2 });

  assert.equal(output.length, 8 * RATE);
  assert.deepEqual(output.slice(0, 2 * RATE), dry);
  assert.ok(output.slice(7 * RATE).some((sample) => Math.abs(sample) > 0.000001));
  assert.throws(() => effectTail(dry, scene, null), /timing/);
});

test("TTS room reverb surrounds the phrase and decays after it", () => {
  const dry = new Float32Array(RATE * 2);
  dry[Math.round(0.2 * RATE)] = 0.5;
  dry[Math.round(1.8 * RATE)] = 0.5;
  const output = effectTail(dry, parsePrompt('((man says "Hello there" in cave;8s))').scenes[0], {
    start: 1.7,
    end: 2,
  });

  assert.equal(output.length, 8 * RATE);
  assert.ok(
    output.slice(Math.round(2.2 * RATE), 3 * RATE).some((sample) => Math.abs(sample) > 0.000001),
  );
});

test("sound-only reverb remains audible after a transient source ends", () => {
  const dry = new Float32Array(Math.round(RATE * 1.5));
  for (let index = 0; index < dry.length; index++) dry[index] = Math.sin(index * 0.17) * 0.35;
  const scene = parsePrompt("((dry loud fart;reverb;5s))").scenes[0];
  const output = effectTail(dry, scene, null);

  assert.equal(output.length, 5 * RATE);
  assert.ok(output.slice(3 * RATE, 4 * RATE).some((sample) => Math.abs(sample) > 0.00001));
});

test("explicit durations add up to the authored total instead of extra tails", () => {
  const prompt =
    '((man saying "again" over and over;reverb;15s)) ((dry loud fart;reverb;5s)) ((man saying "again" over and over;reverb;15s)) ((dry loud fart;reverb;5s))';
  const scenes = parsePrompt(prompt).scenes;
  const speech = new Float32Array(RATE * 4);
  const sound = new Float32Array(RATE);
  const durations = scenes.map(
    (scene) =>
      effectTail(
        scene.dialogue ? speech.slice() : sound.slice(),
        scene,
        scene.dialogue ? { start: 3.5, end: 4 } : null,
      ).length / RATE,
  );

  assert.deepEqual(durations, [15, 5, 15, 5]);
  assert.equal(
    durations.reduce((total, seconds) => total + seconds, 0),
    40,
  );
});

test("effects without an authored duration retain an automatic tail", () => {
  const dry = new Float32Array(RATE * 2);
  const scene = parsePrompt('((man echo: "Hello there"))').scenes[0];
  assert.equal(effectTail(dry, scene, { start: 1.7, end: 2 }).length, 4 * RATE);
});

test("giant troll roles receive a deterministic deep character treatment", () => {
  const scene = parsePrompt(
    '((giant troll in cave shouts "I CANT HOLD IT IN! AAAHH!" with reverb;11s))',
  ).scenes[0];
  assert.equal(scene.effect, "reverb");
  assert.equal(characterPitch(scene), 0.72);
  assert.match(channelFilter(scene), /asetrate=31752/);
  assert.match(channelFilter(scene), /atempo=1\.388889/);
});

test("billable speech that overruns a scene is preserved with a warning", () => {
  const dry = new Float32Array(Math.round(RATE * 10.8));
  const scene = parsePrompt('((man saying "This takes longer";reverb;10s))').scenes[0];
  let warning: { natural: number; requested: number } | undefined;
  const output = effectTail(dry, scene, { start: 10.2, end: 10.8 }, (natural, requested) => {
    warning = { natural, requested };
  });

  assert.equal(output.length, dry.length);
  assert.deepEqual(warning, { natural: 10.8, requested: 10 });
});

test("minor speech overrun is preserved without a noisy warning", () => {
  const dry = new Float32Array(Math.round(RATE * 10.3));
  const scene = parsePrompt('((man saying "This is nearly exact";10s))').scenes[0];
  let warned = false;
  const output = effectTail(dry, scene, { start: 9.8, end: 10.3 }, () => {
    warned = true;
  });

  assert.equal(output.length, dry.length);
  assert.equal(warned, false);
});

test("room reverb remains active when natural speech has no decay time left", () => {
  const dry = new Float32Array(RATE * 2);
  dry[0] = 0.8;
  const scene = parsePrompt('((man says "ABOBA" in a cave;1s))').scenes[0];
  const rendered = effectTail(dry, scene, { start: 0, end: 2 });

  assert.equal(rendered.length, dry.length);
  assert.ok(rendered.some((sample, index) => index > RATE * 0.04 && Math.abs(sample) > 0.0001));
});

test("expressive waveform beyond provider alignment is retained and effects fade to silence", () => {
  const dry = new Float32Array(RATE * 3);
  for (let index = Math.round(RATE * 2.6); index <= Math.round(RATE * 2.7); index++)
    dry[index] = 0.7;
  const scene = parsePrompt('((man yells "ABOBA" in a cave;5s))').scenes[0];
  const rendered = effectTail(dry, scene, { start: 0.2, end: 2 });

  assert.ok(Math.abs(rendered[Math.round(RATE * 2.66)]) > 0.1);
  assert.ok(Math.abs(rendered.at(-1) ?? 1) < 0.000001);
});

test("ElevenLabs alignment isolates the final spoken word", () => {
  assert.deepEqual(
    finalWordTiming({
      characters: ["H", "i", " ", "a", "l", "l", "!"],
      character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
      character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
    }),
    { start: 0.3, end: 0.6 },
  );
});

test("resampleRatio moves pitch and length together, like a tape at the wrong speed", () => {
  const input = sine(440, 1);
  const faster = resampleRatio(input, 1.5);
  const slower = resampleRatio(input, 0.7);
  // Length: fewer samples to play faster, more to play slower.
  assert.ok(Math.abs(faster.length - input.length / 1.5) <= 1);
  assert.ok(Math.abs(slower.length - input.length / 0.7) <= 1);
  // Pitch: read back at the same rate, the shorter clip now sounds like 440*1.5 = 660 Hz.
  assert.ok(magnitudeAt(faster, 660) > magnitudeAt(faster, 440) * 3, "chipmunk pitches up");
  assert.ok(magnitudeAt(slower, 308) > magnitudeAt(slower, 440) * 3, "slowmo pitches down");
  // ratio 1 (or invalid) is a no-op, never a copy that silently breaks identity checks upstream.
  assert.equal(resampleRatio(input, 1), input);
  assert.equal(resampleRatio(input, 0), input);
});

test("pitchTempoRatio only fires for chipmunk and slowmo", () => {
  assert.equal(pitchTempoRatio("chipmunk"), 1.55);
  assert.equal(pitchTempoRatio("slowmo"), 0.68);
  assert.equal(pitchTempoRatio("robot"), undefined);
  assert.equal(pitchTempoRatio(undefined), undefined);
});

test("robotize adds real ring-modulation sidebands, not just distortion", () => {
  const input = sine(1000, 0.5, 0.3);
  const robot = robotize(input, 1);
  assert.equal(robot.length, input.length);
  // A 45 Hz carrier ring-modulated onto 1000 Hz puts new energy at 1000±45 Hz that a plain
  // tone never has.
  assert.ok(magnitudeAt(input, 955) < 0.01 && magnitudeAt(input, 1045) < 0.01);
  assert.ok(magnitudeAt(robot, 955) > 0.02);
  assert.ok(magnitudeAt(robot, 1045) > 0.02);
  // amount 0 leaves the voice alone.
  assert.equal(robotize(input, 0), input);
});

test("submerge cuts high frequencies far more than low ones, and drifts the pitch a little", () => {
  const mixed = new Float32Array(RATE);
  const low = sine(250, 1, 0.3);
  const high = sine(5000, 1, 0.3);
  for (let i = 0; i < mixed.length; i++) mixed[i] = low[i] + high[i];
  const wet = submerge(mixed, 1);
  const lowBefore = magnitudeAt(mixed, 250),
    highBefore = magnitudeAt(mixed, 5000);
  const lowAfter = magnitudeAt(wet, 250),
    highAfter = magnitudeAt(wet, 5000);
  assert.ok(highAfter / highBefore < 0.15, "the high tone is heavily cut");
  assert.ok(lowAfter / lowBefore > 0.6, "the low tone mostly survives");
  assert.equal(submerge(mixed, 0), mixed);
});

test("reverseSamples plays a scene, including its tail, end to end", () => {
  const input = Float32Array.from([0, 0.1, 0.2, 0.3, 0.4]);
  assert.deepEqual(reverseSamples(input), Float32Array.from([0.4, 0.3, 0.2, 0.1, 0]));
  assert.deepEqual(input, Float32Array.from([0, 0.1, 0.2, 0.3, 0.4]), "the input is not mutated");
});

test("a walkie-talkie click is short, bounded, and different rising vs. falling", () => {
  for (const click of [walkieClick(true), walkieClick(false)]) {
    assert.ok(click.length > 0 && click.length < RATE * 0.2);
    assert.ok(click.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1));
  }
  assert.notDeepEqual(walkieClick(true), walkieClick(false));
  // Deterministic: the same click every time, not dependent on Math.random.
  assert.deepEqual(walkieClick(true), walkieClick(true));
});

test("each transmission channel narrows the band, and clean adds nothing", () => {
  assert.deepEqual(channelBandpass("clean"), []);
  assert.deepEqual(channelBandpass(undefined), []);
  for (const channel of ["intercom", "walkie", "tincan", "radio"] as const) {
    const filters = channelBandpass(channel).join(",");
    assert.match(filters, /highpass=f=\d+/, channel);
    assert.match(filters, /lowpass=f=\d+/, channel);
  }
});

test("custom pause scenes render locally without a provider request", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "overlay-tts-pause-"));
  try {
    await mkdir(path.join(dataDir, "clips"));
    const duration = await renderAudio({
      id: "pause",
      scenes: parsePrompt("((silence;2.5s))").scenes,
      mode: "elevenlabs",
      key: "unused",
      voices: {},
      dataDir,
      progress: () => {},
    });
    assert.equal(duration, 2.5);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
