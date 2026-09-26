import assert from "node:assert/strict";
import test from "node:test";
import {
  TTS_GUIDE_FOOTER,
  TTS_GUIDE_LEAD,
  TTS_GUIDE_SECTIONS,
  TTS_GUIDE_TITLE,
  TTS_GUIDE_WARNING,
} from "./guide.js";
import { detectAccent, parsePrompt, type Scene } from "./scene/index.js";

/** The public cheat sheet only earns trust if what it shows really works. */
const examples = TTS_GUIDE_SECTIONS.flatMap((section) =>
  (section.examples ?? []).map((example) => ({ section: section.id, ...example })),
);

test("every example on the public guide is a valid request", () => {
  assert.ok(examples.length >= 30, "the guide has plenty of examples");
  for (const { prompt } of examples) {
    assert.ok(prompt.length <= 6000, prompt);
    const { scenes } = parsePrompt(prompt); // throws on a bad speed or pause
    assert.ok(scenes.length >= 1 && scenes.length <= 10, prompt);
    for (const scene of scenes)
      assert.ok(scene.dialogue.trim() || scene.sound.trim(), `${prompt} produced an empty scene`);
  }
});

const rules: Array<[RegExp, (scene: Scene) => boolean]> = [
  [/walkie-talkie/, (s) => s.channel === "walkie"],
  [/intercom/, (s) => s.channel === "intercom"],
  [/tin can/, (s) => s.channel === "tincan"],
  [/old radio/, (s) => s.channel === "radio"],
  [/chipmunk voice/, (s) => s.voiceEffect === "chipmunk"],
  [/slow motion voice/, (s) => s.voiceEffect === "slowmo"],
  [/robot voice/, (s) => s.voiceEffect === "robot"],
  [/played backwards/, (s) => s.voiceEffect === "reversed"],
  [/underwater/, (s) => s.voiceEffect === "underwater"],
  [/behind a door/, (s) => s.muffled === true],
  [/in a cathedral/, (s) => s.room === "cathedral"],
  [/in a cave/, (s) => s.effect === "reverb" || s.effect === "both"],
  [/down a well/, (s) => s.room === "well"],
  [/with echo/, (s) => s.effect === "echo" || s.effect === "both"],
  [/far away/, (s) => s.distant === true],
  [/man yelling/, (s) => s.intensity === "shout"],
  [/screaming in terror/, (s) => s.intensity === "scream"],
  [/\(\(silence/, (s) => s.sound === "__silence__"],
];

test("each example does what its section says it does", () => {
  for (const { prompt } of examples) {
    const { scenes } = parsePrompt(prompt);
    for (const [pattern, holds] of rules)
      if (pattern.test(prompt))
        assert.ok(
          scenes.some(holds),
          `${prompt} should match ${pattern}, got ${JSON.stringify(scenes)}`,
        );

    for (const [, seconds] of prompt.matchAll(/;(\d+(?:\.\d+)?)s\)\)/g))
      assert.ok(
        scenes.some((s) => s.duration === Number(seconds)),
        `${prompt} should last ${seconds}s`,
      );
    for (const [, rate] of prompt.matchAll(/speed=(\d+(?:\.\d+)?)x/g))
      assert.ok(
        scenes.some((s) => s.speechRate === Number(rate)),
        `${prompt} should run at ${rate}x`,
      );
    // Quoted words are spoken; a block with none is a sound effect.
    if (/^\(\(.*\)\)$/.test(prompt) && !/silence/.test(prompt)) {
      const quoted = prompt.includes('"');
      for (const scene of scenes) {
        if (quoted) assert.ok(scene.dialogue.trim(), `${prompt} should be spoken`);
        else assert.ok(!scene.dialogue.trim() && scene.sound.trim(), `${prompt} is a sound`);
      }
    }
  }
});

test("every accent the guide lists is understood, and its examples name one", () => {
  const accents = TTS_GUIDE_SECTIONS.find((section) => section.id === "accents")!;
  assert.ok((accents.chips ?? []).length >= 20);
  for (const chip of accents.chips ?? [])
    assert.ok(detectAccent(`${chip} man`), `${chip} is not a recognised accent`);
  for (const { prompt } of accents.examples ?? [])
    assert.ok(detectAccent(prompt), `${prompt} names no accent`);
});

test("the public guide never describes how the service is built or configured", () => {
  const everything = JSON.stringify([
    TTS_GUIDE_TITLE,
    TTS_GUIDE_LEAD,
    TTS_GUIDE_WARNING,
    TTS_GUIDE_FOOTER,
    TTS_GUIDE_SECTIONS,
  ]);
  assert.doesNotMatch(
    everything,
    /elevenlabs|openai|discord|webhook|neon|postgres|render\.com|TTS_[A-Z]|api[ -]?key|env(?:ironment)?\b/i,
  );
  assert.match(TTS_GUIDE_WARNING, /unstable|inaccurate/i);
});

test("guide sections are complete and have unique anchors", () => {
  const ids = TTS_GUIDE_SECTIONS.map((section) => section.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const section of TTS_GUIDE_SECTIONS) {
    assert.match(section.id, /^[a-z]+$/);
    assert.ok(section.title && section.intro, section.id);
    assert.ok(section.examples?.length || section.points?.length, `${section.id} has content`);
  }
});
