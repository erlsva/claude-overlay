/** The shapes the TTS endpoints send and receive. */

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
  status: "queued" | "running" | "complete" | "failed";
  message: string;
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

export type PlaybackState = {
  enabled: boolean;
  active: boolean;
  paused: boolean;
  volume?: number;
  clipId?: string;
  prompt?: string;
  sender?: string;
};

export type TtsState = { status: TtsStatus; playback: PlaybackState; clips: Clip[]; jobs: Job[] };

/** What the panel is given: whether an overlay is open, and what it is playing. */
export interface TtsPanelProps {
  overlayConnected: boolean;
  livePlayback: PlaybackState;
}
