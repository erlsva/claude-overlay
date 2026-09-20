/** Running ffmpeg, and the final loudness filters every finished clip goes through. */

import { spawn } from "node:child_process";

export const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";

// Keep alerts present in a stream mix while retaining expressive dynamics and
// a true-peak safety margin. The OBS volume control still defaults to 25%.
export const FINAL_TTS_FILTER = "loudnorm=I=-14:TP=-1.5:LRA=15";

// Standalone effects sit lower than speech alerts, and retain extra peak
// headroom for sharp transients such as explosions and screams.
export const FINAL_SOUND_EFFECT_FILTER = "loudnorm=I=-18:TP=-3:LRA=12";

let ffmpegReadiness: Promise<boolean> | undefined;

export function ffmpegAvailable(): Promise<boolean> {
  if (!ffmpegReadiness)
    ffmpegReadiness = new Promise((resolve) => {
      const child = spawn(ffmpeg, ["-version"], { windowsHide: true, stdio: "ignore" });
      const timer = setTimeout(() => {
        child.kill();
        resolve(false);
      }, 5000);
      child.once("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    });
  return ffmpegReadiness;
}

export function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args], {
      windowsHide: true,
    });
    let error = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Audio processing timed out."));
    }, 120000);
    child.stderr.on("data", (d) => {
      error = (error + d).slice(-4000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`FFmpeg could not start: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`Audio processing failed: ${error}`));
    });
  });
}

export function atempoFilters(tempo: number): string[] {
  const filters: string[] = [];
  let remaining = tempo;
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  // Chaining atempo at 2x or below avoids FFmpeg's high-ratio sample skipping.
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  if (Math.abs(remaining - 1) > 0.001) filters.push(`atempo=${remaining.toFixed(6)}`);
  return filters;
}

/** Decodes any audio file to mono 16-bit 44.1 kHz WAV, optionally through a filter chain. */
export function decodeToWav(input: string, output: string, filter = "anull"): Promise<void> {
  return run(["-i", input, "-af", filter, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", output]);
}
