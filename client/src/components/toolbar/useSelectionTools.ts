import { STREAM_W, STREAM_H, STREAM_OFFSET_X, STREAM_OFFSET_Y } from "../../canvas/config";
import { getDvdPosition, createDvdMotion } from "../../canvas/dvdMotion";
import type { ToolbarProps } from "./types";

/** Fit, fill, flip and DVD for the selected element. */
export function useSelectionTools(props: ToolbarProps) {
  const { selectedElement, onElementChange } = props;
  const fitSelected = (mode: "fit" | "fill") => {
    if (!selectedElement || selectedElement.width <= 0 || selectedElement.height <= 0) return;
    const factor =
      mode === "fit"
        ? Math.min(STREAM_W / selectedElement.width, STREAM_H / selectedElement.height)
        : Math.max(STREAM_W / selectedElement.width, STREAM_H / selectedElement.height);
    const width = selectedElement.width * factor;
    const height = selectedElement.height * factor;
    onElementChange(selectedElement.id, {
      x: STREAM_OFFSET_X + (STREAM_W - width) / 2,
      y: STREAM_OFFSET_Y + (STREAM_H - height) / 2,
      width,
      height,
      rotation: 0,
      scaleX: selectedElement.scaleX && selectedElement.scaleX < 0 ? -1 : 1,
      scaleY: selectedElement.scaleY && selectedElement.scaleY < 0 ? -1 : 1,
      dvdEnabled: false,
    });
  };
  const toggleDvd = () => {
    if (!selectedElement || selectedElement.type === "audio") return;
    if (selectedElement.dvdEnabled) {
      const position = getDvdPosition(selectedElement);
      onElementChange(selectedElement.id, { dvdEnabled: false, x: position.x, y: position.y });
      return;
    }
    onElementChange(selectedElement.id, createDvdMotion(selectedElement));
  };
  const flipSelected = (axis: "x" | "y") => {
    if (!selectedElement || !["image", "gif", "video"].includes(selectedElement.type)) return;
    onElementChange(
      selectedElement.id,
      axis === "x"
        ? { scaleX: -(selectedElement.scaleX ?? 1) }
        : { scaleY: -(selectedElement.scaleY ?? 1) },
    );
  };

  return { fitSelected, toggleDvd, flipSelected };
}
