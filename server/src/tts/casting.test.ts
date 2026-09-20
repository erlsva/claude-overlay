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
      intensity: "shout",
      prepared: true,
      stability: 1,
    })),
    { text: "[shouts] ABOBA!", model_id: "eleven_v3", voice_settings: { stability: 0 } },
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
      text: "[crying] [sobbing] [voice breaking] ABOBA…",
      model_id: "eleven_v3",
      voice_settings: { stability: 0.5 },
    },
  );
});

test("uncommon expressive directions become natural-language audio tags", () => {
  assert.deepEqual(
    speechRequest(scene({ dialogue: "Do not turn around", delivery: "terrified and breathless", prepared: true })),
    { text: "[terrified and breathless] Do not turn around", model_id: "eleven_v3", voice_settings: { stability: 0.5 } },
  );
});

test("existing expressive tags are not duplicated", () => {
  assert.deepEqual(
    speechRequest(scene({ dialogue: "[crying] [sobbing] [voice breaking] ABOBA…", delivery: "crying and sobbing", prepared: true, stability: 0.5 })),
    { text: "[crying] [sobbing] [voice breaking] ABOBA…", model_id: "eleven_v3", voice_settings: { stability: 0.5 } },
  );
});

test("a scream gets exactly one short tag, never a stack or an invented sentence", () => {
  const request = speechRequest(scene({
    dialogue: "[screaming] [shouts] [screaming at the top of his lungs] I can't hold it in",
    intensity: "scream",
    prepared: true,
  }));
  assert.equal(request.text, "[screaming] I CAN'T HOLD IT IN!");
  assert.equal(request.voice_settings.stability, 0);
  assert.doesNotMatch(request.text, /shouts/);
});

test("planner tags are cleaned but never upper-cased or given room words", () => {
  const request = speechRequest(scene({
    dialogue: "[echoing, frantic, obsessive] Where is Forsen? Where is Forsen?",
    intensity: "shout",
    prepared: true,
  }));
  assert.equal(request.text, "[shouts] [frantic] [obsessive] WHERE IS FORSEN? WHERE IS FORSEN?");
  assert.doesNotMatch(request.text, /echo/i);
  assert.match(request.text, /^\[shouts] \[frantic] \[obsessive] /);
});

test("the last word is not respelled and no exclamation stack is added", () => {
  const request = speechRequest(scene({ dialogue: "I CAN'T HOLD IT IN", intensity: "scream", prepared: true }));
  assert.equal(request.text, "[screaming] I CAN'T HOLD IT IN!");
});

test("a model's long explanation of a scene cannot trigger shouting or become a tag", () => {
  const request = speechRequest(scene({
    dialogue: "Hello there",
    character: "man",
    delivery: "Performed as a loud, prolonged scream with strong urgency, echo reverberating naturally to fit the cave setting.",
    intensity: "normal",
    prepared: true,
  }));
  assert.deepEqual(request, { text: "Hello there", model_id: "eleven_v3", voice_settings: { stability: 0.5 } });
});

test("overly long free-form directions are not sent as tags", () => {
  const request = speechRequest(scene({
    dialogue: "Do not turn around",
    delivery: "terrified and out of breath as something huge closes in from behind",
    prepared: true,
  }));
  assert.equal(request.text, "Do not turn around");
});

test("legacy plans without an intensity still read the user's short direction", () => {
  assert.equal(
    speechRequest(scene({ dialogue: "Aboba", character: "man", delivery: "screaming", prepared: true })).text,
    "[screaming] ABOBA!",
  );
});

test("an extreme desperate scream becomes one tag plus a short emotion", () => {
  assert.deepEqual(
    speechRequest(scene({
      dialogue: "I CANT HOLD IT IN!!!",
      character: "man",
      delivery: "man in mountain with echo harshly and desperetaley screams loudly into the void",
      intensity: "scream",
    })),
    {
      text: "[screaming] [desperate] I CANT HOLD IT IN!!!",
      model_id: "eleven_v3",
      voice_settings: { stability: 0 },
    },
  );
});

test("a screaming character is not cast as a relaxed narrator just because the planner liked it", () => {
  const catalog: AccountVoice[] = [
    { voice_id: "husky", name: "Callum - Husky Trickster", labels: { gender: "male", use_case: "characters_animation" } },
    { voice_id: "warrior", name: "Harry - Fierce Warrior", labels: { gender: "male", descriptive: "rough", use_case: "characters_animation" } },
  ];
  const casting = castScenes([scene({ character: "man", intensity: "scream", preferredVoiceId: "husky" })], catalog);
  assert.equal(casting[0].voiceId, "warrior");
  // A calm request may still use the planner's pick.
  assert.equal(castScenes([scene({ character: "man", preferredVoiceId: "husky" })], catalog)[0].voiceId, "husky");
});

