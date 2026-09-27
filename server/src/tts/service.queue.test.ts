import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";

// Saved clips replay from a token, and a stand-in generator makes new ones, so the whole queue can
// be run here without any paid service.
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-tts-queue-"));

const { getClip, saveClip } = await import("./store.js");
const {
  MAX_QUEUED,
  MAX_READY_AHEAD,
  clearWaitingJobs,
  getTtsPlaybackState,
  onTtsStateChange,
  playNextTts,
  removeWaitingJob,
  setTtsGapSeconds,
  setTtsGenerator,
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
    prompt: `saved ${n}`,
    sender: "saved",
    createdAt: new Date().toISOString(),
    duration: 1,
    discordMessageId: `message-${n}`,
  });

/** What the stand-in generator was asked to make, and the ids of the clips it made. */
const asked: string[] = [];
const madeIds = new Map<string, string>();
const failOn = new Set<string>();
let makeMs = 0;
let madeCount = 0;
setTtsGenerator(async (request) => {
  asked.push(request.prompt);
  await sleep(makeMs);
  if (failOn.has(request.prompt)) throw new Error(`could not make ${request.prompt}`);
  const id = clipId(1000 + ++madeCount);
  madeIds.set(request.prompt, id);
  const clip = {
    id,
    token: `(TTS:${id})`,
    prompt: request.prompt,
    sender: request.sender,
    createdAt: new Date().toISOString(),
    duration: 1,
    discordMessageId: `fresh-${madeCount}`,
  };
  await saveClip(clip);
  return clip;
});

/** Every clip the stand-in "overlay" was asked to play, with when it started and ended. */
const played: Array<{ prompt: string; start: number; end: number }> = [];
let playMs = 60;
setTtsPlayer(async (clip) => {
  const start = Date.now();
  await sleep(playMs);
  played.push({ prompt: clip.prompt, start, end: Date.now() });
});

const replay = (n: number) =>
  submit({ prompt: token(n), sender: `viewer${n}`, owner: "test", play: true });
const fresh = (name: string, play = true) =>
  submit({ prompt: name, sender: `viewer-${name}`, owner: "test", play });
const order = () => played.map((entry) => entry.prompt);

test.beforeEach(() => {
  played.length = 0;
  asked.length = 0;
  madeIds.clear();
  failOn.clear();
  makeMs = 0;
  playMs = 60;
  setTtsHeld(false);
  setTtsGapSeconds(0);
});
test.afterEach(async () => {
  // Nothing may be left waiting for the next test.
  setTtsHeld(false);
  clearWaitingJobs();
  await sleep(300);
});

test("requests made while TTS is paused are made straight away, and wait to play", async () => {
  setTtsHeld(true);
  const jobs = [fresh("a"), fresh("b"), fresh("c")];
  await sleep(150);
  assert.deepEqual(asked, ["a", "b", "c"], "all three were made while paused");
  assert.deepEqual(
    jobs.map((entry) => entry.job.stage),
    ["ready", "ready", "ready"],
  );
  assert.deepEqual(order(), [], "but nothing plays");
  assert.equal(getTtsPlaybackState().waiting, 3);
  assert.deepEqual(
    waitingJobs().map((job) => job.sender),
    ["viewer-a", "viewer-b", "viewer-c"],
    "the queue shows who is waiting, in order",
  );
});

test("resuming plays what was made ahead at once, in order", async () => {
  setTtsHeld(true);
  makeMs = 30;
  const jobs = [fresh("a"), fresh("b"), fresh("c")];
  await sleep(250); // all made while paused
  const resumedAt = Date.now();
  setTtsHeld(false);
  await Promise.all(jobs.map((entry) => entry.completion));
  assert.deepEqual(order(), ["a", "b", "c"]);
  assert.ok(
    played[0].start - resumedAt < 40,
    `the first clip should start at once, took ${played[0].start - resumedAt} ms`,
  );
});

