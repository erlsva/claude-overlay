import assert from "node:assert/strict";
import test from "node:test";
import { levelAt, poseCss, poseFor, smoothLevel, steadyLevel } from "../src/support/ttsLevel.ts";

const close = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}`);

test("with no waveform, or no length, the icon does not move", () => {
  for (const peaks of [undefined, null, [], "12", {}])
    assert.equal(levelAt(peaks as never, 1, 4), 0);
  for (const duration of [0, -1, NaN, Infinity * 0])
    assert.equal(levelAt([100, 100], 1, duration), 0);
  assert.equal(levelAt([100, 100], NaN, 4), 0);
});

test("quiet slices leave the icon still, and the loudest move it fully", () => {
  assert.equal(levelAt([7, 7, 7], 1.5, 3), 0, "the quietest stored value is a pause");
  close(levelAt([100, 100, 100], 1.5, 3), 1);
  const middle = levelAt([40, 40, 40], 1.5, 3);
  assert.ok(middle > 0 && middle < 1, `an ordinary value is somewhere between, got ${middle}`);
});

test("the level follows the slice the audio is in, blending towards the next", () => {
  const peaks = [100, 7, 7, 7]; // a loud start, then a pause, over four seconds
  close(levelAt(peaks, 0.5, 4), 1); // the middle of the first slice
  assert.equal(levelAt(peaks, 2.5, 4), 0); // the middle of the third
  const between = levelAt(peaks, 1, 4); // half way from the loud slice to the quiet one
  assert.ok(between > 0.05 && between < 0.6, `blended, got ${between}`);
  assert.ok(levelAt(peaks, 0.6, 4) > levelAt(peaks, 0.9, 4), "and falling as the audio moves on");
});

test("a moment before the start or after the end still gives a sensible level", () => {
  const peaks = [100, 7, 100];
  close(levelAt(peaks, -3, 3), levelAt(peaks, 0, 3));
  close(levelAt(peaks, 99, 3), levelAt(peaks, 3, 3));
  assert.ok(levelAt(peaks, 3, 3) > 0.5, "the last slice is loud");
});

test("odd values in a stored waveform count as quiet instead of breaking it", () => {
  const level = levelAt([100, "loud", null, NaN, -5, 400] as never, 1.5, 3);
  assert.ok(level >= 0 && level <= 1 && Number.isFinite(level));
  assert.equal(levelAt([null, "x"] as never, 1, 2), 0);
  close(levelAt([9999], 0.5, 1), 1, 1e-9); // held to the loudest
});

test("without a waveform the movement is steady and always in range", () => {
  for (let seconds = 0; seconds < 10; seconds += 0.1) {
    const level = steadyLevel(seconds);
    assert.ok(level >= 0 && level <= 1, `${level} at ${seconds}`);
  }
  assert.equal(steadyLevel(NaN), 0.45);
});

test("the movement rises quickly and falls back more slowly, never overshooting", () => {
  const frame = 1 / 60;
  const rise = smoothLevel(0, 1, frame);
  const fall = 1 - smoothLevel(1, 0, frame);
  assert.ok(rise > fall, `rise ${rise} should be quicker than fall ${fall}`);
  assert.ok(rise > 0 && rise < 1 && fall > 0 && fall < 1);
  assert.equal(smoothLevel(0.4, 0.4, frame), 0.4);
  assert.equal(smoothLevel(0.4, 1, 0), 0.4, "no time, no movement");
  let level = 0;
  for (let i = 0; i < 600; i++) level = smoothLevel(level, 0.8, frame);
  close(level, 0.8, 1e-6);
  assert.ok(level <= 0.8);
});

test("the smoothing moves at the same speed at any frame rate", () => {
  let fast = 0;
  for (let i = 0; i < 12; i++) fast = smoothLevel(fast, 1, 1 / 240);
  let slow = 0;
  for (let i = 0; i < 3; i++) slow = smoothLevel(slow, 1, 1 / 60);
  close(fast, slow, 1e-9);
});

test("the icon sits still at level 0 and moves more as the level rises", () => {
  for (const seconds of [0, 0.37, 5.2])
    assert.deepEqual(poseFor(0, seconds), { x: 0, y: 0, rotate: 0, scale: 1 });
  const soft = poseFor(0.3, 1);
  const loud = poseFor(1, 1);
  assert.ok(Math.abs(loud.y) > Math.abs(soft.y));
  assert.ok(loud.scale > soft.scale);
  assert.ok(loud.y < 0, "it bounces up");
  assert.deepEqual(poseFor(7, 1), poseFor(1, 1), "held to the most it may move");
  assert.deepEqual(poseFor(NaN, 1), poseFor(0, 1));
  assert.ok(Math.abs(loud.rotate) <= 8 && Math.abs(loud.x) <= 3, "the shake is small");
});

test("the pose becomes a CSS transform", () => {
  assert.equal(
    poseCss({ x: 1.234, y: -6, rotate: 2.5, scale: 1.09 }),
    "translate(1.23px, -6.00px) rotate(2.50deg) scale(1.090)",
  );
});
