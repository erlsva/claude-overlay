import assert from "node:assert/strict";
import test from "node:test";
import { parsePrompt } from "./index.js";

test("TTS scenes separate quoted speech from background sound", () => {
  const { scenes } = parsePrompt(
    '((aliens communicating in the background while a deep voice says "Hello chat" with echo;20s))',
  );
  assert.equal(scenes[0].dialogue, "Hello chat");
  assert.equal(scenes[0].sound, "aliens communicating");
  assert.equal(scenes[0].duration, 20);
  assert.equal(scenes[0].effect, "echo");
});

test("TTS scripts preserve sequential voices and effects", () => {
  const { scenes } = parsePrompt("voice1: Hello chat. (fart, echo, 5s) voice2: Excuse me.");
  assert.equal(scenes.length, 3);
  assert.equal(scenes[0].dialogue, "Hello chat.");
  assert.equal(scenes[1].sound, "fart");
  assert.equal(scenes[1].duration, 5);
  assert.equal(scenes[2].voice, "voice2");
});

test("plain speech can be mixed with directed sound blocks in order", () => {
  const { scenes } = parsePrompt("This is a test. How does this sound? ((fart in a cave;5s))");
  assert.equal(scenes.length, 2);
  assert.equal(scenes[0].dialogue, "This is a test. How does this sound?");
  assert.equal(scenes[0].sound, "");
  assert.equal(scenes[1].dialogue, "");
  assert.equal(scenes[1].sound, "fart in a cave");
  assert.equal(scenes[1].effect, "reverb");
  assert.equal(scenes[1].duration, 5);
});

test("pause blocks become exact custom-duration silence between scenes", () => {
  const { scenes } = parsePrompt("First sentence. ((silence;2.5s)) Second sentence.");
  assert.equal(scenes.length, 3);
  assert.equal(scenes[1].sound, "__silence__");
  assert.equal(scenes[1].duration, 2.5);
  assert.equal(scenes[1].effect, "none");
  assert.equal(parsePrompt("((pause))").scenes[0].duration, 1);
});

test("speech, silence, emphatic speech, and sound remain in written order", () => {
  const { scenes } = parsePrompt("You should krill your shell ((silence)) NOW! ((lightning;3s))");
  assert.deepEqual(
    scenes.map((scene) => [scene.dialogue, scene.sound, scene.duration]),
    [
      ["You should krill your shell", "", null],
      ["", "__silence__", 1],
      ["NOW!", "", null],
      ["", "lightning", 3],
    ],
  );
});

test("TTS input limits reject malformed or expensive prompts", () => {
  for (const prompt of [
    "",
    "((rain;31s))",
    "((rain;0s))",
    "((broken",
    "broken))",
    "x".repeat(6001),
  ]) {
    assert.throws(() => parsePrompt(prompt));
  }
});

test("common duration and pause spellings are accepted", () => {
  for (const prompt of [
    "((silence 2 seconds))",
    "((pause, 2 sec))",
    "((silent pause;2s))",
    "((pause for 2 seconds))",
    "((2 seconds of silence))",
  ]) {
    const scene = parsePrompt(prompt).scenes[0];
    assert.equal(scene.sound, "__silence__");
    assert.equal(scene.duration, 2);
  }
  assert.equal(parsePrompt("((thunder, 3 seconds))").scenes[0].duration, 3);
  assert.equal(parsePrompt("((thunder;2,5s))").scenes[0].duration, 2.5);
  assert.equal(parsePrompt("((thunder;.5s))").scenes[0].duration, 0.5);
});

test("authored speech speed supports natural and precise prompt directions", () => {
  assert.equal(parsePrompt('((pirate slowly says "Wait for me";8s))').scenes[0].speechRate, 0.9);
  assert.equal(
    parsePrompt('((pirate says "Wait for me";speed=0.8x;8s))').scenes[0].speechRate,
    0.8,
  );
  assert.equal(parsePrompt('((pirate very quickly says "Run!";8s))').scenes[0].speechRate, 1.25);
});

