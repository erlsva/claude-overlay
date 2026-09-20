import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  activeSoundDuration,
  renderAudio,
  run,
  SOUND_ONLY_TARGET_LUFS,
  SPEECH_TARGET_LUFS,
} from "./audio/index.js";
import {
  channelFilter,
  characterPitch,
  effectTail,
  muffle,
  screamTone,
  integratedLoudness,
  layerUnderSpeech,
  normalizeLoudness,
  RATE,
  readWav,
  roomProfile,
  softLimit,
  tameSpikes,
  writeWav,
} from "./dsp/index.js";
import {
  buildSoundPrompt,
  enrichSoundPrompt,
  sanitizeSoundPrompt,
  screamLayerPrompt,
  soundDecodeFilter,
} from "./sound.js";
import { detectEffect, detectMuffled, detectRoom, isExtreme, parsePrompt } from "./shared/scene.js";
import { speechRequest } from "./casting.js";
import { stripRoomPhrases } from "./sound.js";
import type { Scene } from "./shared/scene.js";

const tone = (frequency: number, seconds: number, amplitude: number) => {
  const samples = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < samples.length; i++)
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / RATE);
  return samples;
};
const scene = (overrides: Partial<Scene> = {}): Scene => ({
  dialogue: "x",
  sound: "",
  voice: "voice1",
  duration: null,
  effect: "none",
  backgroundVolume: 0.22,
  ...overrides,
});

test("loudness follows BS.1770: 6 dB per doubling, and silence is silent", () => {
  const quiet = integratedLoudness(tone(1000, 3, 0.05));
  const loud = integratedLoudness(tone(1000, 3, 0.1));
  assert.ok(Math.abs(loud - quiet - 6.02) < 0.05, `expected +6 LU, got ${loud - quiet}`);
  // A full-scale 1 kHz sine is about -3 LUFS for one channel.
  assert.ok(Math.abs(integratedLoudness(tone(1000, 3, 1)) - -3.0) < 1.0);
  assert.equal(integratedLoudness(new Float32Array(RATE)), -Infinity);
  assert.equal(integratedLoudness(new Float32Array(0)), -Infinity);
});

test("a clip shorter than one measurement block is still measured", () => {
  assert.ok(Number.isFinite(integratedLoudness(tone(1000, 0.2, 0.2))));
});

test("normalizing lands on the target regardless of the starting level", () => {
  for (const amplitude of [0.02, 0.1, 0.4]) {
    const result = normalizeLoudness(tone(700, 3, amplitude), -20);
    assert.ok(
      Math.abs(integratedLoudness(result) - -20) < 0.3,
      `amplitude ${amplitude} gave ${integratedLoudness(result)}`,
    );
  }
  const silence = new Float32Array(RATE);
  assert.equal(normalizeLoudness(silence, -20), silence);
});

test("a dense loud effect and quiet speech end up balanced instead of the effect dominating", () => {
  // Same peak, very different loudness: sparse speech-like bursts versus a constant shriek.
  const speech = new Float32Array(RATE * 3);
  speech.set(tone(300, 0.5, 0.9), RATE * 0.5);
  speech.set(tone(300, 0.5, 0.9), RATE * 2);
  const shriek = tone(2500, 3, 0.9);
  assert.ok(
    integratedLoudness(shriek) - integratedLoudness(speech) > 2,
    "the raw effect should measure louder at the same peak",
  );
  const balancedSpeech = integratedLoudness(normalizeLoudness(speech, SPEECH_TARGET_LUFS));
  const balancedEffect = integratedLoudness(normalizeLoudness(shriek, SOUND_ONLY_TARGET_LUFS));
  assert.ok(Math.abs(balancedSpeech - SPEECH_TARGET_LUFS) < 0.5);
  assert.ok(Math.abs(balancedEffect - SOUND_ONLY_TARGET_LUFS) < 0.5);
  assert.ok(
    SPEECH_TARGET_LUFS - SOUND_ONLY_TARGET_LUFS >= 4,
    "standalone effects sit below speech",
  );
});

test("the soft limiter keeps peaks below the ceiling without flattening quiet audio", () => {
  const limited = softLimit(Float32Array.from([0.3, -0.5, 1.5, -3, 0.69]));
  assert.deepEqual([...limited.slice(0, 2)], [Math.fround(0.3), Math.fround(-0.5)]);
  assert.ok(limited.every((sample) => Math.abs(sample) <= 0.97));
  assert.ok(limited[2] > 0.9 && limited[3] < -0.9);
});

test("sound prompts lose durations, rooms and harsh wording the user did not write", () => {
  const messy =
    "varied frantic fox screams with high-pitched, intense tones ramping up for 10 seconds, overlapping and echoing nature calls";
  const clean = sanitizeSoundPrompt(messy, "foxes screaming;10 seconds");
  assert.doesNotMatch(clean, /high-pitched|seconds|echo|10/i);
  assert.match(clean, /fox screams/);
  assert.match(clean, /overlapping/);
  assert.equal(sanitizeSoundPrompt("thunder in a cave with reverb", ""), "thunder");
  assert.equal(
    sanitizeSoundPrompt("one colossal wet fart through a large cathedral space", ""),
    "one colossal wet fart",
  );
  assert.equal(sanitizeSoundPrompt("a deep boom inside a vast stone cavern", ""), "a deep boom");
  assert.match(sanitizeSoundPrompt("a shrill whistle", "a shrill whistle"), /shrill/);
  assert.doesNotMatch(sanitizeSoundPrompt("a shrill whistle", "a whistle"), /shrill/);
});

