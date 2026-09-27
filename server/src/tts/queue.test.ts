import assert from "node:assert/strict";
import test from "node:test";
import { createQueueGate, QueueCancelled, type QueueClock, type QueueJob } from "./queue.js";

/** A clock the test moves by hand, so no test waits in real time. */
function fakeClock() {
  let now = 1_000_000;
  const timers: Array<{ at: number; run: () => void }> = [];
  const clock: QueueClock = {
    now: () => now,
    after(run, ms) {
      const timer = { at: now + ms, run };
      timers.push(timer);
      return () => {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
      };
    },
  };
  return {
    clock,
    advance(ms: number) {
      now += ms;
      for (const timer of timers.filter((entry) => entry.at <= now)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.run();
      }
    },
  };
}

const job = (): QueueJob & { cancel: () => void } => {
  let cancelled = false;
  return { cancelled: () => cancelled, cancel: () => (cancelled = true) };
};

/** Lets waiting promises run, so a test can see whether something has resolved yet. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

async function state(promise: Promise<unknown>) {
  let value: "waiting" | "done" = "waiting";
  void promise.then(
    () => (value = "done"),
    () => (value = "done"),
  );
  await settle();
  return value;
}

test("nothing waits while TTS is running and no clip has just played", async () => {
  const time = fakeClock();
  const gate = createQueueGate(time.clock);
  assert.equal(await gate.turn(job()), false);
  await gate.beforePlay(job(), false);
});

test("while paused a request waits to be made, and resuming lets it through", async () => {
  const time = fakeClock();
  const gate = createQueueGate(time.clock, { held: true });
  const waiting = gate.turn(job());
  assert.equal(await state(waiting), "waiting");
  gate.setHeld(false);
  assert.equal(await waiting, false);
});

test("Play next lets exactly one request through and it plays at once", async () => {
  const time = fakeClock();
  const gate = createQueueGate(time.clock, { held: true, gapSeconds: 7 });
  gate.clipEnded();
  const first = gate.turn(job());
  const second = gate.turn(job());
  assert.equal(gate.playNext(), true);
  assert.equal(await first, true, "the first request is let through on the pass");
  assert.equal(await state(second), "waiting", "the second still waits");
  // A request let through this way plays without waiting out the silence between clips.
  await gate.beforePlay(job(), true);
  assert.equal(gate.playNext(), true, "another pass can be given once the first is used");
  assert.equal(await second, true);
});

test("Play next cannot pile up passes, and does nothing when TTS is not paused", async () => {
  const time = fakeClock();
  const gate = createQueueGate(time.clock, { held: true });
  assert.equal(gate.playNext(), true);
  assert.equal(gate.playNext(), false, "one unused pass is enough");
  gate.setHeld(false);
  assert.equal(gate.playNext(), false, "nothing to let through when TTS is running");
  gate.setHeld(true);
  assert.equal(await state(gate.turn(job())), "waiting", "an old pass does not survive a pause");
});

test("a clip waits out the silence since the last one ended, counting the time spent making it", async () => {
  const time = fakeClock();
  const gate = createQueueGate(time.clock, { gapSeconds: 7 });
  gate.clipEnded();
  time.advance(3_000); // the next clip took three seconds to make
  const playing = gate.beforePlay(job(), false);
  assert.equal(await state(playing), "waiting");
  time.advance(3_900);
  assert.equal(await state(playing), "waiting", "still 100 ms short of seven seconds");
  time.advance(100);
  await playing;
});

test("a clip that took longer than the silence to make plays at once", async () => {
  const time = fakeClock();
  const gate = createQueueGate(time.clock, { gapSeconds: 5 });
  gate.clipEnded();
  time.advance(9_000);
  await gate.beforePlay(job(), false);
});

test("the first clip after a long quiet spell is not delayed", async () => {
  const time = fakeClock();
  const gate = createQueueGate(time.clock, { gapSeconds: 30 });
  await gate.beforePlay(job(), false);
  gate.clipEnded();
  time.advance(31_000);
  await gate.beforePlay(job(), false);
});

test("changing the silence while a clip waits takes effect straight away", async () => {
  const time = fakeClock();
  const gate = createQueueGate(time.clock, { gapSeconds: 20 });
  gate.clipEnded();
  time.advance(2_000);
  const playing = gate.beforePlay(job(), false);
  assert.equal(await state(playing), "waiting");
  gate.setGapSeconds(1);
  await playing;
  gate.setGapSeconds(999);
  assert.equal(gate.gapSeconds(), 30, "held to the most the panel allows");
  gate.setGapSeconds(-4);
  assert.equal(gate.gapSeconds(), 0);
});

test("pausing while a clip is being made holds it before it plays, and resuming still waits out the silence", async () => {
  const time = fakeClock();
  const gate = createQueueGate(time.clock, { gapSeconds: 5 });
  gate.clipEnded();
  time.advance(6_000);
  gate.setHeld(true);
  const playing = gate.beforePlay(job(), false);
  assert.equal(await state(playing), "waiting", "held while paused, though the silence has passed");
  gate.setHeld(false);
  await playing;
});

test("a clip held at the play step can be let out by Play next", async () => {
  const time = fakeClock();
  const gate = createQueueGate(time.clock, { held: true, gapSeconds: 5 });
  const playing = gate.beforePlay(job(), false);
  assert.equal(await state(playing), "waiting");
  gate.playNext();
  await playing;
});

test("a request removed from the queue stops waiting, wherever it was waiting", async () => {
  const time = fakeClock();
  const gate = createQueueGate(time.clock, { held: true });
  const first = job();
  const turn = gate.turn(first);
  first.cancel();
  gate.wake();
  await assert.rejects(turn, QueueCancelled);

  gate.setHeld(false);
  gate.clipEnded();
  const second = job();
  const play = gate.beforePlay(second, false);
  second.cancel();
  gate.wake();
  await assert.rejects(play, QueueCancelled);
  await assert.rejects(gate.turn(second), QueueCancelled, "even one that has not started yet");
});

test("the panel is told when pausing, the silence or a pass changes", () => {
  const time = fakeClock();
  const gate = createQueueGate(time.clock);
  let calls = 0;
  const stop = gate.subscribe(() => calls++);
  gate.setHeld(true);
  gate.setHeld(true); // no change
  gate.playNext();
  gate.setGapSeconds(9);
  assert.equal(calls, 3);
  stop();
  gate.setHeld(false);
  assert.equal(calls, 3);
});