test("any voice created in the account is used when its character is mentioned", () => {
  const catalog: AccountVoice[] = [
    { voice_id: "narrator", name: "Brian", category: "premade" },
    { voice_id: "gnome", name: "Grumpy Garden Gnome", category: "generated" },
    { voice_id: "dragon", name: "Dragon / Wyrm", category: "generated" },
  ];
  const casting = castScenes([
    scene({ character: "a garden gnome" }),
    scene({ character: "ancient wyrm", dialogue: "Bow." }),
  ], catalog);
  assert.equal(casting[0].voiceId, "gnome");
  assert.equal(casting[0].pinned, true);
  assert.equal(casting[1].voiceId, "dragon");
});

test("TTS_SHOUT_VOICES names the voices that scream, and spreads characters across them", () => {
  const catalog: AccountVoice[] = [
    { voice_id: "calm", name: "Calm", labels: { gender: "male", descriptive: "relaxed" } },
    { voice_id: "a", name: "Screamer One" },
    { voice_id: "b", name: "Screamer Two" },
  ];
  process.env.TTS_SHOUT_VOICES = "Screamer One, b";
  try {
    const casting = castScenes([
      scene({ character: "goblin", intensity: "scream" }),
      scene({ character: "witch", intensity: "shout" }),
      scene({ character: "clerk" }),
    ], catalog);
    assert.equal(casting[0].voiceId, "a");
    assert.equal(casting[1].voiceId, "b");
    assert.notEqual(casting[2].voiceId, "a");
  } finally {
    delete process.env.TTS_SHOUT_VOICES;
  }
});

const account: AccountVoice[] = [
  { voice_id: "brian", name: "Brian - Deep, Resonant", category: "premade", labels: { gender: "male", descriptive: "classy" } },
  { voice_id: "harry", name: "Harry - Fierce Warrior", category: "premade", labels: { gender: "male", descriptive: "rough", use_case: "characters_animation" } },
  { voice_id: "alice", name: "Alice - Clear", category: "premade", labels: { gender: "female" } },
  { voice_id: "troll", name: "Troll / Ogre", category: "generated", labels: { language: "en" } },
  { voice_id: "pirate", name: "Angry Pirate", category: "generated", labels: { language: "en" } },
];

test("character voices are reserved for their own characters", () => {
  const casting = castScenes([
    scene({ character: "schizo man", preferredVoiceId: "troll" }),
    scene({ character: "man yelling in cave", intensity: "shout", preferredVoiceId: "pirate" }),
    scene({ character: "voice1" }),
    scene({ character: "angry pirate", intensity: "scream", dialogue: "Wake up" }),
  ], account);
  assert.notEqual(casting[0].voiceId, "troll");
  assert.equal(casting[1].voiceId, "harry");
  assert.ok(!["troll", "pirate"].includes(casting[2].voiceId), "plain speech never gets a character voice");
  assert.equal(casting[3].voiceId, "pirate");
  assert.equal(casting[3].pinned, true);
});

test("an account with only character voices can still cast them", () => {
  const casting = castScenes([scene({ character: "someone" })], account.filter((voice) => voice.category === "generated"));
  assert.equal(casting.length, 1);
});

test("TTS_DEFAULT_VOICE covers characters that nothing else matches", () => {
  process.env.TTS_DEFAULT_VOICE = "Brian";
  try {
    assert.equal(castScenes([scene({ character: "voice1" })], account)[0].voiceId, "brian");
    // A requested gender still wins over the default.
    assert.equal(castScenes([scene({ character: "old woman" })], account)[0].voiceId, "alice");
  } finally {
    delete process.env.TTS_DEFAULT_VOICE;
  }
});

test("an unhinged character leans toward an energetic voice", () => {
  const casting = castScenes([scene({ character: "schizo man" })], [
    { voice_id: "calm", name: "Calm", category: "premade", labels: { gender: "male", descriptive: "calm" } },
    { voice_id: "wild", name: "Wild", category: "premade", labels: { gender: "male", descriptive: "energetic quirky" } },
  ]);
  assert.equal(casting[0].voiceId, "wild");
});

