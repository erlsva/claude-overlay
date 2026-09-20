import { type CanvasElement, type DvdCelebrationSettings } from "../../types";

/** The layers panel: what to show, and what to do with it. */
export interface ElementPanelProps {
  elements: CanvasElement[];
  selectedIds: Set<string>;
  onSelect: (id: string, multi: boolean) => void;
  onToggleVisible: (id: string) => void;
  onDelete: (id: string) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onElementChange: (id: string, changes: Partial<CanvasElement>) => void;
  onEditText: (id: string) => void;
  dvdCelebrationSettings: DvdCelebrationSettings;
  dvdSoundUploading: boolean;
  onDvdSettingsChange: (settings: DvdCelebrationSettings) => void;
  onDvdSoundUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  footer?: React.ReactNode;
}

/** The effect the animation buttons of a selected layer play. */
export type SelectedAnimation =
  | "slide-lr"
  | "slide-rl"
  | "slide-tb"
  | "slide-bt"
  | "bounce"
  | "float"
  | "sway"
  | "heartbeat"
  | "pulse"
  | "spin"
  | "shake";