test("speed can go from half to double, and nothing outside that is accepted", () => {
  const rate = (prompt: string) => parsePrompt(prompt).scenes[0].speechRate;
  assert.equal(rate('((pirate says "Wait";speed=0.5x;8s))'), 0.5);
  assert.equal(rate('((pirate says "Run";speed=1.5x;8s))'), 1.5);
  assert.equal(rate('((pirate says "Run";speed=2x;8s))'), 2);
  assert.equal(rate('((pirate says "Run";speed=2;8s))'), 2);
  assert.equal(rate('((pirate says "Run";rate: 1.75;8s))'), 1.75);
  for (const bad of ["0.4x", "2.5x", "3x", "0x"])
    assert.throws(
      () => parsePrompt(`((pirate says "No";speed=${bad};8s))`),
      /between 0\.5x and 2x/,
      bad,
    );
  // Everyday wording for the extremes.
  assert.equal(rate('((pirate incredibly slowly says "Wait")) '), 0.5);
  assert.equal(rate('((pirate at half speed says "Wait"))'), 0.5);
  assert.equal(rate('((pirate at double speed says "Run"))'), 2);
  assert.equal(rate('((pirate insanely fast says "Run"))'), 1.75);
});

test("speed applies to a sound effect only when it is written as speed=", () => {
  const thunder = parsePrompt("((rumbling thunder;speed=0.5x;6s))").scenes[0];
  assert.equal(thunder.speechRate, 0.5);
  assert.equal(thunder.duration, 6);
  assert.ok(
    !/speed/i.test(thunder.sound),
    `the directive is not sent to the sound model: ${thunder.sound}`,
  );
  assert.equal(parsePrompt("((a gunshot;speed=2x))").scenes[0].speechRate, 2);
  // In a sound description these words describe the sound, so they stay there.
  const door = parsePrompt("((a slowly creaking door;6s))").scenes[0];
  assert.equal(door.speechRate, undefined);
  assert.match(door.sound, /slowly/);
  assert.equal(parsePrompt("((train quickly passing;5s))").scenes[0].speechRate, undefined);
  assert.equal(parsePrompt("((a fart at half speed;3s))").scenes[0].speechRate, undefined);
  assert.throws(() => parsePrompt("((a gunshot;speed=3x))"), /between 0\.5x and 2x/);
});

test("straight, smart double, and smart single quotes become dialogue", () => {
  for (const prompt of [
    '((angry voice: "NOW!"))',
    "((angry voice: “NOW!”))",
    "((angry voice: ‘NOW!’))",
  ]) {
    const scene = parsePrompt(prompt).scenes[0];
    assert.equal(scene.dialogue, "NOW!");
    assert.equal(scene.sound, "");
  }
});

test("local fallback keeps one recurring character while retaining emotional direction", () => {
  const { scenes } = parsePrompt(
    '((man yelling at top of lungs: "ABOBA" in a cave;10s)) ((man crying and sobbing saying: "ABOBA" in a cave;10s))',
  );
  assert.equal(scenes[0].character, "man");
  assert.equal(scenes[1].character, "man");
  assert.match(scenes[0].delivery || "", /yelling at top of lungs/i);
  assert.match(scenes[1].delivery || "", /crying and sobbing/i);
});

test("block delimiters inside quoted dialogue do not close the block", () => {
  const { scenes } = parsePrompt('Before ((robot says "type )) and (( literally";2s)) After');
  assert.equal(scenes.length, 3);
  assert.equal(scenes[1].dialogue, "type )) and (( literally");
  assert.equal(scenes[1].duration, 2);
});

test("escaped and HTML-encoded quotes remain spoken text", () => {
  assert.equal(parsePrompt('((voice says "hello \\"chat\\""))').scenes[0].dialogue, 'hello "chat"');
  assert.equal(
    parsePrompt("((voice says &quot;hello chat&quot;))").scenes[0].dialogue,
    "hello chat",
  );
});

test("multiple quoted phrases preserve their order", () => {
  assert.equal(parsePrompt('((two voices say "one" and “two”))').scenes[0].dialogue, "one two");
});

