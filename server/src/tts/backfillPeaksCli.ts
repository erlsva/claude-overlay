/**
 * Fills in the waveform of saved clips that have none:
 *
 *   npm run backfill:peaks -- --dry-run --limit=3   try it on a few clips, storing nothing
 *   npm run backfill:peaks                          do every clip that has none
 *
 * It reads each clip's MP3 from where it is stored (inbound traffic; nothing is sent to
 * visitors) and writes the result into the clip's stored details, using whichever database
 * DATABASE_URL points at. Needs ffmpeg and the Discord webhook settings from server/.env.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { ffmpegAvailable, peaksOfMp3 } from "./audio/index.js";
import { backfillPeaks } from "./backfill.js";
import { audioUrl } from "./discord.js";
import { clipIdsWithoutPeaks, getClip, setClipPeaks } from "./store.js";

const MAX_BYTES = 10 * 1024 * 1024;

async function loadMp3(id: string): Promise<Buffer> {
  const clip = await getClip(id);
  if (!clip) throw new Error("the clip no longer exists");
  const response = await fetch(await audioUrl(clip), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`the audio store answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("the audio is larger than expected");
  return bytes;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : undefined;
if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1)) {
  console.error("--limit needs a whole number of at least 1.");
  process.exit(1);
}

if (!(await ffmpegAvailable())) {
  console.error("ffmpeg was not found. Install it or set FFMPEG_PATH.");
  process.exit(1);
}
const ids = await clipIdsWithoutPeaks();
console.log(
  `${ids.length} clip${ids.length === 1 ? "" : "s"} without a waveform${dryRun ? " (dry run)" : ""}.`,
);
const result = await backfillPeaks(
  {
    ids,
    load: loadMp3,
    peaks: peaksOfMp3,
    save: setClipPeaks,
    // Discord allows only a few webhook requests every couple of seconds.
    pause: () => sleep(700),
    log: (line) => console.log(line),
  },
  { dryRun, limit },
);
console.log(
  `Done: ${result.done} ${dryRun ? "checked" : "stored"}, ${result.failed} failed, ${result.left} left for another run.`,
);
// The database connection would otherwise keep the process open.
process.exit(result.failed > 0 ? 1 : 0);
