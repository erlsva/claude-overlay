import type { ChatEmoteSettings, ChatEmoteSpawn } from "../../types";

export interface Particle extends ChatEmoteSpawn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bornAt: number;
  aspectRatio: number;
  sequenceAspectRatios: number[];
  overlayAspectRatios: number[][];
  stackAspectRatios: number[];
  cornerWaypointIndex?: number;
  cornerDirection?: "left" | "right";
  /** Fireworks: one of the small copies a rocket bursts into. */
  spark?: boolean;
  /** How much smaller than a full emote it is drawn (fireworks sparks, slide-in pop-away). */
  sizeFactor?: number;
  /** Squash and stretch, used by pinball. */
  scaleX?: number;
  scaleY?: number;
  /** Per-emote numbers the newer movement modes keep between frames. */
  state?: MotionState;
}

/** What a movement mode remembers about one emote. Which fields are used depends on the mode. */
export interface MotionState {
  /** A random offset so emotes do not all wave in step. */
  phase: number;
  angle?: number;
  radiusX?: number;
  radiusY?: number;
  omega?: number;
  centerX?: number;
  centerY?: number;
  startX?: number;
  startY?: number;
  targetX?: number;
  targetY?: number;
  baseX?: number;
  swayAmp?: number;
  swayRate?: number;
  squashAt?: number;
  squashAxis?: "x" | "y";
}

export interface ChatEmoteLayerProps {
  spawn: ChatEmoteSpawn | null;
  settings: ChatEmoteSettings;
  preview?: boolean;
  /** Preview only: true while any emote is on screen. */
  onActiveChange?: (active: boolean) => void;
  /** Preview only: changing this number removes every emote right away. */
  clearSignal?: number;
}

/** What the layer knows about the frame it is animating. */
export interface FrameEnv {
  settings: ChatEmoteSettings;
  /** 1 on the overlay, smaller in the dashboard preview. */
  scale: number;
  width: number;
  height: number;
  /** Height of one emote, in pixels. */
  size: number;
  labelHeight: number;
  now: number;
  /** Seconds since the previous frame. */
  dt: number;
  /** Every emote currently on screen, for modes where emotes react to each other. */
  particles: Particle[];
}
