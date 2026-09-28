/** The shapes the TTS endpoints send and receive. */

import type { ActivityItem, TtsPlaybackState } from "../../types";

export type Clip = {
  id: string;
  token: string;
  prompt: string;
  sender: string;
  createdAt: string;
  duration: number;
};

export type Job = {
  id: string;
  createdAt?: string;
  status: "queued" | "running" | "complete" | "failed" | "cancelled";
  message: string;
  /** What was asked for (shortened) and who asked: shown in the queue. */
  prompt?: string;
  sender?: string;
  /** Whether it will play on the overlay once made. */
  willPlay?: boolean;
  /** How far a running request has got: being made, made and ready, or playing. */
  stage?: "making" | "ready" | "playing";
  /** Held back: TTS is paused, or the silence between clips. */
  waiting?: boolean;
  error?: string;
  warning?: string;
  clip?: Clip;
};

type Scene = {
  dialogue?: string;
  sound?: string;
  character?: string;
  delivery?: string;
  effect?: string;
  duration?: number | null;
  speechRate?: number;
};

export type Plan = { planId: string; scenes: Scene[]; warnings: string[] };

export type TtsStatus = {
  configured: boolean;
  canReplay: boolean;
  storageProvider: string;
  services: {
    openai: boolean;
    elevenlabs: boolean;
    ffmpeg: boolean;
    metadata: boolean;
    audioStorage: boolean;
  };
};

/** What the server shares about TTS playback: paused or not, what waits, and what is playing. */
export type PlaybackState = TtsPlaybackState;

export type TtsState = {
  status: TtsStatus;
  playback: PlaybackState;
  clips: Clip[];
  jobs: Job[];
  /** The requests waiting for their turn, next first. */
  queue: Job[];
};

/** What the panel is given: whether an overlay is open, and what it is playing. */
export interface TtsPanelProps {
  overlayConnected: boolean;
  livePlayback: PlaybackState;
  /** Owner or a whitelisted admin: who can issue and revoke TTS remote (Stream Deck) tokens. */
  isAdmin: boolean;
  /** Recent remote-control activity (a Stream Deck press, say), newest first. */
  recentRemoteActivity: ActivityItem[];
}

/** A named bearer token for controlling TTS from outside the dashboard (a Stream Deck, say). */
export type RemoteToken = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
};
