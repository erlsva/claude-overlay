/**
 * Gives saved clips that predate stored waveforms one, so their public page can draw the real
 * shape. Clips made from now on get theirs when they are created. It is safe to run again: it only
 * looks at clips that still have none, and one clip failing does not stop the rest.
 */

export interface BackfillDeps {
  /** The clips that have no waveform yet, in the order to do them. */
  ids: string[];
  /** The clip's MP3. Throws when it cannot be had. */
  load: (id: string) => Promise<Buffer>;
  /** Works the waveform out of an MP3. */
  peaks: (bytes: Buffer) => Promise<number[]>;
  /** Stores it. False when the clip has been deleted since. */
  save: (id: string, peaks: number[]) => Promise<boolean>;
  /** Waits between clips, so the store's rate limit is respected. */
  pause?: () => Promise<void>;
  log?: (line: string) => void;
}

export interface BackfillResult {
  /** Clips whose waveform was worked out (and stored, unless it was a dry run). */
  done: number;
  failed: number;
  /** Clips that had no waveform and were left for another run because of `limit`. */
  left: number;
}

export async function backfillPeaks(
  deps: BackfillDeps,
  options: { dryRun?: boolean; limit?: number } = {},
): Promise<BackfillResult> {
  const log = deps.log ?? (() => {});
  const wanted = options.limit === undefined ? deps.ids : deps.ids.slice(0, options.limit);
  let done = 0;
  let failed = 0;
  for (const [index, id] of wanted.entries()) {
    if (index > 0) await deps.pause?.();
    const label = `${index + 1}/${wanted.length} ${id.slice(0, 8)}`;
    try {
      const peaks = await deps.peaks(await deps.load(id));
      if (options.dryRun) {
        log(`${label}: would store ${peaks.length} bars, e.g. ${peaks.slice(0, 12).join(",")}…`);
      } else if (await deps.save(id, peaks)) {
        log(`${label}: stored`);
      } else {
        log(`${label}: the clip no longer exists, skipped`);
        continue;
      }
      done++;
    } catch (error) {
      failed++;
      log(`${label}: failed (${error instanceof Error ? error.message : "unknown error"})`);
    }
  }
  return { done, failed, left: deps.ids.length - wanted.length };
}