test("TTS_SHOUT_VOICES picks the shouting voice that fits the character", () => {
  const catalog: AccountVoice[] = [
    { voice_id: "man", name: "Screaming Man", category: "generated" },
    { voice_id: "woman", name: "Screaming Woman", category: "generated" },
    { voice_id: "brian", name: "Brian", category: "premade", labels: { gender: "male" } },
  ];
  process.env.TTS_SHOUT_VOICES = "Screaming Man, Screaming Woman";
  try {
    const casting = castScenes([
      scene({ character: "old woman", intensity: "scream" }),
      scene({ character: "man", intensity: "shout" }),
    ], catalog);
    assert.equal(casting[0].voiceId, "woman");
    assert.equal(casting[1].voiceId, "man");
  } finally {
    delete process.env.TTS_SHOUT_VOICES;
  }
});

test("how something is said does not pick who says it: a screaming troll gets the troll", () => {
  const catalog: AccountVoice[] = [
    { voice_id: "a", name: "Screaming man", category: "generated" },
    { voice_id: "b", name: "Troll / Ogre", category: "generated" },
    { voice_id: "c", name: "Angry Pirate", category: "generated" },
    { voice_id: "d", name: "Harry - Fierce Warrior", category: "premade", labels: { gender: "male", descriptive: "rough" } },
  ];
  process.env.TTS_SHOUT_VOICES = "Screaming man";
  try {
    const casting = castScenes([
      scene({ character: "troll screaming", intensity: "scream" }),
      scene({ character: "man yelling", intensity: "shout" }),
      scene({ character: "pirate shouting", intensity: "shout" }),
      scene({ character: "screaming man", intensity: "scream" }),
    ], catalog);
    assert.equal(casting[0].voiceId, "b");
    assert.equal(casting[0].pinned, true);
    assert.equal(casting[1].voiceId, "a", "a generic yelling man gets the named shouting voice");
    assert.equal(casting[2].voiceId, "c");
    assert.equal(casting[3].voiceId, "a");
  } finally {
    delete process.env.TTS_SHOUT_VOICES;
  }
});

test("a demon with no stated gender is cast as a man, never the screaming woman", () => {
  const catalog: AccountVoice[] = [
    { voice_id: "woman", name: "Screaming woman", category: "generated" },
    { voice_id: "man", name: "Screaming man clone", category: "generated" },
  ];
  process.env.TTS_SHOUT_VOICES = "Screaming man clone, Screaming woman";
  try {
    for (const character of ["demonic voice", "demon", "monster", "giant", "devil"]) {
      const [casting] = castScenes([scene({ character, intensity: "scream" })], catalog);
      assert.equal(casting.voiceId, "man", character);
    }
    const [woman] = castScenes([scene({ character: "demon woman", intensity: "scream" })], catalog);
    assert.equal(woman.voiceId, "woman", "an explicit gender still wins");
  } finally {
    delete process.env.TTS_SHOUT_VOICES;
  }
});

test("welshman and frenchman are men, and their accent is a tag on the line", () => {
  const catalog: AccountVoice[] = [
    { voice_id: "f", name: "Bright", labels: { gender: "female" } },
    { voice_id: "m", name: "Gareth", labels: { gender: "male", accent: "british" } },
  ];
  const [casting] = castScenes([scene({ character: "angry welshman", delivery: "angry welshman" })], catalog);
  assert.equal(casting.voiceId, "m");
  const welsh = speechRequest(scene({ character: "angry welshman", delivery: "angry welshman", dialogue: "[angry] Get off my land." }));
  assert.equal(welsh.text, "[strong Welsh accent] [angry] Get off my land.");
  const french = speechRequest(scene({ character: "sad french man", delivery: "sad french man", dialogue: "Je suis triste." }));
  assert.match(french.text, /^\[strong French accent\]/);
  assert.doesNotMatch(french.text, /french man|welshman/i, "the nationality is not repeated as a performance tag");
});

test("the accent tag sits after the intensity tag and replaces the planner's own", () => {
  const request = speechRequest(scene({
    character: "screaming scottish pirate",
    delivery: "screaming scottish pirate",
    intensity: "scream",
    dialogue: "[scottish accent] [angry] Come here!",
  }));
  assert.match(request.text, /^\[screaming\] \[strong Scottish accent\] \[angry\] /);
  assert.equal((request.text.match(/accent/g) || []).length, 1);
});

test("plain speech is untouched: no accent tag and no nationality guesswork", () => {
  assert.equal(speechRequest(scene({ character: "man", delivery: "", dialogue: "Hello there" })).text, "Hello there");
  assert.doesNotMatch(speechRequest(scene({ dialogue: "I am german in spirit", character: "" })).text, /accent/);
});
