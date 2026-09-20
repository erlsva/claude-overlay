import { type CanvasElement } from "../../types";
import { type MutableRefObject, type ReactNode } from "react";
import { type DrawToolMode } from "../DrawingCanvas";

export interface ToolbarProps {
  onAdd: (element: CanvasElement) => void;
  mediaUploadRef?: MutableRefObject<((file: File) => Promise<void>) | null>;
  onSaveSound: (item: { id: string; name: string; url: string; volume: number }) => void;
  drawMode: boolean;
  onDrawModeToggle: () => void;
  drawColor: string;
  onDrawColorChange: (c: string) => void;
  drawSize: number;
  onDrawSizeChange: (s: number) => void;
  drawOpacity: number;
  onDrawOpacityChange: (opacity: number) => void;
  fillTolerance: number;
  onFillToleranceChange: (tolerance: number) => void;
  toolMode: DrawToolMode;
  onToolModeChange: (m: DrawToolMode) => void;
  onDrawClear: () => void;
  onSaveDrawingAsElement: () => void;
  hasStrokes: boolean;
  strokeCount: number;
  selectedElement?: CanvasElement;
  onElementChange: (id: string, changes: Partial<CanvasElement>) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Rendered at the far right of the tool row (live status chips). */
  trailing?: ReactNode;
}
