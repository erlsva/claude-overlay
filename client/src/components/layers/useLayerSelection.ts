import type { ElementPanelProps } from "./types";

/** What is selected: the single selected layer and whether the selection can be grouped. */
export function useLayerSelection(props: ElementPanelProps) {
  const { elements, selectedIds } = props;
  const anyGrouped = [...selectedIds].some((id) => elements.find((e) => e.id === id)?.groupId);
  const canGroup = selectedIds.size >= 2;
  const selectedElement =
    selectedIds.size === 1 ? elements.find((element) => selectedIds.has(element.id)) : undefined;

  return { anyGrouped, canGroup, selectedElement };
}