test("sound direction flags survive deterministic fallback", () => {
  const scene = parsePrompt("((huge distant thunder through an intercom in a cave;4s))").scenes[0];
  assert.equal(scene.effect, "reverb");
  assert.equal(scene.channel, "intercom");
  assert.equal(scene.distant, true);
  assert.equal(scene.effectStrength, "extreme");
  assert.equal(scene.duration, 4);
});

test("the new transmission channels are recognised alongside the existing ones", () => {
  const channelOf = (text: string) => parsePrompt(`((${text} says "hi"))`).scenes[0].channel;
  assert.equal(channelOf("man over a walkie-talkie"), "walkie");
  assert.equal(channelOf("man over a walkie talkie"), "walkie");
  assert.equal(channelOf("man through a tin can"), "tincan");
  assert.equal(channelOf("man through a string phone"), "tincan");
  assert.equal(channelOf("man on an old radio"), "radio");
  assert.equal(channelOf("man on a vintage radio"), "radio");
  assert.equal(channelOf("man on the radio"), "clean", "a bare 'radio' is not the effect");
  assert.equal(channelOf("man through a telephone"), "intercom");
  assert.equal(channelOf("man on a megaphone"), "intercom");
  assert.equal(channelOf("man"), "clean");
});

test("novelty voice effects are recognised from the user's own words", () => {
  const effectOf = (text: string) => parsePrompt(`((${text} says "hi"))`).scenes[0].voiceEffect;
  assert.equal(effectOf("chipmunk voice"), "chipmunk");
  assert.equal(effectOf("helium voice"), "chipmunk");
  assert.equal(effectOf("slow motion voice"), "slowmo");
  assert.equal(effectOf("slow-mo voice"), "slowmo");
  assert.equal(effectOf("robot voice"), "robot");
  assert.equal(effectOf("vocoder voice"), "robot");
  assert.equal(effectOf("voice played backwards"), "reversed");
  assert.equal(effectOf("reversed voice"), "reversed");
  assert.equal(effectOf("underwater voice"), "underwater");
  assert.equal(effectOf("man drowning"), "underwater");
  assert.equal(effectOf("man"), undefined);
  // Independent of room/channel: an underwater voice can still be in a cave.
  const scene = parsePrompt('((underwater voice in a cave says "hi";4s))').scenes[0];
  assert.equal(scene.voiceEffect, "underwater");
  assert.equal(scene.effect, "reverb");
});

test("background sound and speech can share a scene", () => {
  const scene = parsePrompt('((rain in the background while a voice says "Welcome home";6s))')
    .scenes[0];
  assert.equal(scene.dialogue, "Welcome home");
  assert.equal(scene.sound, "rain");
  assert.equal(scene.duration, 6);
});

test("malformed, nested, and excessive blocks fail precisely", () => {
  for (const prompt of ["((", "))", "text ((sound)", "(())", "((outer ((inner))))"])
    assert.throws(() => parsePrompt(prompt));
  assert.throws(
    () => parsePrompt(Array.from({ length: 11 }, (_, index) => `((sound ${index}))`).join(" ")),
    /at most 10/,
  );
  assert.throws(() => parsePrompt("((silence;31 seconds))"), /0.5.*30/);
});

test("parser matrix preserves multilingual dialogue across formatting variants", () => {
  const quotes = [
    ['"', '"'],
    ["“", "”"],
    ["‘", "’"],
  ] as const;
  const durations = [";0.5s", ", 2 sec", " 3 seconds", ";30s"];
  const directions = [
    "warm voice says",
    "angry robot shouts",
    "distant voice whispers",
    "voice2 through an intercom says",
  ];
  const dialogue = "Hei chat 👋 — déjà vu! こんにちは";
  for (const [open, close] of quotes) {
    for (const duration of durations) {
      for (const direction of directions) {
        const scene = parsePrompt(`((${direction}: ${open}${dialogue}${close}${duration}))`)
          .scenes[0];
        assert.equal(scene.dialogue, dialogue);
        assert.equal(scene.sound, "");
        assert.ok((scene.duration ?? 0) >= 0.5 && (scene.duration ?? 0) <= 30);
      }
    }
  }
});
