import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { run } from "./ffmpeg.js";
import { PEAK_BARS, peaksFrom, peaksOfMp3 } from "./peaks.js";

test("peaks are whole numbers up to 100, following how loud each slice is", () => {
  // A quiet first half and a loud second half.
  const samples = Float32Array.from({ length: 6000 }, (_, at) => (at < 3000 ? 0.1 : 0.8));
  const peaks = peaksFrom(samples, 10);
  assert.equal(peaks.length, 10);
  assert.equal(Math.max(...peaks), 100);
  assert.ok(peaks[0] < peaks[9], "the quiet start is shorter than the loud end");
  assert.ok(peaks.every((peak) => Number.isInteger(peak) && peak >= 1 && peak <= 100));
  assert.equal(peaks[0], peaks[4], "equal loudness gives equal bars");
});

test("silence and very short audio still give a full row of bars", () => {
  const silent = peaksFrom(new Float32Array(5000), 8);
  assert.deepEqual(silent, Array(8).fill(silent[0]));
  assert.ok(silent[0] > 0 && silent[0] < 10);
  assert.equal(peaksFrom(Float32Array.from([0.5, -0.5, 0.25])).length, PEAK_BARS);
  assert.equal(peaksFrom(new Float32Array(0), 4).length, 4);
});

test("the waveform of a real MP3 shows its quiet, loud and near-silent parts", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tts-peaks-test-"));
  try {
    const mp3 = path.join(directory, "shaped.mp3");
    await run([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=180:duration=6",
      "-af",
      "volume='if(lt(t,2),0.1,if(lt(t,4),1,0.02))':eval=frame",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "64k",
      mp3,
    ]);
    const peaks = await peaksOfMp3(await readFile(mp3));
    assert.equal(peaks.length, PEAK_BARS);
    const middle = peaks[Math.floor(PEAK_BARS / 2)];
    assert.ok(middle >= 95, `the loud middle is near full height, got ${middle}`);
    assert.ok(peaks[5] > 10 && peaks[5] < 45, `the quiet start is low, got ${peaks[5]}`);
    assert.ok(
      peaks[PEAK_BARS - 4] < 20,
      `the near-silent end is lowest, got ${peaks[PEAK_BARS - 4]}`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("something that is not audio is refused instead of giving a made-up waveform", async () => {
  await assert.rejects(peaksOfMp3(Buffer.from("this is not an mp3")));
});
