import type { useLayersServices } from "./useLayersServices";
import type { useLayerSelection } from "./useLayerSelection";
import type { useLayerAnimation } from "./useLayerAnimation";
import type { useSelectedLayerTools } from "./useSelectedLayerTools";
import type { useLayerList } from "./useLayerList";

/** Everything the parts of the ElementPanel share: what each hook returns. */
export type LayersContext = ReturnType<typeof useLayersServices> &
  ReturnType<typeof useLayerSelection> &
  ReturnType<typeof useLayerAnimation> &
  ReturnType<typeof useSelectedLayerTools> &
  ReturnType<typeof useLayerList>;
