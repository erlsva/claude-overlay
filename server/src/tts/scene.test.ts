import assert from "node:assert/strict";
import test from "node:test";
import { parsePrompt } from "./shared/scene.js";

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
  const { scenes } = parsePrompt('This is a test. How does this sound? ((fart in a cave;5s))');
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
  for (const prompt of ["", "((rain;31s))", "((rain;0s))", "((broken", "broken))", "x".repeat(6001)]) {
    assert.throws(() => parsePrompt(prompt));
  }
});

test("common duration and pause spellings are accepted", () => {
  for (const prompt of ["((silence 2 seconds))", "((pause, 2 sec))", "((silent pause;2s))", "((pause for 2 seconds))", "((2 seconds of silence))"]) {
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
  assert.equal(parsePrompt('((pirate says "Wait for me";speed=0.8x;8s))').scenes[0].speechRate, 0.8);
  assert.equal(parsePrompt('((pirate very quickly says "Run!";8s))').scenes[0].speechRate, 1.25);
  assert.throws(() => parsePrompt('((pirate says "No";speed=0.5x;8s))'), /0.75x.*1.25x/);
});

test("straight, smart double, and smart single quotes become dialogue", () => {
  for (const prompt of ['((angry voice: "NOW!"))', "((angry voice: “NOW!”))", "((angry voice: ‘NOW!’))"]) {
    const scene = parsePrompt(prompt).scenes[0];
    assert.equal(scene.dialogue, "NOW!");
    assert.equal(scene.sound, "");
  }
});

test("local fallback keeps one recurring character while retaining emotional direction", () => {
  const { scenes } = parsePrompt('((man yelling at top of lungs: "ABOBA" in a cave;10s)) ((man crying and sobbing saying: "ABOBA" in a cave;10s))');
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
  assert.equal(parsePrompt("((voice says &quot;hello chat&quot;))").scenes[0].dialogue, "hello chat");
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

test("background sound and speech can share a scene", () => {
  const scene = parsePrompt('((rain in the background while a voice says "Welcome home";6s))').scenes[0];
  assert.equal(scene.dialogue, "Welcome home");
  assert.equal(scene.sound, "rain");
  assert.equal(scene.duration, 6);
});

test("malformed, nested, and excessive blocks fail precisely", () => {
  for (const prompt of ["((", "))", "text ((sound)", "(())", "((outer ((inner))))"]) assert.throws(() => parsePrompt(prompt));
  assert.throws(() => parsePrompt(Array.from({ length: 11 }, (_, index) => `((sound ${index}))`).join(" ")), /at most 10/);
  assert.throws(() => parsePrompt("((silence;31 seconds))"), /0.5.*30/);
});

test("parser matrix preserves multilingual dialogue across formatting variants", () => {
  const quotes = [["\"", "\""], ["“", "”"], ["‘", "’"]] as const;
  const durations = [";0.5s", ", 2 sec", " 3 seconds", ";30s"];
  const directions = ["warm voice says", "angry robot shouts", "distant voice whispers", "voice2 through an intercom says"];
  const dialogue = "Hei chat 👋 — déjà vu! こんにちは";
  for (const [open, close] of quotes) {
    for (const duration of durations) {
      for (const direction of directions) {
        const scene = parsePrompt(`((${direction}: ${open}${dialogue}${close}${duration}))`).scenes[0];
        assert.equal(scene.dialogue, dialogue);
        assert.equal(scene.sound, "");
        assert.ok((scene.duration ?? 0) >= 0.5 && (scene.duration ?? 0) <= 30);
      }
    }
  }
});
