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
  /** Fireworks: how much smaller than a full emote a spark is drawn. */
  sizeFactor?: number;
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
}
