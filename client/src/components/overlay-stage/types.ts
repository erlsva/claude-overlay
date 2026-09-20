import type {
  CanvasElement,
  CursorPayload,
  DrawStroke,
  DvdCelebrationSettings,
  MediaControlPayload,
} from "../../types";

export interface OverlayStageHandle {
  applyControl: (payload: MediaControlPayload) => void;
}

export interface LiveStroke {
  userId: string;
  points: Array<[number, number]>;
  color: string;
  size: number;
  eraser: boolean;
}

export interface OverlayStageProps {
  elements: CanvasElement[];
  cursors?: Map<string, CursorPayload>;
  dvdCelebrationSettings?: DvdCelebrationSettings;
  strokes?: DrawStroke[];
  liveStrokes?: Map<string, LiveStroke>;
  onMediaEnded?: (id: string) => void;
}

export interface CornerParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

/** Where a node is drawn (`pos`) and where it is heading (`target`), in stream pixels. */
export interface NodePosition {
  x: number;
  y: number;
  rotation: number;
}

/** What is remembered about a bouncing element to detect when it hits a corner. */
export interface DvdBounceState {
  x: number;
  y: number;
  dx: number;
  dy: number;
  lastXBounce: number;
  lastYBounce: number;
  lastXEdge: "left" | "right";
  lastYEdge: "top" | "bottom";
  lastCelebration: number;
}
