import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-remote-activity-"));

const { describeRemoteAction, recordRemoteActivity } = await import("./remoteActivity.js");
const { canvasStore } = await import("../state/canvasStore.js");

const state = (overrides: Partial<Parameters<typeof describeRemoteAction>[3]> = {}) => ({
  held: false,
  paused: false,
  volume: 0.5,
  emotes: { enabled: true, direction: "left" as const, size: 40, motion: "floor" },
  ...overrides,
});

test("status (and anything unrecognized) is never shown in the activity feed", () => {
  assert.equal(describeRemoteAction("status", false, undefined, state()), undefined);
  assert.equal(describeRemoteAction("something-made-up", false, undefined, state()), undefined);
});

test("a real change reads naturally, and a no-op says why nothing happened", () => {
  assert.equal(describeRemoteAction("pause-tts", true, undefined, state()), "paused TTS");
  assert.equal(
    describeRemoteAction("pause-tts", false, undefined, state()),
    "tried to pause TTS, but it was already paused",
  );
  assert.equal(describeRemoteAction("skip", true, undefined, state()), "skipped the TTS clip");
  assert.equal(
    describeRemoteAction("skip", false, undefined, state()),
    "pressed Skip, but nothing was playing",
  );
});

test("toggle actions read from the resulting state, since 'changed' alone doesn't say which way", () => {
  assert.equal(
    describeRemoteAction("toggle-tts", true, undefined, state({ held: true })),
    "paused TTS",
  );
  assert.equal(
    describeRemoteAction("toggle-tts", true, undefined, state({ held: false })),
    "resumed TTS",
  );
  assert.equal(
    describeRemoteAction("toggle-emotes", true, undefined, state({ emotes: state().emotes })),
    "turned the chat emote overlay on",
  );
});

test("volume actions report a percentage, from the state, not the raw 0-1 value", () => {
  assert.equal(
    describeRemoteAction("volume", true, 0.6, state({ volume: 0.6 })),
    "set the TTS volume to 60%",
  );
  assert.equal(
    describeRemoteAction("volume", false, 0.6, state({ volume: 0.6 })),
    "the TTS volume was already 60%",
  );
  assert.equal(
    describeRemoteAction("volume-up", false, undefined, state()),
    "the TTS volume was already at its maximum",
  );
});

test("emote size and style actions read the resulting value", () => {
  assert.equal(
    describeRemoteAction(
      "emote-size-up",
      true,
      undefined,
      state({ emotes: { ...state().emotes, size: 45 } }),
    ),
    "set the chat emote size to 45",
  );
  assert.equal(
    describeRemoteAction(
      "emote-style-next",
      true,
      undefined,
      state({ emotes: { ...state().emotes, motion: "rain" } }),
    ),
    'set the chat emote style to "rain"',
  );
});

test("recordRemoteActivity adds a line naming the token, and broadcasts studio:sync to dashboards", () => {
  canvasStore.activity = [];
  const emitted: unknown[][] = [];
  const io = {
    to: (room: string) => ({ emit: (...args: unknown[]) => emitted.push([room, ...args]) }),
  } as any;
  recordRemoteActivity(io, "Office Stream Deck", "skipped the TTS clip");
  assert.equal(canvasStore.activity.length, 1);
  assert.equal(canvasStore.activity[0].user, "Office Stream Deck");
  assert.equal(canvasStore.activity[0].action, "skipped the TTS clip");
  assert.equal(canvasStore.activity[0].source, "remote", "so the dashboard can tell it apart");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0][0], "dashboard");
  assert.equal(emitted[0][1], "studio:sync");
  assert.deepEqual((emitted[0][2] as any).activity[0], canvasStore.activity[0]);
});
