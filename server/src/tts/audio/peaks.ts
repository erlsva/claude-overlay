/**
 * The waveform of a saved clip: how loud each equal slice of it is. It is worked out once, when
 * the clip is made, and stored with the clip, so the public clip page can draw the real shape
 * without downloading any audio (a browser cannot read the audio from where it is stored).
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readWav } from "../dsp/index.js";
import { decodeToWav } from "./ffmpeg.js";

/** How many bars a clip's waveform has. */
export const PEAK_BARS = 60;

/** The quietest a bar is stored, out of 100, so silence still shows as a dot. */
const FLOOR = 7;

/**
 * Whole numbers from 0 to 100, one per bar: the RMS loudness of each slice, scaled so the loudest
 * slice is 100 and eased with a power below 1, so quiet speech does not vanish next to a shout.
 */
export function peaksFrom(samples: ArrayLike<number>, bars: number = PEAK_BARS): number[] {
  const size = Math.max(1, Math.floor(samples.length / bars));
  const loudness: number[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const from = bar * size;
    const to = Math.min(samples.length, from + size);
    let sum = 0;
    for (let at = from; at < to; at++) sum += samples[at] * samples[at];
    loudness.push(to > from ? Math.sqrt(sum / (to - from)) : 0);
  }
  const loudest = Math.max(...loudness);
  return loudness.map((value) =>
    loudest > 0 ? Math.max(FLOOR, Math.round(Math.pow(value / loudest, 0.6) * 100)) : FLOOR,
  );
}

/** The waveform of an MP3, decoded with ffmpeg in a temporary folder that is always removed. */
export async function peaksOfMp3(bytes: Buffer): Promise<number[]> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tts-peaks-"));
  try {
    const input = path.join(directory, "clip.mp3");
    const output = path.join(directory, "clip.wav");
    await writeFile(input, bytes);
    await decodeToWav(input, output);
    return peaksFrom(readWav(await readFile(output)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
