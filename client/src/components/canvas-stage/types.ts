/** What the canvas stage is given. */

import {
  type CanvasElement,
  type CursorPayload,
  type MediaControlPayload,
  type FlyDirection,
} from "../../types";

// ---------------------------------------------------------------------------
// Main dashboard canvas
// ---------------------------------------------------------------------------
export interface CanvasStageProps {
  elements: CanvasElement[];
  cursors?: Map<string, CursorPayload>;
  selectedIds: Set<string>;
  onSelect: (id: string | null, multi?: boolean) => void;
  onSelectMany: (ids: string[]) => void;
  onElementChange: (id: string, changes: Partial<CanvasElement>) => void;
  onElementDelete: (id: string) => void;
  onCursorMove?: (x: number, y: number) => void;
  onEditText?: (id: string) => void;
  onMediaControl?: (id: string, action: MediaControlPayload["action"], currentTime: number) => void;
  /** Ref populated with a function that applies incoming remote media:control events to this stage */
  mediaControlRef?: React.MutableRefObject<((payload: MediaControlPayload) => void) | null>;
  /** Ref populated with a function for direct DOM position updates, bypassing React state */
  directUpdateRef?: React.MutableRefObject<
    ((id: string, changes: Partial<CanvasElement>) => void) | null
  >;
  previewFlyRef?: React.MutableRefObject<
    | ((
        id: string,
        direction: FlyDirection,
        durationSeconds: number,
        onDone?: () => void,
      ) => (() => void) | null)
    | null
  >;
  showTwitchEmbed?: boolean;
  /** True while the player itself takes the mouse (play, pause, mute) and the canvas is paused. */
  twitchInteractionEnabled?: boolean;
  onTwitchInteractionChange?: (enabled: boolean) => void;
  twitchChannel?: string;
  drawingLayer?: React.ReactNode;
}