test("only so many are made ahead, and the rest wait un-made until there is room", async () => {
  setTtsHeld(true);
  const names = Array.from({ length: MAX_READY_AHEAD + 3 }, (_, i) => `r${i}`);
  const jobs = names.map((name) => fresh(name));
  await sleep(200);
  assert.equal(asked.length, MAX_READY_AHEAD, "no more than the limit were made");
  assert.equal(jobs.filter((entry) => entry.job.stage === "ready").length, MAX_READY_AHEAD);
  assert.equal(jobs.filter((entry) => entry.job.status === "queued").length, 3);
  assert.equal(getTtsPlaybackState().waiting, names.length, "they all count as waiting");

  // Playing one makes room, so the next one starts being made.
  assert.equal(playNextTts(), true);
  await jobs[0].completion;
  await sleep(100);
  assert.equal(asked.length, MAX_READY_AHEAD + 1);
});

test("while running, the next clip is made while the current one plays", async () => {
  playMs = 250;
  makeMs = 30;
  const first = fresh("a");
  const second = fresh("b");
  await sleep(150); // the first is playing
  assert.deepEqual(order(), [], "the first clip has not finished");
  assert.equal(second.job.stage, "ready", "the second was made in the meantime");
  await Promise.all([first.completion, second.completion]);
  assert.deepEqual(order(), ["a", "b"]);
});

test("Play next plays exactly one made request and holds again", async () => {
  setTtsHeld(true);
  const [first, second, third] = [fresh("a"), fresh("b"), fresh("c")];
  await sleep(100);
  assert.equal(playNextTts(), true);
  await first.completion;
  await sleep(150);
  assert.deepEqual(order(), ["a"], "only the first played");
  assert.equal(getTtsPlaybackState().held, true, "still paused");
  assert.equal(getTtsPlaybackState().waiting, 2);

  assert.equal(playNextTts(), true);
  await second.completion;
  assert.deepEqual(order(), ["a", "b"]);

  setTtsHeld(false);
  await third.completion;
  assert.deepEqual(order(), ["a", "b", "c"]);
});

test("Play next does nothing when TTS is running or nothing is waiting", () => {
  assert.equal(playNextTts(), false, "not paused");
  setTtsHeld(true);
  assert.equal(playNextTts(), false, "nothing waiting");
});

test("removing a made request deletes the clip that was made for it", async () => {
  setTtsHeld(true);
  const [keep, drop] = [fresh("keep"), fresh("drop")];
  await sleep(100);
  const droppedId = madeIds.get("drop")!;
  assert.ok(await getClip(droppedId), "it was made and saved");

  assert.equal(removeWaitingJob(drop.job.id), true);
  assert.equal(drop.job.status, "cancelled");
  await sleep(50);
  assert.equal(await getClip(droppedId), undefined, "its clip is gone from the saved clips");
  assert.equal(removeWaitingJob(drop.job.id), false, "it is already gone");

  setTtsHeld(false);
  await Promise.all([keep.completion, drop.completion]);
  assert.deepEqual(order(), ["keep"], "the removed one never plays");
  assert.ok(await getClip(madeIds.get("keep")!), "the one that played is kept");
});

test("removing a replay of a saved clip never deletes the saved clip", async () => {
  setTtsHeld(true);
  const entry = replay(1);
  await sleep(80);
  assert.equal(removeWaitingJob(entry.job.id), true);
  await sleep(80);
  assert.ok(await getClip(clipId(1)), "the saved clip is untouched");
});

test("removing a request while it is being made deletes its clip when it is done", async () => {
  setTtsHeld(true);
  makeMs = 120;
  const entry = fresh("slow");
  await sleep(40); // being made
  assert.equal(entry.job.stage, "making");
  assert.equal(removeWaitingJob(entry.job.id), true);
  await entry.completion;
  await sleep(200);
  assert.equal(entry.job.status, "cancelled");
  assert.equal(await getClip(madeIds.get("slow")!), undefined, "the finished clip was deleted");
  setTtsHeld(false);
  await sleep(100);
  assert.deepEqual(order(), []);
});

