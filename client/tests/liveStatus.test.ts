import assert from "node:assert/strict";
import test from "node:test";
import { channelLabel, summarizeLive, tabTitle } from "../src/support/liveStatus.ts";

const ok = (value: boolean): PromiseSettledResult<boolean> => ({ status: "fulfilled", value });
const failed: PromiseSettledResult<boolean> = { status: "rejected", reason: new Error("down") };

test("the tab shows (LIVE) only while a stream is on", () => {
  assert.equal(tabTitle("Stream Overlay | Vicksy", true), "(LIVE) Stream Overlay | Vicksy");
  assert.equal(tabTitle("Stream Overlay | Vicksy", false), "Stream Overlay | Vicksy");
  assert.equal(channelLabel("vicksy"), "Vicksy");
  assert.equal(channelLabel("eple7"), "Eple7");
});

test("several channels are live if any one is", () => {
  assert.deepEqual(summarizeLive([ok(false), ok(true)]), { live: true, allFailed: false });
  assert.deepEqual(summarizeLive([ok(false), ok(false)]), { live: false, allFailed: false });
  // One channel that could not be checked does not hide the other one being live.
  assert.deepEqual(summarizeLive([failed, ok(true)]), { live: true, allFailed: false });
});

test("a server that cannot be reached is not the same as nobody being live", () => {
  assert.deepEqual(summarizeLive([failed, failed]), { live: false, allFailed: true });
  assert.deepEqual(summarizeLive([failed]), { live: false, allFailed: true });
  assert.deepEqual(summarizeLive([]), { live: false, allFailed: false });
});
