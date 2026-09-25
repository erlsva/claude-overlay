import { getDvdPosition } from "../../canvas/dvdMotion";
import type { ElementPanelProps } from "./types";
import type { useLayerSelection } from "./useLayerSelection";

/** The speed of the selected layer's DVD motion. */
export function useSelectedLayerTools(
  props: ElementPanelProps,
  deps: Pick<ReturnType<typeof useLayerSelection>, "selectedElement">,
) {
  const { onElementChange } = props;
  const { selectedElement } = deps;
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

  return { setDvdSpeed, dvdSpeed };
}
