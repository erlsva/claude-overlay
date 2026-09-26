import assert from "node:assert/strict";
import test from "node:test";
import {
  BARS,
  clampFraction,
  fallbackPeaks,
  formatLength,
  formatTime,
  storedPeaks,
  waveMask,
} from "../src/support/waveform.ts";

test("time reads as minutes and whole seconds, and bad input reads as zero", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(5.9), "0:05");
  assert.equal(formatTime(20), "0:20");
  assert.equal(formatTime(65), "1:05");
  assert.equal(formatTime(600), "10:00");
  for (const bad of [-3, NaN, Infinity, -Infinity]) assert.equal(formatTime(bad), "0:00");
});

test("a clip's length rounds to the nearest second and is never zero", () => {
  assert.equal(formatLength(19.6), "0:20");
  assert.equal(formatLength(19.4), "0:19");
  assert.equal(formatLength(0.2), "0:01");
  assert.equal(formatLength(0), "0:00");
  assert.equal(formatLength(NaN), "0:00");
  assert.equal(formatLength(89.6), "1:30");
});

test("a position is held between the two ends of the bar", () => {
  assert.equal(clampFraction(-0.2), 0);
  assert.equal(clampFraction(0.4), 0.4);
  assert.equal(clampFraction(7), 1);
  assert.equal(clampFraction(NaN), 0);
});

test("a stored waveform becomes bar heights, and anything odd is refused", () => {
  assert.deepEqual(storedPeaks([0, 50, 100]), [0, 0.5, 1]);
  assert.deepEqual(storedPeaks([250, -20]), [1, 0], "out-of-range values are held to the bar");
  for (const bad of [undefined, null, "12", {}, [], [1, "2"], [1, NaN], Array(201).fill(5)])
    assert.equal(storedPeaks(bad), null, JSON.stringify(bad)?.slice(0, 30));
});

test("the stand-in shape is repeatable per clip, different between clips, and in range", () => {
  const one = fallbackPeaks("0".repeat(31) + "1");
  assert.equal(one.length, BARS);
  assert.deepEqual(one, fallbackPeaks("0".repeat(31) + "1"));
  assert.notDeepEqual(one, fallbackPeaks("0".repeat(31) + "2"));
  assert.ok(one.every((peak) => peak > 0 && peak <= 1));
  assert.equal(fallbackPeaks("x", 12).length, 12);
});

test("the mask is one self-contained image with a bar per peak", () => {
  const mask = waveMask([0, 0.5, 1]);
  assert.match(mask, /^url\("data:image\/svg\+xml,/);
  const svg = decodeURIComponent(mask.slice(mask.indexOf(",") + 1, -2));
  assert.equal(svg.match(/<rect /g)?.length, 3);
  assert.doesNotMatch(svg, /<script|href=|on\w+=/i);
  // Out-of-range peaks are held to the image instead of drawing past it.
  const wild = decodeURIComponent(waveMask([9, -4]).slice(0, -2));
  assert.doesNotMatch(wild, /height="(?:4[5-9]|[5-9]\d|\d{3,})"|height="-/);
});
