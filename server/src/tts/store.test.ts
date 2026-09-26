import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "overlay-store-"));

const { clipIdsWithoutPeaks, getClip, listClips, saveClip, searchClips, setClipPeaks } =
  await import("./store.js");

const clip = (n: number, extra: Record<string, unknown> = {}) => {
  const id = n.toString(16).padStart(32, "0");
  return {
    id,
    token: `(TTS:${id})`,
    prompt: `clip number ${n}`,
    sender: "viewer",
    createdAt: new Date(2026, 8, n).toISOString(),
    duration: 3,
    discordMessageId: `message-${n}`,
    ...extra,
  };
};

test("a waveform can be added to a saved clip, and only clips without one are listed as missing", async () => {
  await saveClip(clip(1));
  await saveClip(clip(2, { peaks: [10, 100, 40] }));
  await saveClip(clip(3));

  assert.deepEqual(await clipIdsWithoutPeaks(), [clip(3).id, clip(1).id]);
  assert.equal(await setClipPeaks(clip(1).id, [5, 50, 100]), true);
  assert.deepEqual(await clipIdsWithoutPeaks(), [clip(3).id]);
  assert.deepEqual((await getClip(clip(1).id))?.peaks, [5, 50, 100]);
});

test("a waveform is never added to a clip that does not exist", async () => {
  assert.equal(await setClipPeaks("f".repeat(32), [1, 2, 3]), false);
  assert.equal(await getClip("f".repeat(32)), undefined);
});

test("lists and searches leave the waveform out, but opening one clip has it", async () => {
  for (const shown of [
    ...(await listClips()),
    ...(await searchClips({ query: "", limit: 10, offset: 0 })).clips,
  ])
    assert.equal("peaks" in shown, false, `${shown.id} should not carry its waveform`);
  assert.deepEqual((await getClip(clip(2).id))?.peaks, [10, 100, 40]);
});
