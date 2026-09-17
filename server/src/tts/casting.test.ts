import assert from "node:assert/strict";
import test from "node:test";
import { castScenes, speechRequest, type AccountVoice } from "./casting.js";
import type { Scene } from "./shared/scene.js";

const scene = (overrides: Partial<Scene> = {}): Scene => ({
  dialogue: "Hello, chat!",
  sound: "",
  voice: "voice1",
  duration: null,
  effect: "none",
  backgroundVolume: 0.22,
  ...overrides,
});

const voices: AccountVoice[] = [
  { voice_id: "calm", name: "Calm", labels: { gender: "male", descriptive: "gentle relaxed" } },
  { voice_id: "fierce", name: "Fierce", labels: { gender: "male", descriptive: "fierce intense energetic" } },
  { voice_id: "bright", name: "Bright", labels: { gender: "female", descriptive: "playful youthful" } },
];

test("recurring TTS characters retain one voice across scenes", () => {
  const casting = castScenes([
    scene({ character: "frantic man", delivery: "quiet introduction" }),
    scene({ character: "frantic man", delivery: "screaming at full intensity" }),
  ], voices);

  assert.equal(casting.length, 2);
  assert.equal(casting[0].voiceId, "fierce");
  assert.equal(casting[1].voiceId, casting[0].voiceId);
});

test("sound-only scenes do not consume an ElevenLabs voice", () => {
  assert.deepEqual(castScenes([scene({ dialogue: "", sound: "several foxes barking" })], voices), []);
});

test("studio character aliases pin their deliberately created voices", () => {
  const customVoices = [
    { voice_id: "generic-fierce", name: "Harry - Fierce Warrior", labels: { descriptive: "fierce intense energetic" } },
    { voice_id: "pirate", name: "Angry Pirate", labels: { descriptive: "character" } },
    { voice_id: "troll", name: "Troll / Ogre", labels: { descriptive: "character" } },
  ];
  const scenes = [
    scene({ character: "pirate", delivery: "screaming at the top of his lungs" }),
    scene({ character: "giant troll", delivery: "furiously shouting" }),
  ];

  const casting = castScenes(scenes, customVoices);

  assert.equal(casting[0].voiceId, "pirate");
  assert.equal(casting[1].voiceId, "troll");
});

test("prepared dialogue is sent without duplicating performance tags", () => {
  assert.deepEqual(
    speechRequest(scene({ dialogue: "[whispers] hello", prepared: true, stability: 0.5 })),
    { text: "[whispers] hello", model_id: "eleven_v3", voice_settings: { stability: 0.5 } },
  );
});

test("prepared scenes cannot bypass requested yelling and sobbing", () => {
  assert.deepEqual(
    speechRequest(scene({
      dialogue: "ABOBA",
      character: "man",
      delivery: "yelling at the top of his lungs in a cave",
      prepared: true,
      stability: 1,
    })),
    {
      text: "[shouts] [screaming at the top of his lungs] [yelling at the top of his lungs] ABOBAAAA!!!",
      model_id: "eleven_v3",
      voice_settings: { stability: 0 },
    },
  );
  assert.deepEqual(
    speechRequest(scene({
      dialogue: "ABOBA",
      character: "man",
      delivery: "crying and sobbing in a cave",
      prepared: true,
      stability: 0.5,
    })),
    {
      text: "[crying] [sobbing] [voice breaking] [crying and sobbing] ABOBA…",
      model_id: "eleven_v3",
      voice_settings: { stability: 0.5 },
    },
  );
});

test("uncommon expressive directions become natural-language audio tags", () => {
  assert.deepEqual(
    speechRequest(scene({ dialogue: "Do not turn around", delivery: "terrified and breathless", prepared: true })),
    {
      text: "[terrified and breathless] Do not turn around",
      model_id: "eleven_v3",
      voice_settings: { stability: 0.5 },
    },
  );
});

test("existing expressive tags are not duplicated", () => {
  assert.deepEqual(
    speechRequest(scene({
      dialogue: "[crying] [sobbing] [voice breaking] ABOBA…",
      delivery: "crying and sobbing",
      prepared: true,
      stability: 0.5,
    })),
    {
      text: "[crying] [sobbing] [voice breaking] ABOBA…",
      model_id: "eleven_v3",
      voice_settings: { stability: 0.5 },
    },
  );
});

test("a vague screaming tag receives the documented shouting safeguard", () => {
  assert.deepEqual(
    speechRequest(scene({
      dialogue: "[screaming] Aboba",
      delivery: "screaming",
      prepared: true,
      stability: 0.5,
    })),
    {
      text: "[shouts] [screaming at the top of his lungs] [SCREAMING] ABOBAAAA!!!",
      model_id: "eleven_v3",
      voice_settings: { stability: 0 },
    },
  );
});

test("an extreme desperate scream becomes a sustained performance script", () => {
  assert.deepEqual(
    speechRequest(scene({
      dialogue: "I CANT HOLD IT IN!!!",
      character: "man",
      delivery: "man in mountain with echo harshly and desperetaley screams loudly into the void",
    })),
    {
      text: "[shouts] [screaming at the top of his lungs] [inhales sharply] [desperate] [harshly and desperately screams loudly] I CANT HOLD IT IIIIN!!!",
      model_id: "eleven_v3",
      voice_settings: { stability: 0 },
    },
  );
});
