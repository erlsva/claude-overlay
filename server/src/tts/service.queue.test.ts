import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";

// Saved clips replay from a token without any paid service, so the whole queue can be run here.
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-tts-queue-"));

const { saveClip } = await import("./store.js");
const {
  MAX_QUEUED,
  clearWaitingJobs,
  getTtsPlaybackState,
  onTtsStateChange,
  playNextTts,
  removeWaitingJob,
  setTtsGapSeconds,
  setTtsHeld,
  setTtsPlayer,
  submit,
  ttsQueue,
  waitingJobs,
} = await import("./service.js");

const clipId = (n: number) => n.toString(16).padStart(32, "0");
const token = (n: number) => `(TTS:${clipId(n)})`;

for (let n = 1; n <= 9; n++)
  await saveClip({
    id: clipId(n),
    token: token(n),
    prompt: `clip ${n}`,
    sender: "saved",
    createdAt: new Date().toISOString(),
    duration: 1,
    discordMessageId: `message-${n}`,
  });

/** Every clip the stub "overlay" was asked to play, with when it started and ended. */
const played: Array<{ n: number; start: number; end: number }> = [];
const PLAY_MS = 60;
setTtsPlayer(async (clip) => {
  const start = Date.now();
  await sleep(PLAY_MS);
  played.push({ n: Number.parseInt(clip.id, 16), start, end: Date.now() });
});

const request = (n: number) =>
  submit({ prompt: token(n), sender: `viewer${n}`, owner: "test", play: true });
const order = () => played.map((entry) => entry.n);

test.beforeEach(() => {
  played.length = 0;
  setTtsHeld(false);
  setTtsGapSeconds(0);
});
test.afterEach(async () => {
  // Nothing may be left waiting for the next test.
  setTtsHeld(false);
  clearWaitingJobs();
  await sleep(PLAY_MS * 3);
});

test("requests made while TTS is paused wait, and resuming plays them in order", async () => {
  setTtsHeld(true);
  const jobs = [request(1), request(2), request(3)];
  await sleep(120);
  assert.deepEqual(order(), [], "nothing plays while paused");
  assert.equal(getTtsPlaybackState().waiting, 3);
  assert.deepEqual(
    waitingJobs().map((job) => job.sender),
    ["viewer1", "viewer2", "viewer3"],
    "the queue shows who is waiting, in order",
  );

  setTtsHeld(false);
  await Promise.all(jobs.map((entry) => entry.completion));
  assert.deepEqual(order(), [1, 2, 3]);
  assert.equal(getTtsPlaybackState().waiting, 0);
});

test("Play next plays exactly one waiting request and holds again", async () => {
  setTtsHeld(true);
  const [first, second, third] = [request(4), request(5), request(6)];
  assert.equal(playNextTts(), true);
  await first.completion;
  await sleep(150);
  assert.deepEqual(order(), [4], "only the first played");
  assert.equal(getTtsPlaybackState().held, true, "still paused");
  assert.equal(getTtsPlaybackState().waiting, 2);

  assert.equal(playNextTts(), true);
  await second.completion;
  assert.deepEqual(order(), [4, 5]);

  setTtsHeld(false);
  await third.completion;
  assert.deepEqual(order(), [4, 5, 6]);
});

test("Play next does nothing when TTS is running or nothing is waiting", () => {
  assert.equal(playNextTts(), false, "not paused");
  setTtsHeld(true);
  assert.equal(playNextTts(), false, "nothing waiting");
});

test("a request can be removed from the queue, and the others still play", async () => {
  setTtsHeld(true);
  const [first, second, third] = [request(1), request(2), request(3)];
  await sleep(50);
  assert.equal(removeWaitingJob(second.job.id), true);
  assert.equal(second.job.status, "cancelled");
  assert.equal(removeWaitingJob(second.job.id), false, "it is already gone");

  setTtsHeld(false);
  await Promise.all([first.completion, second.completion, third.completion]);
  assert.deepEqual(order(), [1, 3]);
});

test("clearing the queue removes every waiting request", async () => {
  setTtsHeld(true);
  const jobs = [request(1), request(2), request(3)];
  await sleep(50);
  assert.equal(clearWaitingJobs(), 3);
  assert.deepEqual(
    jobs.map((entry) => entry.job.status),
    ["cancelled", "cancelled", "cancelled"],
  );
  setTtsHeld(false);
  await Promise.all(jobs.map((entry) => entry.completion));
  await sleep(100);
  assert.deepEqual(order(), []);
});

test("pausing while a clip plays lets it finish, and holds the next one", async () => {
  const first = request(7);
  const second = request(8);
  await sleep(PLAY_MS / 3); // the first clip is playing
  setTtsHeld(true);
  await first.completion;
  assert.deepEqual(order(), [7], "the clip that was playing finished");
  await sleep(150);
  assert.deepEqual(order(), [7], "the next one is held");
  setTtsHeld(false);
  await second.completion;
  assert.deepEqual(order(), [7, 8]);
});

test("pausing while a made clip waits out the silence keeps it held afterwards", async () => {
  setTtsGapSeconds(0.5);
  const first = request(1);
  const second = request(2);
  await first.completion;
  await sleep(50);
  // The second clip is made and is waiting out the silence between clips.
  assert.equal(second.job.waiting, true);
  assert.equal(second.job.message, "Waiting between clips");
  setTtsHeld(true);
  await sleep(700); // longer than the silence
  assert.deepEqual(order(), [1], "it stays held after the silence has passed");
  assert.equal(second.job.message, "Made, waiting for TTS to be resumed");
  setTtsHeld(false);
  await second.completion;
  assert.deepEqual(order(), [1, 2]);
});

test("there is always the set silence between one clip and the next", async () => {
  setTtsGapSeconds(0.4);
  const jobs = [request(1), request(2), request(3)];
  await Promise.all(jobs.map((entry) => entry.completion));
  assert.deepEqual(order(), [1, 2, 3]);
  for (const [before, after] of [
    [played[0], played[1]],
    [played[1], played[2]],
  ])
    assert.ok(
      after.start - before.end >= 380,
      `expected at least 0.4 s of silence, got ${after.start - before.end} ms`,
    );
});

test("with no silence set, clips follow each other straight away", async () => {
  const jobs = [request(1), request(2)];
  await Promise.all(jobs.map((entry) => entry.completion));
  assert.ok(played[1].start - played[0].end < 100);
});

test("Play next ignores the silence between clips", async () => {
  setTtsGapSeconds(5);
  const first = request(1);
  await first.completion; // the silence now runs for five seconds
  setTtsHeld(true);
  const second = request(2);
  assert.equal(playNextTts(), true);
  await Promise.race([
    second.completion,
    sleep(1500).then(() => assert.fail("Play next should not wait for the silence")),
  ]);
  assert.deepEqual(order(), [1, 2]);
});

test("the queue accepts many waiting requests but not without end", () => {
  setTtsHeld(true);
  for (let i = 0; i < MAX_QUEUED; i++) request(1);
  assert.throws(() => request(1), /queue is full/);
  assert.equal(getTtsPlaybackState().waiting, MAX_QUEUED);
});

test("the dashboard is told when pausing or the queue changes", async () => {
  let calls = 0;
  const stop = onTtsStateChange(() => calls++);
  setTtsHeld(true);
  const queued = request(1);
  await sleep(20);
  assert.ok(calls >= 2, `expected updates for pausing and for the new request, got ${calls}`);
  setTtsHeld(false);
  await queued.completion;
  stop();
  assert.equal(ttsQueue.isHeld(), false);
});
