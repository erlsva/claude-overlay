export type AccountVoice = {
  voice_id: string;
  name: string;
  description?: string | null;
  /** premade voices ship with ElevenLabs; anything else was created in this account. */
  category?: string | null;
  labels?: Record<string, string>;
};

export type Casting = {
  scene: number;
  character: string;
  voiceId: string;
  voiceName: string;
  fallback: boolean;
  /** The voice was matched to the character by name, so it is already the right sound. */
  pinned: boolean;
};
