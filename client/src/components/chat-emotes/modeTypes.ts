import type { ChatEmoteSettings } from "../../types";
import type { StepResult } from "./fireworks";
import type { FrameEnv, MotionState, Particle } from "./types";

/** What a mode needs to know to place a new emote. */
export interface SpawnEnv {
  settings: ChatEmoteSettings;
  existing: Particle[];
  width: number;
  height: number;
  scale: number;
  size: number;
  labelHeight: number;
  particleWidth: number;
  /** Movement speed in pixels per second, already scaled. */
  speed: number;
}

export interface Start {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state?: MotionState;
}

/** One movement mode: where an emote starts, and how it moves each frame. */
export interface ModeImpl {
  /** Leave out to start like the wall bounce. */
  spawn?: (env: SpawnEnv) => Start;
  step: (particle: Particle, node: HTMLElement | undefined, env: FrameEnv) => StepResult;
}