test("animals get a species note that steers the model away from the wrong sound", () => {
  const prompt = buildSoundPrompt("several foxes screaming");
  assert.match(prompt, /red foxes/);
  assert.match(prompt, /raspy, hoarse/);
  assert.match(prompt, /mammals/);
  assert.match(prompt, /no echo or reverberation/);
  assert.doesNotMatch(prompt, /eagle|hawk/i);
  // Unknown sources are passed through untouched apart from the dry-recording brief.
  assert.match(buildSoundPrompt("a door slam"), /^a door slam\. Realistic/);
  // A detailed planner description is not buried under a second one.
  const detailed =
    "several red foxes screaming back and forth at night; raspy, hoarse, guttural human-like yowls mixed with sharp yapping barks";
  assert.equal(enrichSoundPrompt(detailed), detailed);
});

test("effects that are naturally sharp get extra softening, everything gets some", () => {
  assert.match(soundDecodeFilter("a door slam"), /treble=g=-3/);
  assert.doesNotMatch(soundDecodeFilter("a door slam"), /equalizer/);
  assert.match(soundDecodeFilter("foxes screaming"), /equalizer=f=3200/);
});

test("the softening filter chain runs in FFmpeg and takes energy out of the harsh band only", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tts-sound-test-"));
  try {
    const decoded = async (frequency: number, filter: string) => {
      const source = path.join(directory, `${frequency}.wav`);
      const out = path.join(directory, `${frequency}-out.wav`);
      await run([
        "-f",
        "lavfi",
        "-i",
        `aevalsrc=0.03*sin(2*PI*${frequency}*t):s=44100:d=1`,
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
        filter,
        "-ar",
        "44100",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        out,
      ]);
      return readWav(await readFile(out));
    };
    const rms = (samples: Float32Array) =>
      Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    const filter = soundDecodeFilter("foxes screaming");
    const low = rms(await decoded(500, filter));
    const harsh = rms(await decoded(3200, filter));
    const original = 0.03 / Math.SQRT2;
    assert.ok(Math.abs(low - original) / original < 0.1, "low frequencies are left alone");
    assert.ok(harsh < original * 0.7, `3.2 kHz should be reduced, got ${harsh} of ${original}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("pitch shifting skips deliberately created voices and ignores a model's prose", () => {
  const troll = scene({ character: "giant troll", prepared: true });
  assert.equal(characterPitch(troll), 0.72);
  assert.doesNotMatch(channelFilter(troll, { pitchShift: false }), /asetrate/);
  assert.match(channelFilter(troll), /asetrate/);
  // The pirate description mentions a deep voice; that is not a request to shift pitch.
  const pirate = scene({
    character: "angry pirate",
    delivery: "A gruff pirate with a deep voice roughened by years at sea",
    prepared: true,
  });
  assert.equal(characterPitch(pirate), 1);
  // A user's own short direction on a local scene still works.
  assert.equal(
    characterPitch(scene({ character: "man", delivery: "deep voice", prepared: false })),
    0.84,
  );
});

test("a clip of sound, speech, sound comes out balanced instead of the effects jumping out", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "tts-balance-test-"));
  try {
    await mkdir(path.join(dataDir, "clips"));
    const duration = await renderAudio({
      id: "balance",
      scenes: [
        scene({ dialogue: "", sound: "foxes screaming", duration: 3, soundDuration: 3 }),
        scene({ dialogue: "Wake up, this is a short demonstration line", sound: "" }),
        scene({ dialogue: "", sound: "foxes barking", duration: 3, soundDuration: 3 }),
      ],
      mode: "demo",
      key: "",
      voices: {},
      dataDir,
      progress: () => {},
    });
    const samples = readWav(await readFile(path.join(dataDir, "clips", "balance.wav")));
    assert.ok(Math.abs(duration - samples.length / RATE) < 0.01);
    const first = samples.slice(0, 3 * RATE);
    const last = samples.slice(samples.length - 3 * RATE);
    const middle = samples.slice(
      3 * RATE + Math.round(0.2 * RATE),
      samples.length - 3 * RATE - Math.round(0.2 * RATE),
    );
    const effectLevel = (integratedLoudness(first) + integratedLoudness(last)) / 2;
    const speechLevel = integratedLoudness(middle);
    // Foxes are a sharp sound, which is deliberately set 2 LU lower than other effects.
    assert.ok(
      Math.abs(effectLevel - (SOUND_ONLY_TARGET_LUFS - 2)) < 2,
      `effects at ${effectLevel} LUFS`,
    );
    assert.ok(Math.abs(speechLevel - SPEECH_TARGET_LUFS) < 2, `speech at ${speechLevel} LUFS`);
    assert.ok(speechLevel - effectLevel > 2, "speech stays clearly above a standalone effect");
    assert.ok(samples.every((sample) => Math.abs(sample) <= 0.98));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

const filterFile = async (samples: Float32Array, filter: string) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tts-filter-test-"));
  try {
    const source = path.join(directory, "in.wav");
    const out = path.join(directory, "out.wav");
    await writeFile(source, writeWav(samples));
    await run(["-i", source, "-af", filter, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
    return readWav(await readFile(out));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
const peakOf = (samples: Float32Array) =>
  samples.reduce((highest, value) => Math.max(highest, Math.abs(value)), 0);

test("spikes in a sharp effect are tamed so they do not jump out", async () => {
  // A quiet bed with a few loud, sharp bursts: what animal screams do.
  const signal = tone(3000, 2, 0.04);
  for (const at of [0.4, 1.0, 1.6]) signal.set(tone(3000, 0.03, 0.9), Math.round(at * RATE));
  const out = await filterFile(signal, soundDecodeFilter("foxes screaming"));
  assert.ok(peakOf(out) < peakOf(signal) * 0.5, `peak ${peakOf(out)} vs ${peakOf(signal)}`);
  // A non-sharp sound is not compressed.
  const plain = await filterFile(signal, soundDecodeFilter("a door slam"));
  assert.ok(peakOf(plain) > peakOf(signal) * 0.5);
});

test("a gigantic sound is slowed down: lower and longer", async () => {
  const out = await filterFile(tone(400, 1, 0.3), soundDecodeFilter("a gigantic fart"));
  assert.ok(Math.abs(out.length / RATE - 1 / 0.7) < 0.08, `duration ${out.length / RATE}`);
  const normal = await filterFile(tone(400, 1, 0.3), soundDecodeFilter("a door slam"));
  assert.ok(Math.abs(normal.length / RATE - 1) < 0.02);
});

test("a gigantic fart is described as one and is not cut to a blip", () => {
  const prompt = buildSoundPrompt("one enormous wet fart");
  assert.match(prompt, /colossal/);
  assert.match(prompt, /bass-heavy/);
  const scene = parsePrompt("((gigantic fart in a cathedral;5s))").scenes[0];
  assert.equal(scene.effect, "reverb");
  assert.equal(scene.room, "cathedral");
  assert.equal(scene.effectStrength, "extreme");
  scene.soundDuration = 5;
  // It is generated shorter and then slowed to 1/0.7, so what is heard is still most of the scene.
  assert.ok(
    activeSoundDuration(scene, false) / 0.7 >= 3,
    "an oversized fart keeps most of the scene",
  );
  // A plain fart is still a short transient.
  const plain = parsePrompt("((dry loud fart;reverb;5s))").scenes[0];
  plain.soundDuration = 5;
  assert.equal(activeSoundDuration(plain, false), 1.5);
});

test("strength and room words are recognised", () => {
  for (const word of ["gigantic", "enormous", "colossal", "huge", "massive"])
    assert.equal(isExtreme(`a ${word} boom`), true);
  assert.equal(isExtreme("a boom"), false);
  assert.equal(detectRoom("in a cathedral"), "cathedral");
  assert.equal(detectRoom("in a church"), "cathedral");
  assert.equal(detectRoom("in a cave"), undefined);
});

test("a cathedral rings far longer and louder than the general room", () => {
  const impulse = new Float32Array(Math.round(0.5 * RATE));
  impulse[100] = 0.8;
  const cathedral = scene({
    dialogue: "",
    sound: "clap",
    duration: 8,
    effect: "reverb",
    room: "cathedral",
  });
  const general = { ...cathedral, room: undefined };
  const tailEnergy = (output: Float32Array) =>
    output
      .slice(Math.round(3 * RATE), Math.round(7 * RATE))
      .reduce((sum, value) => sum + value * value, 0);
  const big = tailEnergy(effectTail(impulse, cathedral, null));
  const small = tailEnergy(effectTail(impulse, general, null));
  assert.ok(big > small * 5, `cathedral tail ${big} vs general ${small}`);
  assert.ok(roomProfile(cathedral).decay > roomProfile(general).decay * 2);
  // The general room is unchanged from before.
  assert.deepEqual(roomProfile(general), {
    decay: 1.8,
    level: 0.32,
    delayScale: 1,
    damping: 0.35,
    predelay: 0.025,
  });
});

test("the scream layer follows the words: silent where nobody speaks, present where they do", () => {
  const speech = new Float32Array(RATE * 3);
  speech.set(tone(220, 1, 0.3), Math.round(0.5 * RATE));
  const layer = tone(1500, 3, 0.4);
  const mixed = layerUnderSpeech(speech, layer, 0.8);
  assert.equal(mixed.length, speech.length);
  // Before the word starts and long after it ends the layer is silent.
  assert.ok(peakOf(mixed.slice(0, Math.round(0.4 * RATE))) < 0.001);
  assert.ok(peakOf(mixed.slice(Math.round(2.4 * RATE))) < 0.02);
  // During the word it adds energy beyond the voice itself.
  const during = mixed.slice(Math.round(0.7 * RATE), Math.round(1.3 * RATE));
  const voiceOnly = speech.slice(Math.round(0.7 * RATE), Math.round(1.3 * RATE));
  assert.ok(integratedLoudness(during) > integratedLoudness(voiceOnly) + 1);
  // Silence stays untouched.
  const silent = new Float32Array(RATE);
  assert.equal(layerUnderSpeech(silent, layer, 0.8), silent);
});

// Energy at one frequency (Goertzel), relative to the whole signal.
const bandShare = (samples: Float32Array, frequency: number) => {
  const w = (2 * Math.PI * frequency) / RATE,
    coefficient = 2 * Math.cos(w);
  let s1 = 0,
    s2 = 0;
  for (const sample of samples) {
    const s0 = sample + coefficient * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const power = s1 * s1 + s2 * s2 - coefficient * s1 * s2;
  const total = samples.reduce((sum, value) => sum + value * value, 0);
  return power / ((total * samples.length) / 2 || 1);
};

test("the strain filter roughens a clean voice: new harmonics appear, level stays sane", async () => {
  const shouted = scene({ character: "man", intensity: "shout", prepared: true });
  const clean = tone(200, 1, 0.4);
  const out = await filterFile(clean, channelFilter(shouted, { strainDb: 16 }));
  assert.ok(out.length > RATE * 0.9);
  assert.ok(peakOf(out) > 0.05 && peakOf(out) <= 1);
  // A pure tone has no third harmonic; a saturated one has plenty.
  assert.ok(bandShare(clean, 600) < 0.001);
  assert.ok(bandShare(out, 600) > 0.02, `third harmonic share ${bandShare(out, 600)}`);
  // Nothing is added when the dial is off or the line is not shouted.
  assert.doesNotMatch(channelFilter(shouted), /asoftclip/);
  assert.doesNotMatch(channelFilter(shouted, { strainDb: 0 }), /asoftclip/);
  assert.match(channelFilter(shouted, { strainDb: 10 }), /volume=10.0dB/);
});

test("strain drive follows intensity and the TTS_SCREAM_STRAIN dial", async () => {
  const { strainDbFor, SCREAM_STRAIN_DB, SHOUT_STRAIN_DB } = await import("./audio/index.js");
  try {
    delete process.env.TTS_SCREAM_STRAIN;
    // Off unless asked for: the saturation is crunchy.
    assert.equal(strainDbFor("scream"), 0);
    process.env.TTS_SCREAM_STRAIN = "1";
    assert.equal(strainDbFor("normal"), 0);
    assert.equal(strainDbFor("shout"), SHOUT_STRAIN_DB);
    assert.equal(strainDbFor("scream"), SCREAM_STRAIN_DB);
    assert.ok(SCREAM_STRAIN_DB > SHOUT_STRAIN_DB);
    process.env.TTS_SCREAM_STRAIN = "off";
    assert.equal(strainDbFor("scream"), 0);
    process.env.TTS_SCREAM_STRAIN = "0.5";
    assert.equal(strainDbFor("scream"), SCREAM_STRAIN_DB / 2);
    process.env.TTS_SCREAM_STRAIN = "9";
    assert.equal(strainDbFor("scream"), SCREAM_STRAIN_DB * 2);
  } finally {
    delete process.env.TTS_SCREAM_STRAIN;
  }
});

test("the scream layer asks for the right kind of voice", () => {
  assert.match(screamLayerPrompt("man yelling", "scream"), /^man screaming in terror/);
  assert.match(screamLayerPrompt("old woman", "scream"), /^woman screaming/);
  assert.match(screamLayerPrompt("angry pirate", "shout"), /^man shouting angrily/);
  assert.match(screamLayerPrompt("giant troll", "shout"), /monster roaring/);
  assert.match(screamLayerPrompt(undefined, "scream"), /wordless/);
});

test("the comfort limiter pulls down a stabbing spike and leaves the rest alone", () => {
  // A steady bed with three short, very loud bursts: an average-level fine but painful clip.
  const bed = tone(3000, 3, 0.08);
  const signal = bed.slice();
  const bursts = [0.7, 1.5, 2.3];
  for (const at of bursts) signal.set(tone(3000, 0.06, 0.9), Math.round(at * RATE));
  const out = tameSpikes(signal, 3);
  const momentary = (samples: Float32Array, at: number) =>
    integratedLoudness(
      samples.slice(Math.round((at - 0.02) * RATE), Math.round((at + 0.08) * RATE)),
    );
  const bedLevel = integratedLoudness(bed);
  for (const at of bursts) {
    assert.ok(momentary(signal, at) > bedLevel + 8, "the raw burst really does stab");
    assert.ok(
      momentary(out, at) <= bedLevel + 3.6,
      `burst at ${at}s is ${momentary(out, at) - bedLevel} LU over the bed`,
    );
  }
  // Between bursts the audio is not touched.
  const before = integratedLoudness(signal.slice(0, Math.round(0.4 * RATE)));
  const after = integratedLoudness(out.slice(0, Math.round(0.4 * RATE)));
  assert.ok(Math.abs(before - after) < 0.3, `quiet part changed by ${after - before} dB`);
});

test("the comfort limiter does nothing to steady audio, silence or tiny clips", () => {
  const steady = tone(1000, 2, 0.2);
  assert.equal(tameSpikes(steady, 3), steady);
  const silence = new Float32Array(RATE);
  assert.equal(tameSpikes(silence, 3), silence);
  const tiny = tone(1000, 0.05, 0.5);
  assert.equal(tameSpikes(tiny, 3), tiny);
});

test("TTS_SCREAM_LAYER is a dial and is off unless you turn it on", async () => {
  const { screamLayerScale, SCREAM_LAYER_GAIN, SHOUT_LAYER_GAIN } =
    await import("./audio/index.js");
  const set = (value: string | undefined) => {
    if (value === undefined) delete process.env.TTS_SCREAM_LAYER;
    else process.env.TTS_SCREAM_LAYER = value;
  };
  try {
    set(undefined);
    assert.equal(screamLayerScale(), 0);
    set("1");
    assert.equal(screamLayerScale(), 1);
    set("off");
    assert.equal(screamLayerScale(), 0);
    set("0");
    assert.equal(screamLayerScale(), 0);
    set("0.5");
    assert.equal(screamLayerScale(), 0.5);
    set("2");
    assert.equal(screamLayerScale(), 2);
    set("99");
    assert.equal(screamLayerScale(), 3);
    set("nonsense");
    assert.equal(screamLayerScale(), 0);
  } finally {
    set(undefined);
  }
  assert.ok(
    SCREAM_LAYER_GAIN < 0.5 && SHOUT_LAYER_GAIN < SCREAM_LAYER_GAIN,
    "the layer stays well under the voice",
  );
});

test("the scream tone follows the shape measured on a real scream, with no distortion", () => {
  const level = (frequency: number, amount = 1) => {
    const input = tone(frequency, 2, 0.2);
    const out = screamTone(input, amount);
    // Skip the filters' start-up so only the steady state is compared.
    const from = Math.round(0.5 * RATE);
    return 20 * Math.log10(rms(out.slice(from)) / rms(input.slice(from)));
  };
  const rms = (samples: Float32Array) =>
    Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  assert.ok(level(100) < -8, "the chest region falls away");
  assert.ok(level(300) < -2, "the low mids come down");
  assert.ok(level(900) > 0.5 && level(1500) > 0.3, "the body of the voice comes forward");
  assert.ok(level(3000) < -1.5, "the harsh 3 kHz region is reduced");
  assert.ok(level(6500) < -6, "almost nothing is left above 4-5 kHz");
  assert.ok(level(12000) < -12);
  // Half the amount is half the shaping, and zero is a true bypass.
  assert.ok(Math.abs(level(6500, 0.5)) < Math.abs(level(6500, 1)));
  const input = tone(1000, 0.2, 0.3);
  assert.equal(screamTone(input, 0), input);
  // It is a linear filter: a pure tone comes out a pure tone (no new harmonics).
  const pure = screamTone(tone(400, 1, 0.3), 1);
  const third = bandShare(pure.slice(Math.round(0.3 * RATE)), 1200);
  assert.ok(third < 0.001, `unexpected harmonic energy ${third}`);
});

test("scream tone is on by default, scales with intensity, and is a dial", async () => {
  const { toneAmountFor, screamToneScale } = await import("./audio/index.js");
  try {
    delete process.env.TTS_SCREAM_TONE;
    assert.equal(screamToneScale(), 1);
    assert.equal(toneAmountFor("normal"), 0);
    assert.equal(toneAmountFor("scream"), 1);
    assert.equal(toneAmountFor("shout"), 1);
    process.env.TTS_SCREAM_TONE = "off";
    assert.equal(toneAmountFor("scream"), 0);
    process.env.TTS_SCREAM_TONE = "2";
    assert.equal(toneAmountFor("scream"), 2);
  } finally {
    delete process.env.TTS_SCREAM_TONE;
  }
});

// ---- echo and reverb together, and the prompts that use them -------------------------------------
const energy = (samples: Float32Array, from: number, to: number) =>
  samples
    .slice(Math.round(from * RATE), Math.round(to * RATE))
    .reduce((sum, value) => sum + value * value, 0);
const burst = (seconds: number, at = 0.05) => {
  const dry = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < Math.round(0.2 * RATE); i++)
    dry[Math.round(at * RATE) + i] = Math.sin(i * 0.11) * 0.6 * (1 - i / (0.2 * RATE));
  return dry;
};

test("echo and reverb are read separately and can be combined", () => {
  assert.equal(detectEffect("Loud long lasting fart,Reverb"), "reverb");
  assert.equal(detectEffect("Huge fart,Echo"), "echo");
  assert.equal(detectEffect("Multiple loud farts,Reverb Echo"), "both");
  assert.equal(detectEffect("Multiple loud farts, echo and reverb"), "both");
  assert.equal(detectEffect("a shout in a cave with echo"), "both");
  assert.equal(detectEffect("Extreme fart sound,Indoor"), "reverb");
  assert.equal(detectEffect("Huge fart from down a well,Echo"), "both");
  assert.equal(detectEffect("a plain fart"), "none");
  assert.equal(detectEffect("everything is well-known"), "none");
  assert.equal(detectRoom("Extreme fart sound,Indoor"), "indoor");
  assert.equal(detectRoom("Huge fart from down a well"), "well");
  assert.equal(detectRoom("in a small room"), "indoor");
});

test("every one of the requested fart prompts parses to the right effect, room and length", () => {
  const rows = parsePrompt(
    "((Loud long lasting fart,Reverb;6s)) ((Multiple small farts,Reverb;8s)) ((Huge fart,Echo;4s)) ((Huge fart from down a well,Echo;4s)) ((Multiple loud farts,Reverb Echo;6s)) ((Extreme fart sound,Indoor;6s))",
  ).scenes.map((scene) => [scene.effect, scene.room ?? null, scene.effectStrength, scene.duration]);
  assert.deepEqual(rows, [
    ["reverb", null, "normal", 6],
    ["reverb", null, "normal", 8],
    ["echo", null, "extreme", 4],
    ["both", "well", "extreme", 4],
    ["both", null, "normal", 6],
    ["reverb", "indoor", "extreme", 6],
  ]);
});

test("a planner cannot put the room or the echo into the sound it asks for", () => {
  const cases: Array<[string, RegExp]> = [
    [
      "one long, loud, deep, resonant fart with a sustained rumbling start and gradual fade, heavy bass tones, indoor space with natural",
      /^one long, loud, deep, resonant fart with a sustained rumbling start and gradual fade, heavy bass tones$/,
    ],
    [
      "multiple small, quick farts in succession, varied pitch and length, light and squeaky texture, indoor setting with soft",
      /^multiple small, quick farts in succession, varied pitch and length, light and squeaky texture$/,
    ],
    [
      "one huge, explosive fart with a sharp onset and prolonged tail, deep bass-heavy and resonant, effect replicating bouncing sound",
      /^one huge, explosive fart with a sharp onset and prolonged tail, deep bass-heavy and resonant$/,
    ],
    [
      "one huge fart sound as if coming from far down a well, with distant repetition creating a hollow, watery effect",
      /^one huge fart sound(?:, hollow)?(?:, watery)?$/,
    ],
    [
      "multiple loud farts, each distinct with varied volume and pitch, combined and creating a spacious, layered soundscape",
      /^multiple loud farts, each distinct with varied volume and pitch(?:, combined)?(?:, layered)?$/,
    ],
    [
      "extremely loud, powerful, deep fart sound with intense indoor acoustic effects emphasizing volume and bass impact",
      /^extremely loud, powerful, deep fart sound$/,
    ],
  ];
  for (const [planned, expected] of cases) {
    const clean = sanitizeSoundPrompt(planned);
    assert.match(clean, expected, planned);
    assert.doesNotMatch(
      clean,
      /\b(?:indoor|well|echo|reverb|acoustic|space|repetition|bouncing|soundscape)\b/i,
    );
    assert.doesNotMatch(
      clean,
      /\b(?:with|and|as if|from|the|a|an|of)\s*$/i,
      "no dangling fragment",
    );
  }
  assert.equal(stripRoomPhrases("a wet fart, well defined"), "a wet fart, well defined");
});

const noiseBurst = (seconds: number) => {
  const samples = new Float32Array(Math.round(seconds * RATE));
  let state = 12345;
  for (let i = 0; i < Math.round(0.3 * RATE); i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    samples[Math.round(0.05 * RATE) + i] =
      (state / 0x7fffffff - 0.5) * 0.8 * (1 - i / (0.3 * RATE));
  }
  return samples;
};
// How closely a delayed copy of the sound appears anywhere later in the output (0 none, 1 an exact copy).
const strongestCopy = (dry: Float32Array, out: Float32Array) => {
  const from = Math.round(0.05 * RATE),
    length = Math.round(0.3 * RATE);
  const source = dry.slice(from, from + length);
  const sourceEnergy = source.reduce((sum, value) => sum + value * value, 0);
  let best = 0;
  for (let lag = Math.round(0.35 * RATE); lag < Math.round(2.2 * RATE); lag += 5) {
    let cross = 0,
      own = 0;
    for (let i = 0; i < length; i += 2) {
      const other = out[from + lag + i];
      cross += source[i] * other;
      own += other * other;
    }
    best = Math.max(best, Math.abs(cross) / Math.sqrt((own * sourceEnergy) / 2 || 1));
  }
  return best;
};

test("an echo on a sound effect is a smooth fade, not copies of the sound layered on itself", () => {
  const dry = noiseBurst(1);
  const fart = parsePrompt("((Huge fart,Echo;4s))").scenes[0];
  assert.equal(fart.effect, "echo");
  const out = effectTail(dry, fart, null);
  assert.equal(out.length, 4 * RATE);
  // It fades away, audibly, after the sound has ended...
  assert.ok(energy(out, 0.5, 1.5) > energy(out, 1.5, 2.5));
  assert.ok(energy(out, 1.5, 2.5) > energy(out, 2.5, 3.5));
  assert.ok(energy(out, 1.5, 2.5) > 0);
  // ...and there is no delayed copy of the fart inside it.
  assert.ok(
    strongestCopy(dry, out) < 0.35,
    `a repeat of the sound is present (${strongestCopy(dry, out)})`,
  );
  assert.ok(Math.abs(out.at(-1) ?? 1) < 1e-6);
  // Speech is different: its last word is repeated.
  const speech = new Float32Array(RATE * 2);
  const source = noiseBurst(1);
  for (let i = 0; i < Math.round(0.4 * RATE); i++)
    speech[Math.round(1.4 * RATE) + i] = source[Math.round(0.05 * RATE) + i];
  const said = { ...parsePrompt('((man saying "hello" with echo;6s))').scenes[0] };
  const heard = effectTail(speech, said, { start: 1.4, end: 1.8 });
  assert.ok(energy(heard, 2.0, 5.0) > 0);
});

test("echo and reverb together are fuller than either alone", () => {
  const dry = noiseBurst(0.8);
  const base = { ...parsePrompt("((Multiple loud farts,Reverb Echo;6s))").scenes[0] };
  const both = effectTail(dry, base, null);
  const echoOnly = effectTail(dry, { ...base, effect: "echo" }, null);
  const roomOnly = effectTail(dry, { ...base, effect: "reverb" }, null);
  assert.equal(both.length, 6 * RATE);
  const tail = (x: Float32Array) => energy(x, 1.5, 4.5);
  assert.ok(tail(both) > tail(echoOnly) * 1.05, "asking for both is more than the echo alone");
  assert.ok(tail(both) > tail(roomOnly) * 1.3, "and more than plain reverb");
  assert.ok(strongestCopy(dry, both) < 0.35, "still no layered copies of the sound");
  assert.ok(peakOf(both) < 4, `peak ${peakOf(both)}`);
  assert.ok(Math.abs(both.at(-1) ?? 1) < 1e-6, "it still fades to silence at the authored end");
});

test("speech can have both an echo of its last word and a room", () => {
  const speech = new Float32Array(RATE * 2);
  for (let i = 0; i < RATE; i++) speech[Math.round(0.3 * RATE) + i] = Math.sin(i * 0.05) * 0.5;
  const scene = { ...parsePrompt('((man in a cave with echo saying "hello";8s))').scenes[0] };
  assert.equal(scene.effect, "both");
  const both = effectTail(speech, scene, { start: 0.9, end: 1.3 });
  const echoOnly = effectTail(speech, { ...scene, effect: "echo" }, { start: 0.9, end: 1.3 });
  assert.equal(both.length, 8 * RATE);
  assert.ok(energy(both, 3, 7) > energy(echoOnly, 3, 7));
  assert.throws(() => effectTail(speech, scene, null), /timing/);
});

test("indoor and well rooms are different from the general room", () => {
  const general = roomProfile(scene({ effect: "reverb" }));
  const indoor = roomProfile(scene({ effect: "reverb", room: "indoor" }));
  const well = roomProfile(scene({ effect: "reverb", room: "well" }));
  assert.ok(indoor.decay < general.decay, "indoors is a small, close room");
  assert.ok(well.damping > general.damping, "a well is dull and hollow");
  assert.ok(well.delayScale < indoor.delayScale + 0.2);
  const impulse = burst(0.5);
  const tailOf = (room?: "indoor" | "well" | "cathedral") =>
    energy(
      effectTail(
        impulse,
        scene({ dialogue: "", sound: "x", duration: 6, effect: "reverb", room }),
        null,
      ),
      2,
      5,
    );
  assert.ok(tailOf("indoor") < tailOf(undefined), "indoors rings for less time");
  assert.ok(tailOf("cathedral") > tailOf(undefined) * 3);
});

test("every requested fart keeps enough of its scene to be heard, and leaves room for its effect", () => {
  const scenes = parsePrompt(
    "((Loud long lasting fart,Reverb;6s)) ((Multiple small farts,Reverb;8s)) ((Huge fart,Echo;4s)) ((Huge fart from down a well,Echo;4s)) ((Multiple loud farts,Reverb Echo;6s)) ((Extreme fart sound,Indoor;6s))",
  ).scenes;
  const lengths = scenes.map((item) => {
    const planned = { ...item, soundDuration: item.duration ?? 5 };
    const heard =
      activeSoundDuration(planned, false) /
      (/\b(?:huge|gigantic|enormous|colossal|massive)\b/i.test(item.sound) ? 0.7 : 1);
    return { heard, room: (item.duration ?? 0) - heard };
  });
  for (const [index, { heard, room }] of lengths.entries()) {
    assert.ok(heard >= 1.9, `scene ${index + 1}: the sound itself is only ${heard}s`);
    assert.ok(room >= 1.4, `scene ${index + 1}: only ${room}s is left for the effect`);
  }
  // A long, lasting fart is not the 1.8 s blip a plain one is.
  assert.ok(lengths[0].heard > 3);
});

// ---- heard through a door -------------------------------------------------------------------------------
test("wording that puts a voice behind a door, a wall or in another room is recognised", () => {
  for (const text of [
    "man yells from outside",
    "a voice behind a door",
    "a knock through the wall",
    "muffled voice",
    "someone shouting from another room",
    "from the other side of the door",
    "man behind a thick closed door",
    "voice from next door",
    "on the other side of the wall",
  ])
    assert.equal(detectMuffled(text), true, text);
  for (const text of [
    "man yelling",
    "a door slam",
    "yells at the top of his lungs",
    "outside voice",
    "the doorbell rings",
  ])
    assert.equal(detectMuffled(text), false, text);
});

test("the door example parses to plain knocks and muffled yells", () => {
  const scenes = parsePrompt(
    '((door knock)) ((man yells from outside: "OPEN THE DOOR")) ((door knock)) ((man yells from outside: "VICKSY! OPEN THE DOOR"))',
  ).scenes;
  assert.deepEqual(
    scenes.map((item) => [
      item.dialogue,
      item.sound,
      item.muffled ?? false,
      item.intensity ?? null,
    ]),
    [
      ["", "door knock", false, null],
      ["OPEN THE DOOR", "", true, "shout"],
      ["", "door knock", false, null],
      ["VICKSY! OPEN THE DOOR", "", true, "shout"],
    ],
  );
});

test("muffling removes the highs and keeps a dull, boxy body", () => {
  const level = (frequency: number, scale = 1) => {
    const input = tone(frequency, 2, 0.2);
    const out = muffle(input, scale);
    const from = Math.round(0.5 * RATE);
    const rmsOf = (samples: Float32Array) =>
      Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    return 20 * Math.log10(rmsOf(out.slice(from)) / rmsOf(input.slice(from)));
  };
  assert.ok(level(300) > -1, "the low-mid body stays");
  assert.ok(level(60) < -5, "rumble is cut");
  assert.ok(level(1000) < -6 && level(1200) < -9, "the top of the voice is going");
  assert.ok(level(3000) < -20, "consonant detail is gone");
  assert.ok(level(6000) < -35, "and the air above it");
  assert.ok(level(1200, 2) < level(1200, 1) - 6, "a thicker door absorbs more");
  const input = tone(1000, 0.2, 0.3);
  assert.equal(muffle(input, 0), input);
  // Linear: no new harmonics appear.
  assert.ok(bandShare(muffle(tone(400, 1, 0.3)).slice(Math.round(0.3 * RATE)), 1200) < 0.001);
});

test("the place is kept out of the sound prompt and out of the voice's tags", () => {
  assert.equal(sanitizeSoundPrompt("a heavy knock behind a closed door"), "a heavy knock");
  assert.equal(sanitizeSoundPrompt("muffled music from another room"), "music");
  const request = speechRequest(
    scene({
      dialogue: "[muffled, shouting from outside] OPEN THE DOOR",
      character: "man",
      delivery: "yelling from outside a door",
      intensity: "shout",
      prepared: true,
    }),
  );
  assert.equal(request.text, "[shouts] OPEN THE DOOR!");
  assert.doesNotMatch(request.text, /outside|door\b.*door|muffled/i);
});

test("a voice behind a door is quieter than the same voice in the room, and still audible", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "tts-door-test-"));
  try {
    await mkdir(path.join(dataDir, "clips"));
    const line = "Open the door, please, open it now";
    await renderAudio({
      id: "door",
      scenes: [scene({ dialogue: line }), scene({ dialogue: line, muffled: true })],
      mode: "demo",
      key: "",
      voices: {},
      dataDir,
      progress: () => {},
    });
    const samples = readWav(await readFile(path.join(dataDir, "clips", "door.wav")));
    const half = Math.floor(samples.length / 2);
    const inRoom = integratedLoudness(samples.slice(0, half - Math.round(0.1 * RATE)));
    const behind = integratedLoudness(samples.slice(half + Math.round(0.1 * RATE)));
    assert.ok(
      inRoom - behind > 2.5 && inRoom - behind < 6.5,
      `in room ${inRoom}, behind door ${behind}`,
    );
    assert.ok(behind > -30, "it is still clearly audible");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("TTS_MUFFLE is a dial", async () => {
  const { muffleScale } = await import("./audio/index.js");
  try {
    delete process.env.TTS_MUFFLE;
    assert.equal(muffleScale(), 1);
    process.env.TTS_MUFFLE = "2";
    assert.equal(muffleScale(), 2);
    process.env.TTS_MUFFLE = "off";
    assert.equal(muffleScale(), 0);
    process.env.TTS_MUFFLE = "9";
    assert.equal(muffleScale(), 3);
  } finally {
    delete process.env.TTS_MUFFLE;
  }
});
