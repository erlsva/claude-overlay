import assert from "node:assert/strict";
import test from "node:test";
import {
  attributeReplay,
  getTtsPlaybackState,
  setTtsOverlayCheck,
  setTtsPlaybackController,
  setTtsPlaybackVolume,
  submit,
} from "./service.js";

test("the overlay volume is remembered while nothing is playing", () => {
  setTtsPlaybackController({
    state: () => ({ enabled: true, active: false, paused: false }),
    stop: () => false,
    pause: () => false,
    resume: () => false,
    setVolume: () => false,
    setEnabled: (enabled) => ({ enabled, active: false, paused: false }),
  });
  assert.equal(setTtsPlaybackVolume(0.8), true);
  assert.equal(getTtsPlaybackState().volume, 0.8);
  assert.equal(setTtsPlaybackVolume(0.8), false);
});

test("saved clip replays are attributed to the current sender", () => {
  const original = {
    id: "a".repeat(32),
    token: `(TTS:${"a".repeat(32)})`,
    prompt: "A memorable line",
    sender: "OriginalCreator",
    createdAt: new Date(0).toISOString(),
    duration: 3,
    discordMessageId: "message",
  };
  const replay = attributeReplay(original, "CurrentViewer");
  assert.equal(replay.sender, "CurrentViewer");
  assert.equal(original.sender, "OriginalCreator");
});

test("disabled playback rejects before a paid TTS job is queued", () => {
  setTtsPlaybackController({
    state: () => ({ enabled: false, active: false, paused: false }),
    stop: () => false,
    pause: () => false,
    resume: () => false,
    setVolume: () => false,
    setEnabled: (enabled) => ({ enabled, active: false, paused: false }),
  });
  assert.throws(
    () =>
      submit({ prompt: "This must not spend credits", sender: "test", owner: "test", play: true }),
    /playback is turned off/,
  );
});

test("playback jobs are refused before generation while the overlay is closed", () => {
  setTtsPlaybackController({
    state: () => ({ enabled: true, active: false, paused: false }),
    stop: () => false,
    pause: () => false,
    resume: () => false,
    setVolume: () => false,
    setEnabled: (enabled) => ({ enabled, active: false, paused: false }),
  });
  setTtsOverlayCheck(() => false);
  assert.throws(
    () =>
      submit({ prompt: "This must not spend credits", sender: "test", owner: "test", play: true }),
    /overlay is not open/,
  );
  setTtsOverlayCheck(() => true);
});
