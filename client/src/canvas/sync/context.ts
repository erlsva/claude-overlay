import type { MutableRefObject } from "react";
import type { CanvasElement } from "../../types";
import type { CanvasStageProps } from "../../components/canvas-stage/types";

/** Everything the syncing functions share: the workspace, the node registries and the stage's callbacks. */
export interface SyncContext extends Pick<
  CanvasStageProps,
  | "onMediaControl"
  | "onElementChange"
  | "onElementDelete"
  | "onSelect"
  | "onEditText"
  | "previewFlyRef"
  | "directUpdateRef"
> {
  workspace: HTMLElement;
  elements: CanvasElement[];
  selectedIds: Set<string>;
  nodeMap: Map<string, HTMLElement>;
  mediaElMap: Map<string, HTMLMediaElement>;
  nodeMapRef: MutableRefObject<Map<string, HTMLElement>>;
  mediaElMapRef: MutableRefObject<Map<string, HTMLMediaElement>>;
  groupBoxMapRef: MutableRefObject<Map<string, HTMLElement>>;
  elementsRef: MutableRefObject<CanvasElement[]>;
  selectedIdsRef: MutableRefObject<Set<string>>;
  draggingRef: MutableRefObject<Set<string>>;
  dashboardAudioContextRef: MutableRefObject<AudioContext | null>;
  dashboardSilencedVideosRef: MutableRefObject<WeakSet<HTMLVideoElement>>;
  volumeCommitTimersRef: MutableRefObject<Map<string, number>>;
  snapXGuideRef: MutableRefObject<HTMLDivElement | null>;
  snapYGuideRef: MutableRefObject<HTMLDivElement | null>;
  getZoom: () => number;
}
