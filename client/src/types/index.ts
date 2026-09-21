// Generated from shared/types.ts. Edit that file, then run: node scripts/sync-shared.mjs

export type MediaType = "image" | "gif" | "video" | "audio" | "text";

export interface CanvasElement {
  id: string;
  type: MediaType;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  visible: boolean;
  zIndex: number;
  groupId?: string | null;
  groupName?: string;
  displayName?: string;
  mediaCurrentTime?: number;
  mediaPaused?: boolean;
  mediaVolume?: number;
  autoVisibility?: boolean;
  dvdEnabled?: boolean;
  dvdStartedAt?: number;
  dvdStartX?: number;
  dvdStartY?: number;
  dvdVelocityX?: number;
  dvdVelocityY?: number;
  locked?: boolean;
  opacity?: number;
  enterAnimation?: ElementAnimation;
  exitAnimation?: ElementAnimation;
  flyStartedAt?: number;
  flyDurationMs?: number;
  flyFromX?: number;
  flyFromY?: number;
  flyToX?: number;
  flyToY?: number;
  effectAnimation?: ElementEffectAnimation;
  effectId?: string;
  effectStartedAt?: number;
  effectDurationMs?: number;
}

export type ElementAnimation =
  "none" | "fade" | "pop" | "slide-left" | "slide-right" | "slide-up" | "slide-down" | "spin";
export type ElementEffectAnimation =
  "pop" | "pulse" | "spin" | "shake" | "bounce" | "float" | "sway" | "heartbeat";
export interface SavedScene {
  id: string;
  name: string;
  elements: CanvasElement[];
  strokes: DrawStroke[];
  updatedAt: string;
}
export interface ElementPreset {
  id: string;
  name: string;
  elements: CanvasElement[];
  createdAt: string;
}
export interface SoundboardItem {
  id: string;
  name: string;
  url: string;
  volume: number;
}
export type TriggerEventType =
  | "chat-command"
  | "follow"
  | "subscribe"
  | "gift-subscribe"
  | "raid"
  | "bits"
  | "channel-points"
  | "ban"
  | "timeout"
  | "prediction";
export type TriggerActionType =
  | "show-element"
  | "show-temporary"
  | "fly-across"
  | "hide-element"
  | "toggle-element"
  | "play-media"
  | "play-sound"
  | "enable-dvd"
  | "refresh-overlay"
  | "send-chat"
  | "tts";
export type TriggerPlacement =
  | "current"
  | "random"
  | "fit"
  | "fill"
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
export type FlyDirection =
  | "left-to-right-top"
  | "left-to-right-center"
  | "left-to-right-bottom"
  | "right-to-left-top"
  | "right-to-left-center"
  | "right-to-left-bottom"
  | "top-to-bottom-left"
  | "top-to-bottom-center"
  | "top-to-bottom-right"
  | "bottom-to-top-left"
  | "bottom-to-top-center"
  | "bottom-to-top-right";
export type ChatPermission = "everyone" | "vip" | "moderator" | "streamer";
export interface TriggerStep {
  action: TriggerActionType;
  targetId?: string;
  placement?: TriggerPlacement;
  durationSeconds?: number;
  flyDirection?: FlyDirection;
  timing?: "immediate" | "delay" | "after-previous";
  delaySeconds?: number;
  chatMessage?: string;
  ttsErrorMessage?: string;
}
export interface TtsPlaybackState {
  enabled: boolean;
  active: boolean;
  paused: boolean;
  volume?: number;
  clipId?: string;
  prompt?: string;
  sender?: string;
}
export interface FeatureFlags {
  tts: boolean;
  scenes: boolean;
}
export interface OverlayTrigger extends TriggerStep {
  id: string;
  name: string;
  enabled: boolean;
  event: TriggerEventType;
  match?: string;
  minimum?: number;
  channel?: string;
  cooldownSeconds: number;
  permission?: ChatPermission;
  steps?: TriggerStep[];
}
export interface ActivityItem {
  id: string;
  at: string;
  user: string;
  action: string;
}
export interface StudioState {
  scenes: SavedScene[];
  presets: ElementPreset[];
  sounds: SoundboardItem[];
  triggers: OverlayTrigger[];
  activity: ActivityItem[];
  twitchConnected: boolean;
}

export interface CanvasState {
  elements: CanvasElement[];
}
export interface DvdCelebrationSettings {
  volume: number;
  soundUrl: string | null;
  counterPosition:
    "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
}
/** How chat emotes move across the overlay. */
export const CHAT_EMOTE_MOTIONS = [
  "walls",
  "floor",
  "parade",
  "corners",
  "pop-walls",
  "pop-floor",
  "fireworks",
  "drift",
  "rain",
  "snow",
  "rise",
  "orbit",
  "slide",
  "pinball",
  "pile",
  "conga",
] as const;
export type ChatEmoteMotion = (typeof CHAT_EMOTE_MOTIONS)[number];

export interface ChatEmoteSettings {
  enabled: boolean;
  showNames: boolean;
  nameBackgroundEnabled: boolean;
  nameBackgroundColor: string;
  nameFontSize: number;
  motion: ChatEmoteMotion;
  direction: "left" | "right";
  gravity: number;
  size: number;
  speed: number;
  lifetimeSeconds: number;
  maxVisible: number;
  blacklist: string[];
  additionalEmotes: string[];
  blockedEmotes: string[];
}
export interface ChatEmoteSpawn {
  id: string;
  emoteId: string;
  name: string;
  imageUrl: string;
  overlays?: Array<{ emoteId: string; name: string; imageUrl: string }>;
  additional?: Array<{
    id: string;
    emoteId: string;
    name: string;
    imageUrl: string;
    overlays?: Array<{ emoteId: string; name: string; imageUrl: string }>;
  }>;
  sender: string;
  senderLogin?: string;
  senderColor?: string;
}

