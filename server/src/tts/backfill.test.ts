import assert from "node:assert/strict";
import test from "node:test";
import { backfillPeaks } from "./backfill.js";

function fakes(overrides: { fail?: string[]; gone?: string[] } = {}) {
  const saved: Array<[string, number[]]> = [];
  const log: string[] = [];
  let pauses = 0;
  return {
    saved,
    log,
    pauses: () => pauses,
    deps: (ids: string[]) => ({
      ids,
      load: async (id: string) => {
        if (overrides.fail?.includes(id)) throw new Error("the audio store answered 404");
        return Buffer.from(id);
      },
      peaks: async (bytes: Buffer) => [bytes.length, 50, 100],
      save: async (id: string, peaks: number[]) => {
        if (overrides.gone?.includes(id)) return false;
        saved.push([id, peaks]);
        return true;
      },
      pause: async () => {
        pauses++;
      },
      log: (line: string) => log.push(line),
    }),
  };
}

const ids = ["aaaaaaaa1", "bbbbbbbb22", "cccccccc333"];

test("every clip without a waveform is worked out and stored, pausing between clips", async () => {
  const run = fakes();
  const result = await backfillPeaks(run.deps(ids));
  assert.deepEqual(result, { done: 3, failed: 0, left: 0 });
  assert.deepEqual(
    run.saved.map(([id]) => id),
    ids,
  );
  assert.deepEqual(run.saved[1][1], [10, 50, 100]);
  assert.equal(run.pauses(), 2, "a pause between clips, not before the first");
});

test("one clip failing is reported and does not stop the others", async () => {
  const run = fakes({ fail: ["bbbbbbbb22"] });
  const result = await backfillPeaks(run.deps(ids));
  assert.deepEqual(result, { done: 2, failed: 1, left: 0 });
  assert.deepEqual(
    run.saved.map(([id]) => id),
    ["aaaaaaaa1", "cccccccc333"],
  );
  assert.ok(run.log.some((line) => line.includes("bbbbbbbb") && line.includes("failed")));
});

test("a clip deleted while it ran is skipped, not counted as done", async () => {
  const run = fakes({ gone: ["aaaaaaaa1"] });
  const result = await backfillPeaks(run.deps(ids));
  assert.deepEqual(result, { done: 2, failed: 0, left: 0 });
  assert.ok(run.log.some((line) => line.includes("no longer exists")));
});

test("a dry run works everything out and stores nothing", async () => {
  const run = fakes();
  const result = await backfillPeaks(run.deps(ids), { dryRun: true });
  assert.deepEqual(result, { done: 3, failed: 0, left: 0 });
  assert.equal(run.saved.length, 0);
  assert.ok(run.log.every((line) => line.includes("would store")));
});

test("a limit does only that many, and says how many are left", async () => {
  const run = fakes();
  const result = await backfillPeaks(run.deps(ids), { limit: 2 });
  assert.deepEqual(result, { done: 2, failed: 0, left: 1 });
  assert.equal(run.saved.length, 2);
  assert.deepEqual(await backfillPeaks(run.deps([])), { done: 0, failed: 0, left: 0 });
});
