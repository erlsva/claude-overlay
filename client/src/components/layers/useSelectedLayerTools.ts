import { STREAM_W, STREAM_H, STREAM_OFFSET_X, STREAM_OFFSET_Y } from "../../canvas/config";
import { getDvdPosition, createDvdMotion } from "../../canvas/dvdMotion";
import type { ElementPanelProps } from "./types";
import type { useLayerSelection } from "./useLayerSelection";

/** Fit, fill, flip and DVD motion for the selected layer. */
export function useSelectedLayerTools(
  props: ElementPanelProps,
  deps: Pick<ReturnType<typeof useLayerSelection>, "selectedElement">,
) {
  const { onElementChange } = props;
  const { selectedElement } = deps;
  const fitSelectedToStream = (mode: "fit" | "fill") => {
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
      scaleX: 1,
      scaleY: 1,
      dvdEnabled: false,
    });
  };
  const toggleDvdMotion = () => {
    if (!selectedElement) return;
    if (selectedElement.dvdEnabled) {
      const position = getDvdPosition(selectedElement);
      onElementChange(selectedElement.id, {
        dvdEnabled: false,
        x: position.x,
        y: position.y,
      });
      return;
    }
    onElementChange(selectedElement.id, createDvdMotion(selectedElement));
  };
  const setDvdSpeed = (speed: number) => {
    if (
      !selectedElement?.dvdEnabled ||
      selectedElement.dvdVelocityX === undefined ||
      selectedElement.dvdVelocityY === undefined
    )
      return;
    const currentSpeed = Math.hypot(selectedElement.dvdVelocityX, selectedElement.dvdVelocityY);
    if (currentSpeed <= 0) return;
    const position = getDvdPosition(selectedElement);
    const factor = speed / currentSpeed;
    onElementChange(selectedElement.id, {
      x: position.x,
      y: position.y,
      dvdStartX: position.x,
      dvdStartY: position.y,
      dvdStartedAt: Date.now(),
      dvdVelocityX: selectedElement.dvdVelocityX * factor,
      dvdVelocityY: selectedElement.dvdVelocityY * factor,
    });
  };
  const dvdSpeed = selectedElement?.dvdEnabled
    ? Math.round(Math.hypot(selectedElement.dvdVelocityX ?? 0, selectedElement.dvdVelocityY ?? 0))
    : 0;
  const canFlipSelected =
    selectedElement && ["image", "gif", "video"].includes(selectedElement.type);
  const flipSelected = (axis: "x" | "y") => {
    if (!selectedElement || !canFlipSelected) return;
    onElementChange(
      selectedElement.id,
      axis === "x"
        ? { scaleX: -(selectedElement.scaleX ?? 1) }
        : { scaleY: -(selectedElement.scaleY ?? 1) },
    );
  };

  return {
    fitSelectedToStream,
    toggleDvdMotion,
    setDvdSpeed,
    dvdSpeed,
    canFlipSelected,
    flipSelected,
  };
}
