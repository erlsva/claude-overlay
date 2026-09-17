import assert from "node:assert/strict";
import test from "node:test";
import { setTtsPlaybackController, submit } from "./service.js";

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
    () => submit({ prompt: "This must not spend credits", sender: "test", owner: "test", play: true }),
    /playback is turned off/,
  );
});