export interface ElementAddedPayload {
  element: CanvasElement;
}
export interface ElementUpdatedPayload {
  id: string;
  changes: Partial<CanvasElement>;
}
export interface ElementRemovedPayload {
  id: string;
}
export interface MediaControlPayload {
  id: string;
  action: "play" | "pause" | "seek";
  currentTime: number;
}

export interface CursorPayload {
  userId: string;
  login: string;
  displayName: string;
  avatar: string;
  color: string;
  x: number;
  y: number;
}

export type UserRole = "owner" | "streamer" | "super-moderator" | "moderator";

export interface UserPresencePayload {
  userId: string;
  login: string;
  displayName: string;
  avatar: string;
  color: string;
  role?: UserRole;
}

export interface DrawStroke {
  id: string;
  points: Array<[number, number]>;
  color: string;
  size: number;
  eraser: boolean;
  fillX?: number;
  fillY?: number;
  tool?: "pen" | "eraser" | "fill" | "line" | "arrow" | "rectangle" | "ellipse";
  opacity?: number;
  fillTolerance?: number;
}

export interface LiveDrawStroke {
  userId: string;
  points: Array<[number, number]>;
  color: string;
  size: number;
  eraser: boolean;
  tool?: "pen" | "eraser" | "line" | "arrow" | "rectangle" | "ellipse";
  opacity?: number;
}

export interface ServerToClientEvents {
  "state:sync": (state: CanvasState) => void;
  "element:added": (payload: ElementAddedPayload) => void;
  "element:updated": (payload: ElementUpdatedPayload) => void;
  "element:removed": (payload: ElementRemovedPayload) => void;
  "media:control": (payload: MediaControlPayload) => void;
  "cursor:move": (payload: CursorPayload) => void;
  "user:joined": (payload: UserPresencePayload) => void;
  "user:left": (payload: { userId: string }) => void;
  "users:list": (payload: UserPresencePayload[]) => void;
  "session:revoked": () => void;
  "session:role_updated": () => void;
  "overlay:refresh": () => void;
  "overlay:status": (payload: { connected: boolean; count: number }) => void;
  "draw:stroke": (stroke: DrawStroke) => void;
  "draw:clear": () => void;
  "draw:sync": (strokes: DrawStroke[]) => void;
  "draw:live": (stroke: LiveDrawStroke) => void;
  "dvd:settings": (settings: DvdCelebrationSettings) => void;
  "chat-emote:settings": (settings: ChatEmoteSettings) => void;
  "chat-emote:spawn": (spawn: ChatEmoteSpawn) => void;
  "studio:sync": (state: StudioState) => void;
  "history:status": (status: { canUndo: boolean; canRedo: boolean }) => void;
  "sound:play": (item: SoundboardItem & { playbackId?: string }) => void;
  "sound:stop": (payload: { id: string }) => void;
  "sound:pause": (payload: { id: string }) => void;
  "sound:resume": (payload: { id: string }) => void;
  "sound:volume": (payload: { id: string; volume: number }) => void;
  "tts:status": (state: TtsPlaybackState) => void;
  "features:updated": (flags: FeatureFlags) => void;
  "overlay:test-audio": (payload: { testId: string }) => void;
  "overlay:test-result": (payload: { testId: string; ok: boolean; error?: string }) => void;
  "chat:channel": (payload: { channel: string }) => void;
}

export interface ClientToServerEvents {
  "element:add": (payload: ElementAddedPayload) => void;
  "element:update": (payload: ElementUpdatedPayload) => void;
  "element:remove": (payload: ElementRemovedPayload) => void;
  "media:control": (payload: MediaControlPayload) => void;
  "media:ended": (payload: { id: string }) => void;
  "sound:ended": (payload: { playbackId: string; error?: string }) => void;
  "cursor:move": (payload: { x: number; y: number; showOnOverlay: boolean }) => void;
  "overlay:refresh": () => void;
  "overlay:test-audio": (payload: { testId: string }) => void;
  "overlay:test-result": (payload: { testId: string; ok: boolean; error?: string }) => void;
  "draw:stroke": (stroke: DrawStroke) => void;
  "draw:clear": () => void;
  "draw:live": (stroke: Omit<LiveDrawStroke, "userId">) => void;
  "dvd:settings": (settings: DvdCelebrationSettings) => void;
  "chat-emote:settings": (settings: ChatEmoteSettings) => void;
  "history:undo": () => void;
  "history:redo": () => void;
  "scene:save": (payload: { id: string; name: string }) => void;
  "scene:load": (payload: { id: string }) => void;
  "scene:delete": (payload: { id: string }) => void;
  "preset:save": (payload: { id: string; name: string; elementIds: string[] }) => void;
  "preset:load": (payload: { id: string }) => void;
  "preset:delete": (payload: { id: string }) => void;
  "sound:save": (item: SoundboardItem) => void;
  "sound:delete": (payload: { id: string }) => void;
  "sound:play": (payload: { id: string }) => void;
  "sound:stop": (payload: { id: string }) => void;
  "trigger:save": (trigger: OverlayTrigger) => void;
  "trigger:delete": (payload: { id: string }) => void;
  "chat:channel:set": (payload: { channel: string }) => void;
}