test("clearing the queue removes every waiting request and the clips made for them", async () => {
  setTtsHeld(true);
  const jobs = [fresh("a"), fresh("b"), replay(2)];
  await sleep(120);
  assert.equal(clearWaitingJobs(), 3);
  assert.deepEqual(
    jobs.map((entry) => entry.job.status),
    ["cancelled", "cancelled", "cancelled"],
  );
  await sleep(100);
  assert.equal(await getClip(madeIds.get("a")!), undefined);
  assert.equal(await getClip(madeIds.get("b")!), undefined);
  assert.ok(await getClip(clipId(2)), "a saved clip that was queued for replay is kept");
  setTtsHeld(false);
  await Promise.all(jobs.map((entry) => entry.completion));
  await sleep(100);
  assert.deepEqual(order(), []);
});

test("pausing while a clip plays lets it finish, and holds the next one that was made", async () => {
  const first = fresh("a");
  const second = fresh("b");
  await sleep(30); // the first clip is playing
  setTtsHeld(true);
  await first.completion;
  assert.deepEqual(order(), ["a"], "the clip that was playing finished");
  await sleep(150);
  assert.deepEqual(order(), ["a"], "the next one is held");
  assert.equal(second.job.stage, "ready", "although it was made");
  setTtsHeld(false);
  await second.completion;
  assert.deepEqual(order(), ["a", "b"]);
});

test("one request that cannot be made does not stop the others", async () => {
  failOn.add("bad");
  const jobs = [fresh("a"), fresh("bad"), fresh("c")];
  await Promise.all(jobs.map((entry) => entry.completion));
  assert.deepEqual(order(), ["a", "c"]);
  assert.equal(jobs[1].job.status, "failed");
  assert.match(jobs[1].job.error ?? "", /could not make bad/);
  assert.equal(jobs[2].job.status, "complete");
});

test("a request that is only made and saved is never held, nor counted as waiting", async () => {
  setTtsHeld(true);
  const saved = fresh("just save", false);
  await saved.completion;
  assert.equal(saved.job.status, "complete");
  assert.equal(saved.job.message, "Clip saved");
  assert.equal(waitingJobs().length, 0);
  assert.deepEqual(order(), []);
});

test("there is always the set silence between one clip and the next", async () => {
  setTtsGapSeconds(0.4);
  const jobs = [replay(1), replay(2), replay(3)];
  await Promise.all(jobs.map((entry) => entry.completion));
  assert.deepEqual(order(), ["saved 1", "saved 2", "saved 3"]);
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
  const jobs = [replay(1), replay(2)];
  await Promise.all(jobs.map((entry) => entry.completion));
  assert.ok(played[1].start - played[0].end < 100);
});

test("Play next ignores the silence between clips", async () => {
  setTtsGapSeconds(5);
  const first = replay(1);
  await first.completion; // the silence now runs for five seconds
  setTtsHeld(true);
  const second = replay(2);
  await sleep(50);
  assert.equal(playNextTts(), true);
  await Promise.race([
    second.completion,
    sleep(1500).then(() => assert.fail("Play next should not wait for the silence")),
  ]);
  assert.deepEqual(order(), ["saved 1", "saved 2"]);
});

test("the queue accepts many waiting requests but not without end", () => {
  setTtsHeld(true);
  for (let i = 0; i < MAX_QUEUED; i++) replay(1);
  assert.throws(() => replay(1), /queue is full/);
  assert.equal(getTtsPlaybackState().waiting, MAX_QUEUED);
});

test("the dashboard is told when pausing or the queue changes", async () => {
  let calls = 0;
  const stop = onTtsStateChange(() => calls++);
  setTtsHeld(true);
  const queued = replay(1);
  await sleep(30);
  assert.ok(calls >= 2, `expected updates for pausing and for the new request, got ${calls}`);
  setTtsHeld(false);
  await queued.completion;
  stop();
  assert.equal(ttsQueue.isHeld(), false);
});
