import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { mock } from "node:test";

process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-tts-playback-"));

const { io, activeOverlays } = await import("../runtime.js");
const { saveClip } = await import("../tts/store.js");
const { installTtsPlayback } = await import("./tts.js");
const { getTtsPlaybackState, pauseTtsPlayback, restartTtsPlayback, setTtsGapSeconds, submit } =
  await import("../tts/service.js");

/** What the overlay room and everyone else were told, in order. */
const heard: Array<{ event: string; payload: any }> = [];
(io as any).to = () => ({
  emit: (event: string, payload: unknown) => heard.push({ event, payload }),
});
(io as any).emit = () => {};

const id = "b".repeat(32);
await saveClip({
  id,
  token: `(TTS:${id})`,
  prompt: "a clip that lasts one second",
  sender: "saved",
  createdAt: new Date().toISOString(),
  duration: 1,
  discordMessageId: "message",
});
// Two more clips: one with a stored waveform, and one whose stored waveform is not a waveform.
const shaped = "c".repeat(32);
await saveClip({
  id: shaped,
  token: `(TTS:${shaped})`,
  prompt: "a clip with a waveform",
  sender: "saved",
  createdAt: new Date().toISOString(),
  duration: 3.5,
  discordMessageId: "message-shaped",
  peaks: [10, 55, 100, 60, 7],
});
const garbled = "d".repeat(32);
await saveClip({
  id: garbled,
  token: `(TTS:${garbled})`,
  prompt: "a clip with a broken waveform",
  sender: "saved",
  createdAt: new Date().toISOString(),
  duration: 2,
  discordMessageId: "message-garbled",
  peaks: "loud" as never,
});
installTtsPlayback();
activeOverlays.add("an-overlay");
setTtsGapSeconds(0);

// Playing a clip waits for the overlay to report it ended, or gives up 15 s after the clip's length.
const ALLOWED_MS = 1_000 + 15_000;

const play = () => submit({ prompt: `(TTS:${id})`, sender: "viewer", owner: "test", play: true });
/** Lets the queue get as far as putting the clip on the overlay. */
async function untilPlaying() {
  for (let i = 0; i < 200 && !getTtsPlaybackState().active; i++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(getTtsPlaybackState().active, true, "the clip should be playing");
}
const restarts = () => heard.filter((entry) => entry.event === "sound:restart");

test.beforeEach(() => {
  heard.length = 0;
  mock.timers.enable({ apis: ["setTimeout"] });
});
test.afterEach(() => mock.timers.reset());

test("restarting tells the overlay to start over, and gives the clip its full time again", async () => {
  const { completion } = play();
  await untilPlaying();

  mock.timers.tick(10_000);
  assert.equal(restartTtsPlayback(), true);
  assert.deepEqual(
    restarts().map((entry) => entry.payload),
    [{ id }],
  );

  // Ten more seconds is past the original allowance, but the clock started again at the restart.
  mock.timers.tick(10_000);
  assert.equal(getTtsPlaybackState().active, true, "still playing: the old timer was replaced");
  mock.timers.tick(ALLOWED_MS - 10_000 + 1);
  await completion;
  assert.equal(getTtsPlaybackState().active, false);
});

test("restarting a clip that was paused part-way plays it from the start", async () => {
  const { completion } = play();
  await untilPlaying();
  assert.equal(pauseTtsPlayback(), true);
  assert.equal(getTtsPlaybackState().paused, true);

  mock.timers.tick(60_000); // paused, so no time runs out
  assert.equal(getTtsPlaybackState().active, true);
  assert.equal(restartTtsPlayback(), true);
  assert.equal(getTtsPlaybackState().paused, false, "restarting plays it again");
  assert.equal(restarts().length, 1);

  mock.timers.tick(ALLOWED_MS - 1);
  assert.equal(getTtsPlaybackState().active, true, "the full time is allowed after a restart");
  mock.timers.tick(2);
  await completion;
});

/** Plays a saved clip to the end, and returns what the overlay was told to play. */
async function playAndCapture(clip: string) {
  const { completion } = submit({
    prompt: `(TTS:${clip})`,
    sender: "viewer",
    owner: "test",
    play: true,
  });
  await untilPlaying();
  const told = heard.find((entry) => entry.event === "sound:play")!.payload;
  mock.timers.tick(60_000);
  await completion;
  return told;
}

test("the overlay is told a clip's length and waveform, for the icon to move to", async () => {
  const told = await playAndCapture(shaped);
  assert.equal(told.id, shaped);
  assert.equal(told.duration, 3.5);
  assert.deepEqual(told.peaks, [10, 55, 100, 60, 7]);
});

test("a clip whose stored waveform is unusable is played without one", async () => {
  const told = await playAndCapture(garbled);
  assert.equal(told.duration, 2);
  assert.equal("peaks" in told, false, "the overlay then uses a steady movement");
});

test("with nothing playing there is nothing to restart, and the overlay is not told to", () => {
  assert.equal(getTtsPlaybackState().active, false);
  assert.equal(restartTtsPlayback(), false);
  assert.equal(restarts().length, 0);
});
