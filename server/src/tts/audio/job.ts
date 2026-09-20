import type { Casting } from "../casting.js";
import type { Scene } from "../shared/scene.js";

/** Everything a render is asked to do. */
export type RenderOptions = {
  id: string;
  scenes: Scene[];
  mode: "demo" | "elevenlabs";
  key: string;
  voices: Record<string, string>;
  casting?: Casting[];
  dataDir: string;
  progress: (message: string) => void;
  warning?: (message: string) => void;
};

/** One render in progress: its options and the scratch folder its files are written to. */
export type RenderJob = { opts: RenderOptions; temp: string };

/** Where the last spoken word sits in the speech, in seconds; effects like echo repeat it. */
export type WordTiming = { start: number; end: number };

/** "Scene 2/5", the prefix of every progress line. */
export const sceneLabel = (job: RenderJob, index: number) =>
  `Scene ${index + 1}/${job.opts.scenes.length}`;

export const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
