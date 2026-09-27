import assert from "node:assert/strict";
import test from "node:test";
import { barLabel, panelStatus, parseGap } from "../src/components/tts/statusText.ts";

const state = (over: Partial<Parameters<typeof panelStatus>[0]> = {}) => ({
  held: false,
  waiting: 0,
  active: false,
  paused: false,
  ...over,
});

test("the panel says whether TTS is running or paused, and what is waiting", () => {
  assert.deepEqual(panelStatus(state()), {
    title: "TTS is running",
    detail: "No active playback",
  });
  assert.equal(panelStatus(state({ active: true })).detail, "Playing on the overlay");
  assert.equal(
    panelStatus(state({ active: true, paused: true })).detail,
    "Clip paused on the overlay",
  );
  assert.equal(panelStatus(state({ waiting: 2 })).detail, "2 requests waiting for their turn");

  assert.equal(panelStatus(state({ held: true })).title, "TTS is paused");
  assert.equal(
    panelStatus(state({ held: true })).detail,
    "New requests will wait until you resume.",
  );
  assert.equal(
    panelStatus(state({ held: true, waiting: 1 })).detail,
    "1 request waiting. They play when you resume.",
  );
  assert.equal(
    panelStatus(state({ held: true, waiting: 5 })).detail,
    "5 requests waiting. They play when you resume.",
  );
});

test("a clip still playing when TTS is paused does not change what the panel says", () => {
  // It finishes on its own; the pause is about what comes next.
  assert.equal(panelStatus(state({ held: true, active: true })).title, "TTS is paused");
});

test("the top bar shows the state in a few words", () => {
  assert.equal(barLabel({ held: false, waiting: 3 }), "TTS active");
  assert.equal(barLabel({ held: true, waiting: 0 }), "TTS paused");
  assert.equal(barLabel({ held: true, waiting: 4 }), "TTS paused · 4 waiting");
});

test("a typed gap is a whole number of seconds within the limit, or nothing", () => {
  assert.equal(parseGap("7", 30), 7);
  assert.equal(parseGap(" 0 ", 30), 0);
  assert.equal(parseGap("30", 30), 30);
  for (const bad of ["31", "-1", "", "  ", "7.5", "abc", "1e2", "٧"])
    assert.equal(parseGap(bad, 30), null, JSON.stringify(bad));
});
