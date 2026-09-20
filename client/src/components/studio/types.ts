import {
  type StudioState,
  type CanvasElement,
  type TtsPlaybackState,
  type FeatureFlags,
  type OverlayTrigger,
  type FlyDirection,
  type ChatEmoteSettings,
} from "../../types";
import type { Dispatch, SetStateAction } from "react";
import type { useToast } from "../ToastProvider";
import type { useConfirm } from "../ConfirmProvider";

export type Tab = "scenes" | "presets" | "sounds" | "triggers" | "emotes" | "tts";

export interface StudioPanelProps {
  studio: StudioState;
  elements: CanvasElement[];
  selectedIds: Set<string>;
  isOwner: boolean;
  overlayConnected: boolean;
  ttsPlayback: TtsPlaybackState;
  featureFlags: FeatureFlags;
  onClose: () => void;
  onSaveScene: (id: string, name: string) => void;
  onLoadScene: (id: string) => void;
  onDeleteScene: (id: string) => void;
  onSavePreset: (id: string, name: string, elementIds: string[]) => void;
  onLoadPreset: (id: string) => void;
  onDeletePreset: (id: string) => void;
  onSaveSound: (item: { id: string; name: string; url: string; volume: number }) => void;
  onDeleteSound: (id: string) => void;
  onPreviewSound: (id: string) => void;
  previewingSoundIds: string[];
  onStopPreviewSound: (id: string) => void;
  onPlaySound: (id: string) => void;
  onStopSound: (id: string) => void;
  onSaveTrigger: (trigger: OverlayTrigger) => void;
  onDeleteTrigger: (id: string) => void;
  onPreviewFly: (
    id: string,
    direction: FlyDirection,
    durationSeconds: number,
    onDone?: () => void,
  ) => (() => void) | null;
  chatEmoteSettings: ChatEmoteSettings;
  onChatEmoteSettingsChange: (settings: ChatEmoteSettings) => void;
}

/** State the shell of the Studio shares with every tab. */
export type StudioShell = {
  toast: ReturnType<typeof useToast>;
  confirm: ReturnType<typeof useConfirm>;
  tab: Tab;
  ttsEnabled: boolean;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  listSearch: string;
  setListSearch: Dispatch<SetStateAction<string>>;
};
