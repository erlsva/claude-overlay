import assert from "node:assert/strict";
import test from "node:test";
import {
  attributeReplay,
  getTtsPlaybackState,
  removeWaitingJob,
  setTtsHeld,
  setTtsOverlayCheck,
  setTtsPlaybackController,
  setTtsPlaybackVolume,
  submit,
  waitingJobs,
} from "./service.js";

test("the overlay volume is remembered while nothing is playing", () => {
  setTtsPlaybackController({
    state: () => ({ active: false, paused: false }),
    stop: () => false,
    pause: () => false,
    resume: () => false,
    setVolume: () => false,
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

test("a request made while TTS is paused is accepted and waits before anything is made", async () => {
  setTtsPlaybackController({
    state: () => ({ active: false, paused: false }),
    stop: () => false,
    pause: () => false,
    resume: () => false,
    setVolume: () => false,
  });
  setTtsHeld(true);
  try {
    const { job } = submit({
      prompt: "This must not spend credits while paused",
      sender: "test",
      owner: "test",
      play: true,
    });
    await new Promise((resolve) => setImmediate(resolve)); // the job starts on the next tick
    // The job is at the gate, before any interpreting or generating, so no credits are spent.
    assert.equal(job.status, "running");
    assert.equal(job.waiting, true);
    assert.equal(job.message, "Waiting for TTS to be resumed");
    assert.equal(getTtsPlaybackState().held, true);
    assert.equal(getTtsPlaybackState().waiting, 1);
    assert.equal(removeWaitingJob(job.id), true);
    assert.equal(waitingJobs().length, 0);
  } finally {
    setTtsHeld(false);
  }
});

test("playback jobs are refused before generation while the overlay is closed", () => {
  setTtsPlaybackController({
    state: () => ({ active: false, paused: false }),
    stop: () => false,
    pause: () => false,
    resume: () => false,
    setVolume: () => false,
  });
  setTtsOverlayCheck(() => false);
  assert.throws(
    () =>
      submit({ prompt: "This must not spend credits", sender: "test", owner: "test", play: true }),
    /overlay is not open/,
  );
  setTtsOverlayCheck(() => true);
});
